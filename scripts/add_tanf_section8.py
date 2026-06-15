"""
Add TANF and Section 8 programs to BenefitsIQ's Unity Catalog tables.
No SQLite needed — inserts directly via the SQL Statement Execution API.

Run AFTER the original uc_load.py has loaded the base 6 programs.
Idempotent: skips if TANF/SECTION8 already exist.

Usage: python3 scripts/add_tanf_section8.py
"""

import json
import subprocess
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"


def _api(method, path, body=None):
    cmd = ["databricks", "api", method, path, "--profile", PROFILE]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise RuntimeError(f"api {method} {path} failed: {out.stderr[:400]}")
    return json.loads(out.stdout) if out.stdout.strip() else {}


def run_sql(stmt):
    body = {
        "warehouse_id": WAREHOUSE,
        "statement": stmt,
        "wait_timeout": "50s",
        "on_wait_timeout": "CONTINUE",
        "catalog": CATALOG,
        "schema": SCHEMA,
    }
    res = _api("post", "/api/2.0/sql/statements/", body)
    sid = res.get("statement_id")
    state = (res.get("status") or {}).get("state")
    for _ in range(60):
        if state in ("SUCCEEDED", "FAILED", "CANCELED", "CLOSED"):
            break
        time.sleep(3)
        res = _api("get", f"/api/2.0/sql/statements/{sid}")
        state = (res.get("status") or {}).get("state")
    if state != "SUCCEEDED":
        err = (res.get("status") or {}).get("error", {})
        raise RuntimeError(f"SQL not SUCCEEDED ({state}): {str(err)[:300]}")
    return res


def main():
    # 1) Check what programs already exist
    print("Checking existing programs...")
    res = run_sql("SELECT short_name FROM programs")
    existing = set()
    for chunk in res.get("result", {}).get("data_array") or []:
        if chunk:
            existing.add(chunk[0])
    print(f"  Found: {existing}")

    # 2) Get the next available ID
    res = run_sql("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM programs")
    next_id = int((res.get("result", {}).get("data_array") or [[7]])[0][0])

    # 3) Insert TANF if missing
    if "TANF" not in existing:
        tanf_id = next_id
        next_id += 1
        print(f"  Inserting TANF (id={tanf_id})...")
        run_sql(
            f"""
            INSERT INTO programs (id, name, short_name, category, description, admin_agency)
            VALUES ({tanf_id}, 'Temporary Assistance for Needy Families', 'TANF', 'cash_assistance',
                    'Cash assistance for families with dependent children', 'HHS Administration for Children and Families')
        """
        )

        # Eligibility rules: TANF uses FPL% (varies by state, generally low)
        # GA=30%, CA=48%, TX=17%, NY=50%, FL=24%, federal fallback=50%
        rules = [
            ("GA", 0.30, "Georgia TANF: 30% FPL limit"),
            ("CA", 0.48, "California CalWORKs: 48% FPL limit"),
            ("TX", 0.17, "Texas TANF: 17% FPL limit (among lowest in U.S.)"),
            ("NY", 0.50, "New York TANF: 50% FPL limit"),
            ("FL", 0.24, "Florida TANF: 24% FPL limit"),
            (
                None,
                0.50,
                "Federal TANF guideline: ~50% FPL (states set own thresholds)",
            ),
        ]
        # Get next rule ID
        res = run_sql(
            "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM eligibility_rules"
        )
        rule_id = int((res.get("result", {}).get("data_array") or [[500]])[0][0])

        for state, pct, notes in rules:
            state_val = f"'{state}'" if state else "NULL"
            run_sql(
                f"""
                INSERT INTO eligibility_rules (id, program_id, state, household_size, max_gross_monthly, max_net_monthly, max_pct_fpl, categorical_eligible, notes)
                VALUES ({rule_id}, {tanf_id}, {state_val}, NULL, NULL, NULL, {pct}, false, '{notes}')
            """
            )
            rule_id += 1
        print("  TANF + rules inserted ✓")
    else:
        print("  TANF already exists, skipping.")

    # 4) Insert SECTION8 if missing
    if "SECTION8" not in existing:
        s8_id = next_id
        print(f"  Inserting SECTION8 (id={s8_id})...")
        run_sql(
            f"""
            INSERT INTO programs (id, name, short_name, category, description, admin_agency)
            VALUES ({s8_id}, 'Housing Choice Voucher (Section 8)', 'SECTION8', 'housing',
                    'Rental assistance vouchers for low-income families', 'HUD Office of Public and Indian Housing')
        """
        )

        # Section 8 eligibility: 50% of Area Median Income. We approximate as 50% FPL
        # since AMI data is not in our current dataset.
        rules = [
            ("GA", 0.50, "Georgia Section 8: income below 50% AMI (approx 50% FPL)"),
            ("CA", 0.50, "California Section 8: income below 50% AMI (approx 50% FPL)"),
            ("TX", 0.50, "Texas Section 8: income below 50% AMI (approx 50% FPL)"),
            ("NY", 0.50, "New York Section 8: income below 50% AMI (approx 50% FPL)"),
            ("FL", 0.50, "Florida Section 8: income below 50% AMI (approx 50% FPL)"),
            (None, 0.50, "Federal Section 8 guideline: income below 50% AMI"),
        ]
        res = run_sql(
            "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM eligibility_rules"
        )
        rule_id = int((res.get("result", {}).get("data_array") or [[600]])[0][0])

        for state, pct, notes in rules:
            state_val = f"'{state}'" if state else "NULL"
            run_sql(
                f"""
                INSERT INTO eligibility_rules (id, program_id, state, household_size, max_gross_monthly, max_net_monthly, max_pct_fpl, categorical_eligible, notes)
                VALUES ({rule_id}, {s8_id}, {state_val}, NULL, NULL, NULL, {pct}, false, '{notes}')
            """
            )
            rule_id += 1
        print("  SECTION8 + rules inserted ✓")
    else:
        print("  SECTION8 already exists, skipping.")

    # 5) Add apply_kb entries for TANF and SECTION8
    print("\nAdding how-to-apply KB entries...")
    res = run_sql("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM apply_kb")
    kb_id = int((res.get("result", {}).get("data_array") or [[200]])[0][0])

    # Check existing KB programs
    res = run_sql("SELECT DISTINCT program_short FROM apply_kb")
    kb_programs = set()
    for chunk in res.get("result", {}).get("data_array") or []:
        if chunk:
            kb_programs.add(chunk[0])

    if "TANF" not in kb_programs:
        tanf_kb = [
            (
                kb_id,
                "TANF",
                "Where to Apply for TANF",
                "Apply for TANF through your state or county Department of Social Services, Department of Human Services, or equivalent agency. Many states accept online applications. You can also apply in person at your local office. Processing typically takes 30-45 days.",
                "HHS ACF — TANF Program",
                "https://www.acf.hhs.gov/ofa/programs/tanf",
            ),
            (
                kb_id + 1,
                "TANF",
                "TANF Documents Needed",
                "To apply for TANF you typically need: proof of identity (driver''s license, state ID, or birth certificate), Social Security numbers for all household members, proof of income (pay stubs, employer letter, or self-employment records), proof of residence (utility bill, lease agreement), and proof of assets (bank statements). Requirements vary by state.",
                "HHS ACF — TANF Eligibility",
                "https://www.acf.hhs.gov/ofa/programs/tanf/about",
            ),
            (
                kb_id + 2,
                "TANF",
                "TANF Time Limits and Work Requirements",
                "Federal TANF has a 60-month (5-year) lifetime limit on cash assistance, though some states set shorter limits. Most adult recipients must participate in work activities within 24 months. Work activities include employment, job search, community service, education, and job training. States may exempt certain individuals (e.g., those with disabilities or caring for very young children).",
                "HHS ACF — TANF Work Requirements",
                "https://www.acf.hhs.gov/ofa/policy-guidance/tanf-acf-im-2012-03",
            ),
        ]
        for row in tanf_kb:
            run_sql(
                f"""
                INSERT INTO apply_kb (id, program_short, title, chunk_text, source_name, source_url)
                VALUES ({row[0]}, '{row[1]}', '{row[2]}', '{row[3]}', '{row[4]}', '{row[5]}')
            """
            )
        kb_id += 3
        print("  TANF KB entries inserted ✓")

    if "SECTION8" not in kb_programs:
        s8_kb = [
            (
                kb_id,
                "SECTION8",
                "Where to Apply for Section 8",
                "Apply for Section 8 Housing Choice Vouchers through your local Public Housing Agency (PHA), not directly through HUD. Find your local PHA at hud.gov/program_offices/public_indian_housing/pha/contacts. Most PHAs have waiting lists that open periodically — check with your local PHA for the next open enrollment period.",
                "HUD — Housing Choice Voucher Fact Sheet",
                "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
            ),
            (
                kb_id + 1,
                "SECTION8",
                "Section 8 Waiting Lists and Preferences",
                "Section 8 waiting lists can be months to years long depending on your area. Many PHAs give preference to families that are homeless, living in substandard housing, paying more than 50% of income for rent, or involuntarily displaced. When your name comes up, the PHA will contact you to verify eligibility and issue a voucher.",
                "HUD — Voucher Program Guidebook",
                "https://www.hud.gov/program_offices/public_indian_housing/programs/hcv/about",
            ),
            (
                kb_id + 2,
                "SECTION8",
                "How Section 8 Vouchers Work",
                "With a Section 8 voucher, you find your own housing in the private market. The landlord must agree to participate and the unit must pass a HUD inspection. You pay about 30% of your adjusted monthly income toward rent, and the voucher covers the rest up to the local payment standard. You will need: proof of identity, Social Security numbers, birth certificates, income verification, and references from prior landlords.",
                "HUD — Housing Choice Voucher Fact Sheet",
                "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
            ),
        ]
        for row in s8_kb:
            run_sql(
                f"""
                INSERT INTO apply_kb (id, program_short, title, chunk_text, source_name, source_url)
                VALUES ({row[0]}, '{row[1]}', '{row[2]}', '{row[3]}', '{row[4]}', '{row[5]}')
            """
            )
        print("  SECTION8 KB entries inserted ✓")

    print("\n✅ Done. TANF and Section 8 are now in Unity Catalog.")
    print(
        "   Next: run 'python scripts/uc_sync.py' or wait for the existing sync to pick up changes."
    )
    print("   The synced tables in Lakebase will update automatically (SNAPSHOT mode).")


if __name__ == "__main__":
    main()

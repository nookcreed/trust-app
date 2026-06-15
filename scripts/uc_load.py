"""
Land BenefitsIQ's curated data into Unity Catalog Delta tables via the SQL Statement
Execution API (Serverless Starter Warehouse). Source = our local SQLite.

These UC Delta tables are then synced into Lakebase (next step) per the DevHub
"Hackathon App with Synced Dataset" recipe.

Usage: python3 scripts/uc_load.py [--cohorts]
"""

import json
import sqlite3
import subprocess
import sys
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"
SQLITE = "data/db/benefitsiq.db"


def _api(method, path, body=None):
    cmd = ["databricks", "api", method, path, "--profile", PROFILE]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise RuntimeError(f"api {method} {path} failed: {out.stderr[:400]}")
    return json.loads(out.stdout) if out.stdout.strip() else {}


def run_sql(stmt, catalog=None, schema=None):
    body = {
        "warehouse_id": WAREHOUSE,
        "statement": stmt,
        "wait_timeout": "50s",
        "on_wait_timeout": "CONTINUE",
    }
    if catalog:
        body["catalog"] = catalog
    if schema:
        body["schema"] = schema
    res = _api("post", "/api/2.0/sql/statements/", body)
    sid = res.get("statement_id")
    state = (res.get("status") or {}).get("state")
    # poll until terminal
    for _ in range(60):
        if state in ("SUCCEEDED", "FAILED", "CANCELED", "CLOSED"):
            break
        time.sleep(3)
        res = _api("get", f"/api/2.0/sql/statements/{sid}")
        state = (res.get("status") or {}).get("state")
    if state != "SUCCEEDED":
        err = (res.get("status") or {}).get("error", {})
        raise RuntimeError(
            f"SQL not SUCCEEDED ({state}): {str(err)[:300]}\n  stmt: {stmt[:120]}"
        )
    return res


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def insert_rows(table, cols, rows, batch=400):
    coltxt = ", ".join(cols)
    for i in range(0, len(rows), batch):
        chunk = rows[i : i + batch]
        values = ",\n".join(
            "(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in chunk
        )
        run_sql(f"INSERT INTO {table} ({coltxt}) VALUES\n{values}", CATALOG, SCHEMA)
        print(f"    inserted {min(i+batch, len(rows))}/{len(rows)} into {table}")


def main():
    do_cohorts = "--cohorts" in sys.argv
    con = sqlite3.connect(SQLITE)
    con.row_factory = sqlite3.Row

    print("1) catalog + schema")
    run_sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

    print("2) programs")
    run_sql(
        "CREATE OR REPLACE TABLE programs (id INT, name STRING, short_name STRING, "
        "category STRING, description STRING, admin_agency STRING) "
        "TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )
    prog = [
        dict(r)
        for r in con.execute(
            "SELECT id,name,short_name,category,description,admin_agency FROM programs"
        )
    ]
    # Append TANF and SECTION8 if not already in the SQLite source.
    # "Adding a program is adding data, not code."
    existing_shorts = {p["short_name"] for p in prog}
    next_id = max((p["id"] for p in prog), default=0) + 1
    if "TANF" not in existing_shorts:
        prog.append(
            {
                "id": next_id,
                "name": "Temporary Assistance for Needy Families",
                "short_name": "TANF",
                "category": "cash_assistance",
                "description": "Federal block grant providing cash assistance to low-income families with dependent children.",
                "admin_agency": "HHS ACF",
            }
        )
        next_id += 1
    if "SECTION8" not in existing_shorts:
        prog.append(
            {
                "id": next_id,
                "name": "Section 8 Housing Choice Voucher",
                "short_name": "SECTION8",
                "category": "housing",
                "description": "Federal rental assistance voucher covering the gap between 30% of tenant income and Fair Market Rent.",
                "admin_agency": "HUD",
            }
        )
    insert_rows(
        "programs",
        ["id", "name", "short_name", "category", "description", "admin_agency"],
        prog,
    )

    print("3) fpl_thresholds")
    run_sql(
        "CREATE OR REPLACE TABLE fpl_thresholds (id INT, year INT, household_size INT, "
        "annual_amount DOUBLE, region STRING) "
        "TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )
    fpl = [
        dict(r)
        for r in con.execute(
            "SELECT id,year,household_size,annual_amount,region FROM fpl_thresholds"
        )
    ]
    insert_rows(
        "fpl_thresholds",
        ["id", "year", "household_size", "annual_amount", "region"],
        fpl,
    )

    print("4) eligibility_rules")
    run_sql(
        "CREATE OR REPLACE TABLE eligibility_rules (id INT, program_id INT, state STRING, "
        "household_size INT, max_gross_monthly DOUBLE, max_net_monthly DOUBLE, "
        "max_pct_fpl DOUBLE, categorical_eligible BOOLEAN, notes STRING) "
        "TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )
    rules = [
        dict(r)
        for r in con.execute(
            "SELECT id,program_id,state,household_size,max_gross_monthly,max_net_monthly,"
            "max_pct_fpl,categorical_eligible,notes FROM eligibility_rules"
        )
    ]
    # Append TANF and SECTION8 eligibility rules for 5 states + federal fallback.
    # TANF: ~50% FPL general guideline (states set much lower thresholds in practice).
    # SECTION8: ~50% FPL (approximating 50% AMI since AMI data is unavailable).
    tanf_id = next((p["id"] for p in prog if p["short_name"] == "TANF"), None)
    s8_id = next((p["id"] for p in prog if p["short_name"] == "SECTION8"), None)
    rule_id = max((r["id"] for r in rules), default=0) + 1
    if tanf_id is not None:
        # TANF rules: state-specific income thresholds expressed as %FPL.
        # Source: ACF TANF Financial Data FY2023 & state policy manuals.
        tanf_states = [
            # (state, max_pct_fpl, notes)
            ("GA", 0.30, "GA TANF limit ~30% FPL for families with children."),
            ("CA", 0.48, "CalWORKs (CA TANF) limit ~48% FPL."),
            ("TX", 0.17, "TX TANF has very restrictive income limits (~17% FPL)."),
            ("NY", 0.50, "NY TANF limit ~50% FPL."),
            ("FL", 0.24, "FL TANF limit ~24% FPL."),
            (
                None,
                0.50,
                "Federal TANF guideline ~50% FPL (states set lower thresholds).",
            ),
        ]
        for st, pct, note in tanf_states:
            rules.append(
                {
                    "id": rule_id,
                    "program_id": tanf_id,
                    "state": st,
                    "household_size": None,
                    "max_gross_monthly": None,
                    "max_net_monthly": None,
                    "max_pct_fpl": pct,
                    "categorical_eligible": False,
                    "notes": note,
                }
            )
            rule_id += 1
    if s8_id is not None:
        # Section 8 rules: income must be below 50% of Area Median Income.
        # We approximate as 50% FPL since AMI data is not in our dataset.
        # Source: HUD Housing Choice Voucher Fact Sheet.
        s8_states = [
            ("GA", 0.50, "Section 8 income limit ~50% AMI (approx 50% FPL)."),
            (
                "CA",
                0.50,
                "Section 8 income limit ~50% AMI (approx 50% FPL). High-cost area — actual subsidy may be higher.",
            ),
            ("TX", 0.50, "Section 8 income limit ~50% AMI (approx 50% FPL)."),
            (
                "NY",
                0.50,
                "Section 8 income limit ~50% AMI (approx 50% FPL). NYC metro FMR is among the highest in the U.S.",
            ),
            ("FL", 0.50, "Section 8 income limit ~50% AMI (approx 50% FPL)."),
            (None, 0.50, "Federal Section 8 income limit: 50% of Area Median Income."),
        ]
        for st, pct, note in s8_states:
            rules.append(
                {
                    "id": rule_id,
                    "program_id": s8_id,
                    "state": st,
                    "household_size": None,
                    "max_gross_monthly": None,
                    "max_net_monthly": None,
                    "max_pct_fpl": pct,
                    "categorical_eligible": False,
                    "notes": note,
                }
            )
            rule_id += 1
    insert_rows(
        "eligibility_rules",
        [
            "id",
            "program_id",
            "state",
            "household_size",
            "max_gross_monthly",
            "max_net_monthly",
            "max_pct_fpl",
            "categorical_eligible",
            "notes",
        ],
        rules,
    )

    if do_cohorts:
        print("5) cohort_stats (3k rows)")
        run_sql(
            "CREATE OR REPLACE TABLE cohort_stats (id INT, state STRING, household_band STRING, "
            "income_band STRING, situation STRING, programs_typical STRING, typical_apply_order STRING, "
            "avg_processing_days INT, expedited_pct DOUBLE, modeled_n INT, source_citation STRING, "
            "source_url STRING, effective_date STRING) "
            "TBLPROPERTIES (delta.enableChangeDataFeed = true)",
            CATALOG,
            SCHEMA,
        )
        coh = []
        for r in con.execute("SELECT * FROM cohort_stats"):
            d = dict(r)
            for jc in ("programs_typical", "typical_apply_order"):
                if isinstance(d.get(jc), str):
                    pass  # already JSON text in sqlite
            coh.append(d)
        cols = [
            "id",
            "state",
            "household_band",
            "income_band",
            "situation",
            "programs_typical",
            "typical_apply_order",
            "avg_processing_days",
            "expedited_pct",
            "modeled_n",
            "source_citation",
            "source_url",
            "effective_date",
        ]
        insert_rows("cohort_stats", cols, coh)

    print("\nDONE. Verifying counts:")
    for t in ["programs", "fpl_thresholds", "eligibility_rules"] + (
        ["cohort_stats"] if do_cohorts else []
    ):
        res = run_sql(f"SELECT COUNT(*) AS n FROM {t}", CATALOG, SCHEMA)
        n = res.get("result", {}).get("data_array", [["?"]])[0][0]
        print(f"  {CATALOG}.{SCHEMA}.{t}: {n} rows")


if __name__ == "__main__":
    main()

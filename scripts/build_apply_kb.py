"""
Build the "How to Apply" RAG knowledge base for BenefitsIQ.

This is the procedural / how-to knowledge that powers a genuine retrieval-augmented
helper ("How do I apply for SNAP in Georgia?"). Eligibility stays deterministic
(see eligibility_rules); RAG is used here only for the RIGHT job: composing grounded,
cited, step-by-step application guidance from a small curated, citation-backed corpus.

Pipeline (mirrors uc_load.py + uc_sync.py):
  1. CREATE the UC Delta table benefitsiq.app.apply_kb (CDF enabled) and INSERT chunks.
  2. SNAPSHOT-sync it into Lakebase as public.apply_kb (read at runtime via OBO).
  3. (GUARDED, --embed only) Optionally add embeddings + a vector index for
     semantic retrieval. This requires external network / a live embedding endpoint
     and is therefore NOT run by default — the shipped retrieval path in
     server/routes/apply.ts is pure-Postgres lexical search over public.apply_kb and
     needs none of this.

Usage:
  python3 scripts/build_apply_kb.py          # load Delta + create synced table
  python3 scripts/build_apply_kb.py --embed  # (later, on a networked machine) add embeddings/index

Every chunk is citation-backed (source_name + real agency source_url). Content is
limited to well-known public agency guidance; no facts are invented.
"""

import json
import subprocess
import sys
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"

# Lakebase sync config (mirror uc_sync.py)
BRANCH = "projects/benefitsiq/branches/production"
LB_CATALOG = "benefitsiq_lb"
STORAGE_SCHEMA = "pipelines"
KB_TABLE = "apply_kb"

# Embedding config (only used by the GUARDED --embed path).
EMBED_ENDPOINT = "databricks-gte-large-en"  # 1024-dim
EMBED_DIM = 1024


# --------------------------------------------------------------------------- #
# SQL Statement Execution API helpers (same pattern as uc_load.py)
# --------------------------------------------------------------------------- #
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


def insert_rows(table, cols, rows, batch=200):
    coltxt = ", ".join(cols)
    for i in range(0, len(rows), batch):
        chunk = rows[i : i + batch]
        values = ",\n".join(
            "(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in chunk
        )
        run_sql(f"INSERT INTO {table} ({coltxt}) VALUES\n{values}", CATALOG, SCHEMA)
        print(f"    inserted {min(i + batch, len(rows))}/{len(rows)} into {table}")


def cli(args, body=None):
    cmd = ["databricks"] + args + ["--profile", PROFILE]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180)


# --------------------------------------------------------------------------- #
# Curated, citation-backed "how to apply" knowledge base.
# Each chunk: short, procedural, public agency guidance only. source_url is a real
# agency page. Keep ~3-5 chunks per program x 6 programs.
# --------------------------------------------------------------------------- #
def _kb_chunks():
    """Return list of dicts (without id); id is assigned sequentially below."""
    snap = "https://www.fns.usda.gov/snap/recipient/eligibility"
    snap_apply = "https://www.fns.usda.gov/snap/state-directory"
    raw = [
        # ---------------- SNAP ----------------
        (
            "SNAP",
            "Where to apply for SNAP",
            "SNAP (food assistance) is administered by each state, so you apply through "
            "your state's SNAP/human-services agency, not the federal government. Most "
            "states offer an online application portal; you can also apply in person at a "
            "local office, by mail, or by fax. Use the USDA state directory to find your "
            "state's application site and local office.",
            "USDA FNS — SNAP State Directory",
            snap_apply,
        ),
        (
            "SNAP",
            "Documents needed to apply for SNAP",
            "When you apply for SNAP, be ready to verify identity, household income (pay "
            "stubs or an employer statement), housing and utility costs, and immigration "
            "status for non-citizen household members. You can usually start the "
            "application before you have every document and submit verification afterward.",
            "USDA FNS — SNAP Eligibility",
            snap,
        ),
        (
            "SNAP",
            "SNAP timeline and the interview",
            "States must process a regular SNAP application within 30 days of the date you "
            "submit it. Nearly all applicants must complete an eligibility interview "
            "(often by phone). Submitting your application right away starts the clock even "
            "if you still owe verification documents.",
            "USDA FNS — SNAP Eligibility",
            snap,
        ),
        (
            "SNAP",
            "Expedited (emergency) SNAP in 7 days",
            "If your household has very low income and few resources (for example, under "
            "$150 in monthly gross income and under $100 in liquid resources, or your rent "
            "plus utilities exceeds your income and resources), you may qualify for "
            "expedited SNAP and receive benefits within 7 days. Tell your state office you "
            "have little or no income when you apply.",
            "USDA FNS — SNAP Eligibility",
            snap,
        ),
        # ---------------- MEDICAID ----------------
        (
            "MEDICAID",
            "Where to apply for Medicaid",
            "You can apply for Medicaid in two ways at any time of year: directly through "
            "your state Medicaid agency, or through the Health Insurance Marketplace at "
            "HealthCare.gov, which forwards your information to your state if you appear "
            "eligible. There is no limited enrollment window for Medicaid.",
            "Medicaid.gov — How to Apply",
            "https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip/index.html",
        ),
        (
            "MEDICAID",
            "Information needed for a Medicaid application",
            "A Medicaid application generally asks for household size, income, Social "
            "Security numbers, and citizenship or immigration status for applicants. "
            "Eligibility for most adults and children is based on Modified Adjusted Gross "
            "Income (MAGI).",
            "Medicaid.gov — Eligibility",
            "https://www.medicaid.gov/medicaid/eligibility/index.html",
        ),
        (
            "MEDICAID",
            "Medicaid coverage timing",
            "If you are found eligible, Medicaid coverage can begin promptly and may be "
            "backdated to cover medical bills incurred in the three months before you "
            "applied, if you were eligible during that time. Ask your state agency about "
            "retroactive coverage.",
            "Medicaid.gov — Eligibility",
            "https://www.medicaid.gov/medicaid/eligibility/index.html",
        ),
        # ---------------- CHIP ----------------
        (
            "CHIP",
            "Where to apply for CHIP",
            "The Children's Health Insurance Program (CHIP) covers children in families "
            "that earn too much for Medicaid but cannot afford private coverage. Apply any "
            "time through your state agency or HealthCare.gov, or call 1-800-318-2596. A "
            "single application is screened for both Medicaid and CHIP.",
            "InsureKidsNow.gov — How to Apply",
            "https://www.insurekidsnow.gov/coverage/index.html",
        ),
        (
            "CHIP",
            "What CHIP covers and what to bring",
            "CHIP covers routine check-ups, immunizations, doctor visits, dental and "
            "vision care, prescriptions, and emergency services. To apply, have each "
            "child's date of birth, household income, and household size ready.",
            "InsureKidsNow.gov — Coverage",
            "https://www.insurekidsnow.gov/coverage/index.html",
        ),
        (
            "CHIP",
            "CHIP enrollment is open year-round",
            "Unlike Marketplace private plans, you can apply for and enroll in CHIP at any "
            "time of year — there is no limited open-enrollment period. If your children "
            "qualify, coverage can start without waiting for an enrollment window.",
            "InsureKidsNow.gov — How to Apply",
            "https://www.insurekidsnow.gov/coverage/index.html",
        ),
        # ---------------- WIC ----------------
        (
            "WIC",
            "Where to apply for WIC",
            "WIC serves pregnant and postpartum people, infants, and children under 5. "
            "You apply by contacting your state or local WIC agency to schedule an "
            "appointment at a WIC clinic; applications are handled locally, not online "
            "federally. Use the USDA 'How to Apply for WIC' page to find your state agency.",
            "USDA FNS — How to Apply for WIC",
            "https://www.fns.usda.gov/wic/how-apply",
        ),
        (
            "WIC",
            "What to bring to your WIC appointment",
            "Bring proof of identity, proof of address, and proof of income (or proof you "
            "already receive SNAP, Medicaid, or TANF, which can make you income-eligible "
            "for WIC). The applicant — the parent/caregiver and the child or pregnant "
            "person — should attend so staff can do a short health and nutrition screening.",
            "USDA FNS — How to Apply for WIC",
            "https://www.fns.usda.gov/wic/how-apply",
        ),
        (
            "WIC",
            "WIC automatic (adjunctive) income eligibility",
            "If you or your child already participate in SNAP, Medicaid, or TANF, you are "
            "generally automatically income-eligible for WIC. Mention this when you call "
            "to apply, and bring proof of that enrollment to your appointment.",
            "USDA FNS — WIC Eligibility Requirements",
            "https://www.fns.usda.gov/wic/wic-eligibility-requirements",
        ),
        # ---------------- LIHEAP ----------------
        (
            "LIHEAP",
            "Where to apply for LIHEAP energy assistance",
            "LIHEAP helps with home heating and cooling bills and is run by state, "
            "tribal, and territorial agencies. Find and apply through your local LIHEAP "
            "office; you can locate it by calling the National Energy Assistance Referral "
            "(NEAR) line at 1-866-674-6327 or using the HHS LIHEAP map.",
            "HHS ACF — Get LIHEAP Help",
            "https://www.acf.hhs.gov/ocs/programs/liheap/consumer-resources",
        ),
        (
            "LIHEAP",
            "Documents needed for LIHEAP",
            "LIHEAP applications typically ask for a recent energy bill, proof of income "
            "for the household, proof of identity, and Social Security numbers for "
            "household members. Requirements and benefit amounts vary by state.",
            "HHS ACF — LIHEAP Consumer Resources",
            "https://www.acf.hhs.gov/ocs/programs/liheap/consumer-resources",
        ),
        (
            "LIHEAP",
            "LIHEAP crisis assistance and seasons",
            "Many states run separate heating (winter) and cooling (summer) program "
            "seasons with limited funds, so apply early when an enrollment period opens. If "
            "your power is shut off or about to be, ask your LIHEAP office about crisis or "
            "emergency assistance, which is handled faster.",
            "HHS ACF — Get LIHEAP Help",
            "https://www.acf.hhs.gov/ocs/programs/liheap/consumer-resources",
        ),
        # ---------------- NSLP (school meals) ----------------
        (
            "NSLP",
            "How to apply for free or reduced-price school meals",
            "Free and reduced-price meals through the National School Lunch Program are "
            "requested through your child's school or district, not a federal site. Submit "
            "a household application to the school; you can apply at any point during the "
            "school year, including right after a change in income.",
            "USDA FNS — National School Lunch Program",
            "https://www.fns.usda.gov/nslp",
        ),
        (
            "NSLP",
            "Direct certification and automatic eligibility",
            "Children in households that receive SNAP, TANF, or (in many states) Medicaid "
            "are often 'directly certified' and qualify for free school meals without a "
            "separate application. If your school did not already enroll your child, submit "
            "a meal application listing your case number.",
            "USDA FNS — National School Lunch Program",
            "https://www.fns.usda.gov/nslp",
        ),
        (
            "NSLP",
            "Community eligibility — some schools are free for all",
            "Schools in low-income areas may use the Community Eligibility Provision (CEP) "
            "to serve free meals to all enrolled students with no application required. Ask "
            "your school whether it participates in CEP before filling out a meal form.",
            "USDA FNS — Community Eligibility Provision",
            "https://www.fns.usda.gov/cn/community-eligibility-provision",
        ),
        # ---------------- TANF (cash assistance) ----------------
        (
            "TANF",
            "Where to apply for TANF cash assistance",
            "TANF (Temporary Assistance for Needy Families) provides cash assistance to "
            "low-income families with dependent children. Apply through your state or county "
            "human services office. Most states allow online, in-person, or mail applications. "
            "Each state runs its own TANF program under a different name (e.g., CalWORKs in "
            "California, Georgia TANF in Georgia). Contact your local office or call 211.",
            "HHS ACF — TANF",
            "https://www.acf.hhs.gov/ofa/programs/tanf",
        ),
        (
            "TANF",
            "Documents needed to apply for TANF",
            "When applying for TANF, you typically need proof of identity, Social Security "
            "numbers for all household members, proof of income (pay stubs, employer letter, "
            "or proof of zero income), proof of residency, and birth certificates for "
            "children in the household. Requirements vary by state.",
            "HHS ACF — TANF",
            "https://www.acf.hhs.gov/ofa/programs/tanf",
        ),
        (
            "TANF",
            "TANF time limits and work requirements",
            "Federal TANF has a 60-month (5-year) lifetime limit on cash assistance, though "
            "some states set shorter limits. Most adults must participate in work activities "
            "(job search, training, or community service) within a certain number of months "
            "of receiving benefits. States may exempt some individuals, such as those with "
            "very young children or documented disabilities.",
            "HHS ACF — TANF Work Requirements",
            "https://www.acf.hhs.gov/ofa/policy-guidance/tanf-acf-im-2024-02",
        ),
        # ---------------- SECTION 8 (Housing Choice Voucher) ----------------
        (
            "SECTION8",
            "Where to apply for Section 8 Housing Choice Vouchers",
            "Section 8 Housing Choice Vouchers are administered by local Public Housing "
            "Agencies (PHAs). Apply directly through your local PHA — not HUD. You can find "
            "your local PHA using HUD's PHA Contact Information page or by calling your "
            "local housing authority. Many PHAs have online applications; some require "
            "in-person visits.",
            "HUD — Housing Choice Voucher Fact Sheet",
            "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
        ),
        (
            "SECTION8",
            "Section 8 waiting lists and preferences",
            "Demand for Section 8 vouchers far exceeds supply in most areas, so waiting "
            "lists are common and can be years long. Many PHAs close their waiting lists "
            "periodically. When they open, apply immediately. Some PHAs give preferences "
            "to veterans, families experiencing homelessness, or people with disabilities.",
            "HUD — Housing Choice Voucher Fact Sheet",
            "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
        ),
        (
            "SECTION8",
            "Documents needed for Section 8 and how the voucher works",
            "To apply, you need proof of identity, Social Security numbers, birth "
            "certificates, proof of income, and current landlord information. Once approved, "
            "you receive a voucher and find a qualifying rental unit. The PHA pays the "
            "landlord the difference between 30% of your adjusted income and the local Fair "
            "Market Rent. You pay the rest directly to the landlord.",
            "HUD — Housing Choice Voucher Fact Sheet",
            "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
        ),
    ]
    rows = []
    for i, (prog, title, text, name, url) in enumerate(raw, start=1):
        rows.append(
            {
                "id": i,
                "program_short": prog,
                "title": title,
                "chunk_text": text,
                "source_name": name,
                "source_url": url,
            }
        )
    return rows


# --------------------------------------------------------------------------- #
# Step 1: UC Delta table
# --------------------------------------------------------------------------- #
def load_delta():
    rows = _kb_chunks()
    print("1) catalog + schema")
    run_sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

    print(f"2) {KB_TABLE} ({len(rows)} chunks)")
    run_sql(
        f"CREATE OR REPLACE TABLE {KB_TABLE} ("
        "id INT, program_short STRING, title STRING, chunk_text STRING, "
        "source_name STRING, source_url STRING) "
        "TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )
    insert_rows(
        KB_TABLE,
        ["id", "program_short", "title", "chunk_text", "source_name", "source_url"],
        rows,
    )

    print("\n   verifying count:")
    res = run_sql(f"SELECT COUNT(*) AS n FROM {KB_TABLE}", CATALOG, SCHEMA)
    n = res.get("result", {}).get("data_array", [["?"]])[0][0]
    print(f"   {CATALOG}.{SCHEMA}.{KB_TABLE}: {n} rows")


# --------------------------------------------------------------------------- #
# Step 2: Lakebase synced table (mirror uc_sync.py)
# --------------------------------------------------------------------------- #
def create_synced_table():
    print("3) register Lakebase DB as UC catalog (idempotent):", LB_CATALOG)
    out = cli(
        ["postgres", "create-catalog", LB_CATALOG],
        {"spec": {"postgres_database": "databricks_postgres", "branch": BRANCH}},
    )
    print("   ->", out.returncode, (out.stdout[:160] or out.stderr[:200]))

    print(f"4) create synced table public.{KB_TABLE} (SNAPSHOT, --no-wait)")
    stid = f"{LB_CATALOG}.public.{KB_TABLE}"
    spec = {
        "spec": {
            "source_table_full_name": f"{CATALOG}.{SCHEMA}.{KB_TABLE}",
            "primary_key_columns": ["id"],
            "scheduling_policy": "SNAPSHOT",
            "branch": BRANCH,
            "postgres_database": "databricks_postgres",
            "create_database_objects_if_missing": True,
            "new_pipeline_spec": {
                "storage_catalog": CATALOG,
                "storage_schema": STORAGE_SCHEMA,
            },
        }
    }
    out = cli(["postgres", "create-synced-table", stid, "--no-wait"], spec)
    ok = out.returncode == 0
    print(
        f"   {KB_TABLE}: {'submitted' if ok else 'ERROR'} -> "
        f"{(out.stdout[:120] if ok else out.stderr[:220]).strip()}"
    )

    print("\n5) poll status (first pass)")
    time.sleep(10)
    out = cli(["postgres", "get-synced-table", f"synced_tables/{stid}", "-o", "json"])
    state = "?"
    try:
        d = json.loads(out.stdout)
        state = (
            (d.get("status") or {}).get("detailed_state")
            or (d.get("status") or {}).get("state")
            or str(d.get("status"))
        )
    except Exception:
        state = out.stderr[:120] or "parse-fail"
    print(f"   {KB_TABLE}: {state}")


# --------------------------------------------------------------------------- #
# Step 3 (GUARDED, --embed only): embeddings + vector index.
#
# This path needs external network (a live embedding endpoint) and is therefore
# NOT run in the sandbox. The shipped retrieval (server/routes/apply.ts) is
# pure-Postgres lexical search and does not require any of this. Run later on a
# networked machine to UPGRADE retrieval from lexical to semantic.
# --------------------------------------------------------------------------- #
def add_embeddings():
    print(
        "[--embed] Semantic-retrieval upgrade is GUARDED and not executed here.\n"
        "External network / a live embedding endpoint is unavailable in this sandbox.\n"
        "To enable pgvector semantic retrieval LATER, on a networked machine:\n"
    )
    print(
        "  Option A — Lakebase pgvector (self-contained, recommended):\n"
        f"    1. databricks psql --project {LB_CATALOG} --profile {PROFILE} -- -c \\\n"
        '         "CREATE EXTENSION IF NOT EXISTS vector;"\n'
        f"    2. ALTER TABLE public.{KB_TABLE} ADD COLUMN embedding vector({EMBED_DIM});\n"
        f"    3. For each row, embed (title || chunk_text) with the '{EMBED_ENDPOINT}'\n"
        "       serving endpoint and UPDATE public.%s SET embedding = $1::vector;\n"
        f"    4. CREATE INDEX ON public.{KB_TABLE} USING hnsw (embedding vector_cosine_ops);\n"
        "       ANALYZE public.%s;\n"
        "    Then flip USE_VECTOR in server/routes/apply.ts retrieveChunks() on.\n"
        % (KB_TABLE, KB_TABLE)
    )
    print(
        "  Option B — Databricks Vector Search (managed endpoint + Delta sync index):\n"
        f"    Create a Vector Search endpoint, build a Delta Sync index over\n"
        f"    {CATALOG}.{SCHEMA}.{KB_TABLE} keyed on id with embedding_source_column\n"
        f"    chunk_text and embedding_model_endpoint_name '{EMBED_ENDPOINT}', then query\n"
        "    it from the server. Requires an external Vector Search endpoint.\n"
    )
    print(
        "NOTE: This function intentionally does NOT call any embedding endpoint or "
        "create any live index. It only prints the deferred runbook."
    )


def main():
    if "--embed" in sys.argv:
        add_embeddings()
        return
    load_delta()
    create_synced_table()
    print(
        "\nDONE. Lexical RAG over public.%s is ready (no external service needed).\n"
        "Run with --embed later to print the semantic-retrieval upgrade runbook."
        % KB_TABLE
    )


if __name__ == "__main__":
    main()

"""
Create Lakebase synced tables from our UC Delta source tables (DevHub recipe core).

1. Register the Lakebase Postgres DB as a UC catalog (benefitsiq_lb) — one-time.
2. Create a storage schema for the sync pipeline metadata.
3. SNAPSHOT-sync each benefitsiq.app.<t> Delta table into Lakebase public.<t>.

SNAPSHOT mode: one-time full copy (our curated rules are static), no continuous cost.
"""

import json
import subprocess
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
PROJECT = "benefitsiq"
BRANCH = "projects/benefitsiq/branches/production"
SRC_CATALOG = "benefitsiq"  # regular UC catalog with our Delta tables
SRC_SCHEMA = "app"
LB_CATALOG = "benefitsiq_lb"  # UC catalog mapped to Lakebase Postgres
STORAGE_SCHEMA = "pipelines"
TABLES = ["eligibility_rules", "programs", "fpl_thresholds", "cohort_stats"]


def cli(args, body=None):
    cmd = ["databricks"] + args + ["--profile", PROFILE]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180)


def run_sql(stmt):
    body = {
        "warehouse_id": WAREHOUSE,
        "statement": stmt,
        "wait_timeout": "30s",
        "on_wait_timeout": "CONTINUE",
    }
    out = cli(["api", "post", "/api/2.0/sql/statements/"], body)
    print("   sql:", stmt[:60], "->", out.returncode, (out.stderr[:120] or "ok"))


def main():
    print("1) storage schema for pipeline metadata")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {SRC_CATALOG}.{STORAGE_SCHEMA}")

    print("2) register Lakebase DB as UC catalog:", LB_CATALOG)
    out = cli(
        ["postgres", "create-catalog", LB_CATALOG],
        {"spec": {"postgres_database": "databricks_postgres", "branch": BRANCH}},
    )
    print("   ->", out.returncode, (out.stdout[:160] or out.stderr[:200]))

    print("3) create synced tables (SNAPSHOT, --no-wait)")
    for t in TABLES:
        stid = f"{LB_CATALOG}.public.{t}"
        spec = {
            "spec": {
                "source_table_full_name": f"{SRC_CATALOG}.{SRC_SCHEMA}.{t}",
                "primary_key_columns": ["id"],
                "scheduling_policy": "SNAPSHOT",
                "branch": BRANCH,
                "postgres_database": "databricks_postgres",
                "create_database_objects_if_missing": True,
                "new_pipeline_spec": {
                    "storage_catalog": SRC_CATALOG,
                    "storage_schema": STORAGE_SCHEMA,
                },
            }
        }
        out = cli(["postgres", "create-synced-table", stid, "--no-wait"], spec)
        ok = out.returncode == 0
        print(
            f"   {t}: {'submitted' if ok else 'ERROR'} -> {(out.stdout[:120] if ok else out.stderr[:220]).strip()}"
        )

    print("\n4) poll status (first pass)")
    time.sleep(10)
    for t in TABLES:
        stid = f"synced_tables/{LB_CATALOG}.public.{t}"
        out = cli(["postgres", "get-synced-table", stid, "-o", "json"])
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
        print(f"   {t}: {state}")


if __name__ == "__main__":
    main()

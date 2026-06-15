"""
Create Lakebase synced table for ACS state statistics from Unity Catalog Delta source.

Syncs benefitsiq.app.acs_state_stats → benefitsiq_lb.public.acs_state_stats
in SNAPSHOT mode (one-time full copy, no continuous cost).

This follows the exact pattern from uc_sync.py for the curated tables.

Usage: python3 scripts/acs_sync.py
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
TABLE = "acs_state_stats"


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
    print("ACS State Statistics → Lakebase Synced Table")
    print("=" * 60)

    print("\n1) Ensure storage schema exists for pipeline metadata")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {SRC_CATALOG}.{STORAGE_SCHEMA}")

    print("\n2) Ensure Lakebase catalog is registered:", LB_CATALOG)
    print("   (If already exists, this will show an error — that's OK)")
    out = cli(
        ["postgres", "create-catalog", LB_CATALOG],
        {"spec": {"postgres_database": "databricks_postgres", "branch": BRANCH}},
    )
    print("   ->", out.returncode, (out.stdout[:160] or out.stderr[:200]))

    print("\n3) Create synced table (SNAPSHOT mode, --no-wait)")
    stid = f"{LB_CATALOG}.public.{TABLE}"
    spec = {
        "spec": {
            "source_table_full_name": f"{SRC_CATALOG}.{SRC_SCHEMA}.{TABLE}",
            "primary_key_columns": ["state"],  # state code is unique
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
        f"   {TABLE}: {'submitted' if ok else 'ERROR'} -> {(out.stdout[:120] if ok else out.stderr[:220]).strip()}"
    )

    print("\n4) Poll status (first pass)")
    time.sleep(10)
    stid_path = f"synced_tables/{LB_CATALOG}.public.{TABLE}"
    out = cli(["postgres", "get-synced-table", stid_path, "-o", "json"])
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
    print(f"   {TABLE}: {state}")

    print("\n✓ Sync job submitted.")
    print(
        f"   Check status: databricks postgres get-synced-table {stid_path} --profile {PROFILE}"
    )


if __name__ == "__main__":
    main()

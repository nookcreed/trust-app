"""
Sync clinical_knowledge from UC Delta to Lakebase (serverless Postgres).

Facility, PIN code, and NFHS-5 tables are already in Lakebase from the
hackathon setup. This script only syncs the curated clinical knowledge
map that seed_knowledge.py creates.

Usage: python3 trustdesk/scripts/uc_sync.py
"""

import json
import subprocess
import time

PROFILE = "DEFAULT"
PROJECT = "trustdesk"
BRANCH = f"projects/{PROJECT}/branches/production"
SRC_CATALOG = "databricks_virtue_foundation_dataset_dais_2026"
SRC_SCHEMA = "app"
LB_CATALOG = "trustdesk_lb"
STORAGE_SCHEMA = "pipelines"

TABLES = [
    ("clinical_knowledge", ["specialty"]),
]


def cli(args, body=None):
    cmd = ["databricks"] + args + ["--profile", PROFILE]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180)


def run_sql(stmt):
    body = {
        "warehouse_id": "67b837279aee21c3",
        "statement": stmt,
        "wait_timeout": "30s",
        "on_wait_timeout": "CONTINUE",
    }
    out = cli(["api", "post", "/api/2.0/sql/statements/"], body)
    print(f"   sql: {stmt[:80]} -> rc={out.returncode}")
    if out.returncode != 0:
        print(f"   stderr: {out.stderr[:200]}")


def main():
    print("1) Creating storage schema for pipeline metadata")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {SRC_CATALOG}.{STORAGE_SCHEMA}")

    print(f"\n2) Registering Lakebase DB as UC catalog: {LB_CATALOG}")
    out = cli(
        ["postgres", "create-catalog", LB_CATALOG],
        {"spec": {"postgres_database": "databricks_postgres", "branch": BRANCH}},
    )
    if out.returncode == 0:
        print(f"   -> Created: {out.stdout[:160].strip()}")
    else:
        msg = out.stderr[:300]
        if "already exists" in msg.lower():
            print(f"   -> Catalog {LB_CATALOG} already exists (OK)")
        else:
            print(f"   -> Warning: {msg}")

    print("\n3) Creating synced table for clinical_knowledge (SNAPSHOT)")
    for table_name, pk_cols in TABLES:
        synced_table_id = f"{LB_CATALOG}.public.{table_name}"
        spec = {
            "spec": {
                "source_table_full_name": f"{SRC_CATALOG}.{SRC_SCHEMA}.{table_name}",
                "primary_key_columns": pk_cols,
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
        out = cli(
            ["postgres", "create-synced-table", synced_table_id, "--no-wait"], spec
        )
        if out.returncode == 0:
            print(f"   {table_name}: submitted -> {out.stdout[:120].strip()}")
        else:
            msg = out.stderr[:300]
            if "already exists" in msg.lower() or "already synced" in msg.lower():
                print(f"   {table_name}: already synced (OK)")
            else:
                print(f"   {table_name}: ERROR -> {msg}")

    print("\n4) Polling sync status ...")
    time.sleep(15)
    for table_name, _ in TABLES:
        synced_table_path = f"synced_tables/{LB_CATALOG}.public.{table_name}"
        out = cli(["postgres", "get-synced-table", synced_table_path, "-o", "json"])
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
        print(f"   {table_name}: {state}")

    print("\nDone. Clinical knowledge synced to Lakebase.")


if __name__ == "__main__":
    main()

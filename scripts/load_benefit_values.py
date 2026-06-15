"""
Load BenefitsIQ's benefit dollar values into a Unity Catalog Delta table and sync
it into Lakebase. This is the "new programs are just data, not code" path: the engine
reads these values at runtime (server/routes/benefits.ts) and falls back to its
built-in DEFAULT_BENEFIT_VALUES if the table is absent.

Table: benefitsiq.app.benefit_values
  program_short STRING  -- SNAP | WIC | CHIP | NSLP
  value_key     STRING  -- household_1..household_8, per_additional, per_person_monthly, per_child_annual
  value         DOUBLE
  id            INT      -- primary key for the Lakebase sync

Steps (mirrors uc_load.py + uc_sync.py exactly):
  1. CREATE OR REPLACE the Delta table (CDF on) + insert default values.
  2. SNAPSHOT-sync benefitsiq.app.benefit_values -> benefitsiq_lb.public.benefit_values.

Usage: python3 scripts/load_benefit_values.py
"""

import json
import subprocess
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"

# Lakebase sync settings (mirror uc_sync.py)
BRANCH = "projects/benefitsiq/branches/production"
LB_CATALOG = "benefitsiq_lb"
STORAGE_SCHEMA = "pipelines"
TABLE = "benefit_values"

# Current engine defaults (must match DEFAULT_BENEFIT_VALUES in
# server/engine/eligibility.ts). Each row: (program_short, value_key, value).
DEFAULT_VALUES = [
    ("SNAP", "household_1", 291),
    ("SNAP", "household_2", 535),
    ("SNAP", "household_3", 766),
    ("SNAP", "household_4", 973),
    ("SNAP", "household_5", 1155),
    ("SNAP", "household_6", 1386),
    ("SNAP", "household_7", 1532),
    ("SNAP", "household_8", 1751),
    ("SNAP", "per_additional", 219),
    ("WIC", "per_person_monthly", 50),
    ("CHIP", "per_child_annual", 3600),
    ("NSLP", "per_child_annual", 900),
]


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


def insert_rows(table, cols, rows, batch=400):
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


def create_synced_table():
    print("3) storage schema for pipeline metadata")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{STORAGE_SCHEMA}")

    print("4) register Lakebase DB as UC catalog:", LB_CATALOG)
    out = cli(
        ["postgres", "create-catalog", LB_CATALOG],
        {"spec": {"postgres_database": "databricks_postgres", "branch": BRANCH}},
    )
    print("   ->", out.returncode, (out.stdout[:160] or out.stderr[:200]))

    print("5) create synced table (SNAPSHOT, --no-wait)")
    stid = f"{LB_CATALOG}.public.{TABLE}"
    spec = {
        "spec": {
            "source_table_full_name": f"{CATALOG}.{SCHEMA}.{TABLE}",
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
        f"   {TABLE}: {'submitted' if ok else 'ERROR'} -> "
        f"{(out.stdout[:120] if ok else out.stderr[:220]).strip()}"
    )

    print("\n6) poll status (first pass)")
    time.sleep(10)
    stid_get = f"synced_tables/{LB_CATALOG}.public.{TABLE}"
    out = cli(["postgres", "get-synced-table", stid_get, "-o", "json"])
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


def main():
    print("1) benefit_values table (CDF on)")
    run_sql(
        "CREATE OR REPLACE TABLE benefit_values (program_short STRING, "
        "value_key STRING, value DOUBLE, id INT) "
        "TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )

    print("2) insert default values")
    rows = [
        {"id": i + 1, "program_short": ps, "value_key": vk, "value": float(val)}
        for i, (ps, vk, val) in enumerate(DEFAULT_VALUES)
    ]
    insert_rows("benefit_values", ["id", "program_short", "value_key", "value"], rows)

    res = run_sql("SELECT COUNT(*) AS n FROM benefit_values", CATALOG, SCHEMA)
    n = res.get("result", {}).get("data_array", [["?"]])[0][0]
    print(f"  {CATALOG}.{SCHEMA}.benefit_values: {n} rows")

    create_synced_table()
    print("\nDONE.")


if __name__ == "__main__":
    main()

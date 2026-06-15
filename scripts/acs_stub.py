"""
STUB LOADER (placeholder) for benefitsiq.app.acs_state_stats.

⚠️  This loads REALISTIC-BUT-ILLUSTRATIVE state SNAP-receipt / poverty percentages so the
    ACS feature works in the demo. It is NOT real Census data. The source_citation on every
    row says "ILLUSTRATIVE PLACEHOLDER" so it is never passed off as real.

    >>> PENDING: replace with real data before submission via:
        CENSUS_API_KEY=<key> python3 scripts/acs_load.py && python3 scripts/acs_sync.py
        (or load a Census/ACS dataset from Databricks Marketplace)
    acs_load.py CREATE OR REPLACE-s this same table, so the real load cleanly overwrites the stub.

Usage: python3 scripts/acs_stub.py   (then: python3 scripts/acs_sync.py)
"""

import json
import subprocess
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"

PLACEHOLDER_CITATION = (
    "ILLUSTRATIVE PLACEHOLDER — not real Census data; pending live ACS 2022 load"
)
SOURCE_URL = "https://data.census.gov"

# state -> (state_name, snap_receipt_pct, poverty_pct, approx_total_households)
# Percentages are realistic ballpark figures (directionally accurate) used only so the
# UI renders; absolute household counts are rough approximations and are never displayed.
STUB = {
    "AL": ("Alabama", 14.0, 16.0, 1_900_000),
    "AK": ("Alaska", 11.0, 11.0, 270_000),
    "AZ": ("Arizona", 11.0, 13.0, 2_800_000),
    "AR": ("Arkansas", 12.0, 16.0, 1_200_000),
    "CA": ("California", 9.0, 12.0, 13_100_000),
    "CO": ("Colorado", 8.0, 9.0, 2_300_000),
    "CT": ("Connecticut", 11.0, 10.0, 1_400_000),
    "DE": ("Delaware", 12.0, 11.0, 380_000),
    "DC": ("District of Columbia", 17.0, 15.0, 320_000),
    "FL": ("Florida", 12.0, 13.0, 8_500_000),
    "GA": ("Georgia", 13.0, 14.0, 4_000_000),
    "HI": ("Hawaii", 10.0, 10.0, 460_000),
    "ID": ("Idaho", 7.0, 11.0, 660_000),
    "IL": ("Illinois", 13.0, 12.0, 5_000_000),
    "IN": ("Indiana", 11.0, 12.0, 2_700_000),
    "IA": ("Iowa", 9.0, 11.0, 1_300_000),
    "KS": ("Kansas", 7.0, 11.0, 1_200_000),
    "KY": ("Kentucky", 14.0, 16.0, 1_800_000),
    "LA": ("Louisiana", 16.0, 19.0, 1_800_000),
    "ME": ("Maine", 13.0, 11.0, 580_000),
    "MD": ("Maryland", 11.0, 9.0, 2_300_000),
    "MA": ("Massachusetts", 12.0, 10.0, 2_700_000),
    "MI": ("Michigan", 13.0, 13.0, 4_000_000),
    "MN": ("Minnesota", 8.0, 9.0, 2_300_000),
    "MS": ("Mississippi", 14.0, 19.0, 1_100_000),
    "MO": ("Missouri", 11.0, 13.0, 2_500_000),
    "MT": ("Montana", 8.0, 12.0, 450_000),
    "NE": ("Nebraska", 8.0, 10.0, 780_000),
    "NV": ("Nevada", 13.0, 12.0, 1_200_000),
    "NH": ("New Hampshire", 6.0, 7.0, 550_000),
    "NJ": ("New Jersey", 8.0, 10.0, 3_400_000),
    "NM": ("New Mexico", 17.0, 18.0, 830_000),
    "NY": ("New York", 14.0, 14.0, 7_500_000),
    "NC": ("North Carolina", 13.0, 14.0, 4_100_000),
    "ND": ("North Dakota", 6.0, 11.0, 330_000),
    "OH": ("Ohio", 13.0, 13.0, 4_800_000),
    "OK": ("Oklahoma", 13.0, 16.0, 1_500_000),
    "OR": ("Oregon", 15.0, 12.0, 1_700_000),
    "PA": ("Pennsylvania", 13.0, 12.0, 5_200_000),
    "RI": ("Rhode Island", 14.0, 12.0, 420_000),
    "SC": ("South Carolina", 12.0, 15.0, 2_000_000),
    "SD": ("South Dakota", 8.0, 12.0, 360_000),
    "TN": ("Tennessee", 13.0, 15.0, 2_700_000),
    "TX": ("Texas", 12.0, 14.0, 10_500_000),
    "UT": ("Utah", 6.0, 9.0, 1_100_000),
    "VT": ("Vermont", 11.0, 10.0, 270_000),
    "VA": ("Virginia", 9.0, 10.0, 3_300_000),
    "WA": ("Washington", 11.0, 10.0, 3_000_000),
    "WV": ("West Virginia", 16.0, 16.0, 710_000),
    "WI": ("Wisconsin", 10.0, 11.0, 2_400_000),
    "WY": ("Wyoming", 6.0, 10.0, 240_000),
}


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
        raise RuntimeError(f"SQL not SUCCEEDED ({state}): {str(err)[:300]}")
    return res


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    print("STUB ACS state stats → Unity Catalog (PLACEHOLDER, not real Census data)")
    run_sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
    run_sql(
        "CREATE OR REPLACE TABLE acs_state_stats ("
        "state STRING, state_name STRING, total_households BIGINT, snap_households BIGINT, "
        "snap_receipt_pct DOUBLE, poverty_pct DOUBLE, acs_year INT, "
        "source_citation STRING, source_url STRING"
        ") TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )
    rows = []
    for st, (name, snap_pct, pov_pct, hh) in STUB.items():
        rows.append(
            {
                "state": st,
                "state_name": name,
                "total_households": hh,
                "snap_households": round(hh * snap_pct / 100.0),
                "snap_receipt_pct": snap_pct,
                "poverty_pct": pov_pct,
                "acs_year": 2022,
                "source_citation": PLACEHOLDER_CITATION,
                "source_url": SOURCE_URL,
            }
        )
    cols = [
        "state",
        "state_name",
        "total_households",
        "snap_households",
        "snap_receipt_pct",
        "poverty_pct",
        "acs_year",
        "source_citation",
        "source_url",
    ]
    values = ",\n".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in rows)
    run_sql(
        f"INSERT INTO acs_state_stats ({', '.join(cols)}) VALUES\n{values}",
        CATALOG,
        SCHEMA,
    )
    res = run_sql("SELECT COUNT(*) AS n FROM acs_state_stats", CATALOG, SCHEMA)
    n = res.get("result", {}).get("data_array", [["?"]])[0][0]
    print(f"  loaded {n} stub rows into {CATALOG}.{SCHEMA}.acs_state_stats")
    print("  ⚠️  PLACEHOLDER data — replace via acs_load.py before submission.")
    print(
        "  Next: python3 scripts/acs_sync.py   (sync to Lakebase public.acs_state_stats)"
    )


if __name__ == "__main__":
    main()

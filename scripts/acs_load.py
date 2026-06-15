"""
Land U.S. Census American Community Survey (ACS) 2022 state-level statistics into
Unity Catalog Delta tables via the SQL Statement Execution API.

This script fetches real public data from the Census API:
- Table B22003: SNAP/Food Stamp receipt by poverty status
- Table B17001: Poverty status in past 12 months

NETWORK REQUIREMENT: This script requires internet access to fetch from api.census.gov.
If running in a sandbox or offline environment, it will fail with a clear message.

Usage: python3 scripts/acs_load.py
"""

import json
import os
import subprocess
import sys
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"

# Census Data API — API key REQUIRED as of mid-2025.
# Get a free key at: https://api.census.gov/data/key_signup.html
# Set env var CENSUS_API_KEY before running.
CENSUS_BASE = "https://api.census.gov/data/2022/acs/acs5"
ACS_YEAR = 2022
CENSUS_API_KEY = os.environ.get("CENSUS_API_KEY", "")

# FIPS to USPS state code mapping (50 states + DC)
FIPS_TO_STATE = {
    "01": "AL",
    "02": "AK",
    "04": "AZ",
    "05": "AR",
    "06": "CA",
    "08": "CO",
    "09": "CT",
    "10": "DE",
    "11": "DC",
    "12": "FL",
    "13": "GA",
    "15": "HI",
    "16": "ID",
    "17": "IL",
    "18": "IN",
    "19": "IA",
    "20": "KS",
    "21": "KY",
    "22": "LA",
    "23": "ME",
    "24": "MD",
    "25": "MA",
    "26": "MI",
    "27": "MN",
    "28": "MS",
    "29": "MO",
    "30": "MT",
    "31": "NE",
    "32": "NV",
    "33": "NH",
    "34": "NJ",
    "35": "NM",
    "36": "NY",
    "37": "NC",
    "38": "ND",
    "39": "OH",
    "40": "OK",
    "41": "OR",
    "42": "PA",
    "44": "RI",
    "45": "SC",
    "46": "SD",
    "47": "TN",
    "48": "TX",
    "49": "UT",
    "50": "VT",
    "51": "VA",
    "53": "WA",
    "54": "WV",
    "55": "WI",
    "56": "WY",
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


def fetch_census_data():
    """
    Fetch ACS 2022 state-level data from Census API.
    Returns list of dicts with state stats.
    Requires network access — will fail gracefully if offline.
    """
    # Try requests library first, fallback to urllib if unavailable
    try:
        import requests

        use_requests = True
    except ImportError:
        import urllib.request

        use_requests = False

    key_param = f"&key={CENSUS_API_KEY}" if CENSUS_API_KEY else ""
    if not CENSUS_API_KEY:
        print(
            "  ⚠️  No CENSUS_API_KEY set — the API now 302-redirects anonymous requests "
            "to HTML, so this will likely fail. Get a free key: "
            "https://api.census.gov/data/key_signup.html"
        )

    # Table B22003: SNAP receipt
    # B22003_001E = total households
    # B22003_002E = households receiving SNAP
    snap_url = f"{CENSUS_BASE}?get=NAME,B22003_001E,B22003_002E&for=state:*{key_param}"

    # Table B17001: Poverty status
    # B17001_001E = universe (total pop for whom poverty determined)
    # B17001_002E = income below poverty level
    poverty_url = (
        f"{CENSUS_BASE}?get=NAME,B17001_001E,B17001_002E&for=state:*{key_param}"
    )

    def _get_json(url, label):
        """Fetch a URL and parse JSON, with a precise error if Census returns
        a 302->HTML page (which happens for anonymous requests now that a key
        is required)."""
        if use_requests:
            resp = requests.get(url, timeout=30, allow_redirects=True)
            status = resp.status_code
            text = resp.text
            ctype = resp.headers.get("Content-Type", "")
        else:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                status = r.status
                text = r.read().decode("utf-8")
                ctype = r.headers.get("Content-Type", "")
        # Census returns JSON arrays; an HTML body or redirect means auth/key failure.
        looks_html = "html" in ctype.lower() or text.lstrip()[:1] in ("<",)
        if status != 200 or looks_html:
            raise RuntimeError(
                f"{label}: Census returned status {status}, content-type '{ctype}'. "
                "This is the no-key 302->HTML redirect. A CENSUS_API_KEY is now required."
            )
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"{label}: response was not JSON ({e}). First 120 chars: {text[:120]!r}. "
                "Set CENSUS_API_KEY and retry."
            ) from e

    print("Fetching from Census API (requires network)...")
    try:
        snap_data = _get_json(snap_url, "B22003 (SNAP)")
        poverty_data = _get_json(poverty_url, "B17001 (poverty)")
    except Exception as e:
        print(
            "\n❌ ERROR: Could not fetch JSON from the Census API.",
            file=sys.stderr,
        )
        print(f"   {type(e).__name__}: {str(e)[:260]}", file=sys.stderr)
        print("\n📋 FIX:", file=sys.stderr)
        print(
            "   The Census API now requires a free key for these queries.",
            file=sys.stderr,
        )
        print(
            "   1) Get one instantly: https://api.census.gov/data/key_signup.html",
            file=sys.stderr,
        )
        print(
            "      (key arrives by email; check spam; click the activation link)",
            file=sys.stderr,
        )
        print(
            "   2) Run: CENSUS_API_KEY=<your_key> python3 scripts/acs_load.py",
            file=sys.stderr,
        )
        sys.exit(1)

    # Parse responses (first row is headers, rest are data)
    # SNAP format: [NAME, B22003_001E, B22003_002E, state_fips]
    snap_headers = snap_data[0]
    snap_rows = snap_data[1:]

    poverty_headers = poverty_data[0]
    poverty_rows = poverty_data[1:]

    # Build lookup: fips -> poverty data
    poverty_by_fips = {}
    for row in poverty_rows:
        fips = row[3]
        # Poverty URL columns: NAME, B17001_001E (universe), B17001_002E (below poverty), state
        universe = int(row[1]) if row[1] not in (None, "", "null") else 0
        below_pov = int(row[2]) if row[2] not in (None, "", "null") else 0
        poverty_by_fips[fips] = {
            "universe": universe,
            "below_poverty": below_pov,
        }

    # Process SNAP data and merge with poverty
    results = []
    for row in snap_rows:
        state_name = row[0]
        total_hh = int(row[1]) if row[1] not in (None, "", "null") else 0
        snap_hh = int(row[2]) if row[2] not in (None, "", "null") else 0
        fips = row[3]

        if fips not in FIPS_TO_STATE:
            continue  # Skip territories

        state_code = FIPS_TO_STATE[fips]

        # Compute SNAP receipt percentage
        snap_pct = round(100.0 * snap_hh / total_hh, 1) if total_hh > 0 else 0.0

        # Get poverty data
        pov_data = poverty_by_fips.get(fips, {"universe": 0, "below_poverty": 0})
        pov_pct = (
            round(100.0 * pov_data["below_poverty"] / pov_data["universe"], 1)
            if pov_data["universe"] > 0
            else 0.0
        )

        results.append(
            {
                "state": state_code,
                "state_name": state_name,
                "total_households": total_hh,
                "snap_households": snap_hh,
                "snap_receipt_pct": snap_pct,
                "poverty_pct": pov_pct,
                "acs_year": ACS_YEAR,
                "source_citation": "U.S. Census Bureau, American Community Survey 5-Year Estimates (2022), tables B22003 & B17001",
                "source_url": "https://data.census.gov",
            }
        )

    print(f"✓ Fetched data for {len(results)} states/DC")
    return results


def main():
    print("Census ACS 2022 State Statistics → Unity Catalog")
    print("=" * 60)

    # Fetch Census data (requires network)
    census_rows = fetch_census_data()

    print("\n1) Create catalog + schema (if not exists)")
    run_sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

    print("\n2) Create acs_state_stats table (Delta with CDF)")
    run_sql(
        "CREATE OR REPLACE TABLE acs_state_stats ("
        "state STRING, "
        "state_name STRING, "
        "total_households BIGINT, "
        "snap_households BIGINT, "
        "snap_receipt_pct DOUBLE, "
        "poverty_pct DOUBLE, "
        "acs_year INT, "
        "source_citation STRING, "
        "source_url STRING"
        ") TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )

    print("\n3) Insert Census data")
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
    insert_rows("acs_state_stats", cols, census_rows)

    print("\n✓ DONE. Verifying counts:")
    res = run_sql(f"SELECT COUNT(*) AS n FROM acs_state_stats", CATALOG, SCHEMA)
    n = res.get("result", {}).get("data_array", [["?"]])[0][0]
    print(f"  {CATALOG}.{SCHEMA}.acs_state_stats: {n} rows")

    # Show sample
    print("\n📊 Sample (first 3 states):")
    res = run_sql(
        f"SELECT state, state_name, snap_receipt_pct, poverty_pct FROM acs_state_stats ORDER BY state LIMIT 3",
        CATALOG,
        SCHEMA,
    )
    sample = res.get("result", {}).get("data_array", [])
    for row in sample:
        print(f"    {row[0]} ({row[1]}): {row[2]}% SNAP receipt, {row[3]}% poverty")


if __name__ == "__main__":
    main()

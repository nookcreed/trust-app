"""
Embed the apply_kb chunks for SEMANTIC retrieval (real vector RAG).

For each row in benefitsiq.app.apply_kb, call the Databricks embedding endpoint
(databricks-gte-large-en, 1024-dim) on "title. chunk_text", and store the vector as a
JSON-string column in a new UC Delta table benefitsiq.app.apply_kb_emb, then SNAPSHOT-sync
it to Lakebase public.apply_kb_emb. The app embeds the user's question at query time and
cosine-ranks against these vectors (so "emergency food" matches "expedited SNAP").

Embedding stored as STRING (JSON array) to avoid array-type mapping issues across UC->Lakebase.

Runs from anywhere with `databricks` CLI auth (uses Databricks serving, not external net).
Usage: python3 scripts/embed_apply_kb.py
"""

import json
import subprocess
import time

PROFILE = "DEFAULT"
WAREHOUSE = "67b837279aee21c3"
CATALOG = "benefitsiq"
SCHEMA = "app"
EMBED_ENDPOINT = "databricks-gte-large-en"

# sync constants (mirror uc_sync.py)
BRANCH = "projects/benefitsiq/branches/production"
LB_CATALOG = "benefitsiq_lb"
STORAGE_SCHEMA = "pipelines"


def cli(args, body=None, timeout=180):
    cmd = ["databricks"] + args + ["--profile", PROFILE]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _api(method, path, body=None):
    out = cli(["api", method, path], body)
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
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def embed(text):
    """Call the Databricks embedding endpoint; return a list[float] (1024-dim)."""
    out = cli(
        [
            "serving-endpoints",
            "query",
            EMBED_ENDPOINT,
            "--json",
            json.dumps({"input": text}),
        ],
        timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"embed failed: {out.stderr[:300]}")
    d = json.loads(out.stdout)
    data = d.get("data") or []
    if not data or "embedding" not in data[0]:
        raise RuntimeError(f"unexpected embed response: {str(d)[:200]}")
    return data[0]["embedding"]


def main():
    print("1) read apply_kb chunks from UC")
    res = run_sql(
        "SELECT id, program_short, title, chunk_text, source_name, source_url "
        "FROM apply_kb ORDER BY id",
        CATALOG,
        SCHEMA,
    )
    rows = res.get("result", {}).get("data_array", []) or []
    print(f"   {len(rows)} chunks")
    if not rows:
        raise SystemExit("No apply_kb rows. Run scripts/build_apply_kb.py first.")

    print(f"2) embed each chunk via {EMBED_ENDPOINT} (1024-dim)")
    enriched = []
    for r in rows:
        cid, prog, title, text, sname, surl = r[0], r[1], r[2], r[3], r[4], r[5]
        vec = embed(f"{title}. {text}")
        enriched.append(
            {
                "id": int(cid),
                "program_short": prog,
                "title": title,
                "chunk_text": text,
                "source_name": sname,
                "source_url": surl,
                "embedding": json.dumps([round(float(x), 6) for x in vec]),
            }
        )
        print(f"   embedded #{cid} ({prog}) dim={len(vec)}")

    print("3) write UC Delta table apply_kb_emb (embedding as JSON string)")
    run_sql(
        "CREATE OR REPLACE TABLE apply_kb_emb ("
        "id INT, program_short STRING, title STRING, chunk_text STRING, "
        "source_name STRING, source_url STRING, embedding STRING"
        ") TBLPROPERTIES (delta.enableChangeDataFeed = true)",
        CATALOG,
        SCHEMA,
    )
    cols = [
        "id",
        "program_short",
        "title",
        "chunk_text",
        "source_name",
        "source_url",
        "embedding",
    ]
    values = ",\n".join(
        "(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in enriched
    )
    run_sql(
        f"INSERT INTO apply_kb_emb ({', '.join(cols)}) VALUES\n{values}",
        CATALOG,
        SCHEMA,
    )
    n = run_sql("SELECT COUNT(*) n FROM apply_kb_emb", CATALOG, SCHEMA)
    print("   rows:", n.get("result", {}).get("data_array", [["?"]])[0][0])

    print("4) SNAPSHOT-sync to Lakebase public.apply_kb_emb")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{STORAGE_SCHEMA}")
    stid = f"{LB_CATALOG}.public.apply_kb_emb"
    spec = {
        "spec": {
            "source_table_full_name": f"{CATALOG}.{SCHEMA}.apply_kb_emb",
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
    print(
        "   submit ->",
        out.returncode,
        (out.stdout[:120] if out.returncode == 0 else out.stderr[:200]).strip(),
    )
    print(
        "\nDONE. Poll: databricks postgres get-synced-table synced_tables/benefitsiq_lb.public.apply_kb_emb --profile DEFAULT"
    )


if __name__ == "__main__":
    main()

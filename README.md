# Trust Desk

**Can a facility actually do what it claims?** Analyze 10,000 Indian healthcare facility records with a deterministic trust scoring engine. The LLM reads language; the engine decides trust. Zero hallucination by design.

[**Live App**](https://trustdesk-app-7474659675348398.aws.databricksapps.com) · [**Hackathon Submission**](trustdesk/HACKATHON_SUBMISSION.md)

---

## The problem

India has over 10,000 registered healthcare facilities — but registration doesn't mean trustworthy. A clinic can list 19 specialties with only 2 doctors. A hospital can claim to be in Kerala while its coordinates place it in the North Atlantic Ocean. A facility can advertise NABH accreditation it never received.

Asking a generic AI "Is this hospital trustworthy?" gets you a confident-sounding paragraph that's completely unverifiable. Trust Desk treats trust as a **measurable, evidence-backed quantity** — not a vibe.

---

## How it works

> **The LLM does language. The engine decides trust. The model never assesses a facility.**

Every facility is scored across **7 deterministic dimensions**:

| # | Dimension | Weight | What it catches |
|---|-----------|--------|-----------------|
| 1 | **Claims vs Evidence** | 25% | 19 specialties but only 2 doctors — medically implausible |
| 2 | **Staffing Adequacy** | 15% | Surgery department with no surgeons listed |
| 3 | **Location Verification** | 15% | Claims Kerala, coordinates show the Atlantic Ocean |
| 4 | **Accreditation Status** | 15% | Claims NABH but absent from registry |
| 5 | **Digital Presence** | 5% | Website returns HTTP 503 |
| 6 | **Data Completeness** | 10% | Missing bed count, doctor count, and coordinates |
| 7 | **Internal Consistency** | 10% | 500 beds but listed as "clinic" |

Every score comes with an **evidence chain** — the claim, the finding, whether it's supported, and the data source. When data is missing, the system says "insufficient data" instead of guessing.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  User (chat or  │────▶│  LLM Layer           │────▶│  Deterministic      │
│  search)        │     │  - Intent extraction  │     │  Trust Engine        │
│                 │     │  - Specialty normali- │     │  - 7 dimensions     │
│                 │     │    zation             │     │  - Weighted composite│
│                 │     │  - Conversational     │     │  - Evidence chains  │
│                 │     │    replies            │     │  - Flag generation  │
│                 │     │                      │     │  - 129 unit tests   │
│                 │     │  ⚠ Never scores trust │     │  ✓ Same input =     │
│                 │     │                      │     │    same output      │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
                                                              │
                                                              ▼
                                                     ┌─────────────────────┐
                                                     │  Trust Profile       │
                                                     │  - Composite score   │
                                                     │  - 7 dimension bars  │
                                                     │  - Evidence items    │
                                                     │  - Actionable flags  │
                                                     └─────────────────────┘
```

---

## Databricks stack

| Layer | Databricks capability | Role |
|---|---|---|
| **App runtime** | **Databricks Apps** (AppKit / TypeScript + React) | Full-stack hosting |
| **Language model** | **Foundation Model Serving** | Intent extraction + conversational search |
| **Source of truth** | **Unity Catalog** Delta tables | `trustdesk.app.facilities` (10K records, 51 columns) |
| **Serving layer** | **Lakebase** (serverless Postgres synced from Delta) | Sub-second facility reads — no warehouse spin-up |
| **Governance** | **Service principal** with least-privilege `SELECT` | Zero per-user OAuth consent needed |

---

## Key features

- **Natural language search** — "Show me hospitals in Bihar with cardiology" parsed by LLM, executed by SQL
- **Live trust scoring** — any of the 10,000 facilities scored in real time on the How It Works page
- **Specialty normalization** — 404-entry synonym map + 126 keyword rules handle camelCase, abbreviations, British spellings
- **Print-ready reports** — trust profiles formatted for print/PDF
- **Honest uncertainty** — missing data marked "insufficient data", composite recalculated with renormalized weights

---

## Project structure

```
trustdesk/
  server/
    engine/
      types.ts           # All TypeScript types
      trust.ts           # Deterministic trust engine (7 dimensions, pure functions)
      trust.test.ts      # 129 unit tests
      knowledge.ts       # Specialty requirements, synonyms, keyword rules
      geo.ts             # Coordinate & PIN code validation
    routes/
      facilities.ts      # Search/browse/detail
      trust-profile.ts   # Trust profile generation endpoint
      chat.ts            # LLM-powered exploration
      stats.ts           # Aggregate dashboard metrics
    server.ts            # AppKit entry
    utils.ts             # Shared parsing helpers
  client/src/
    pages/
      ExplorerPage.tsx       # Main: search + chat + results
      FacilityDetailPage.tsx # Deep trust profile for one facility
      HowItWorksPage.tsx     # Architecture + live engine demo
      DataCatalogPage.tsx    # UC tables and data quality
    components/              # TrustGauge, TrustDimensionBar, FacilityCard, etc.
  scripts/
    uc_load_facilities.py    # 10K facility records → UC Delta
    uc_load_pincode.py       # 165K PIN codes → UC Delta
    uc_sync.py               # SNAPSHOT sync all tables to Lakebase
  databricks.yml             # Bundle config
  app.yaml                   # AppKit runtime config
```

---

## Run it yourself

### Prerequisites
- Node.js 22+
- Databricks CLI
- Databricks workspace with Lakebase + Model Serving enabled

### Deploy
```bash
cd trustdesk
npm install
python scripts/uc_load_facilities.py   # Load facility data into UC Delta
python scripts/uc_sync.py              # Sync UC Delta → Lakebase
npm run build
databricks bundle deploy
databricks apps deploy trustdesk-app
```

### Quality gates
```bash
npx tsc --noEmit          # TypeScript strict compile
npx vitest run            # 129 deterministic engine tests
npm run build             # Production build
```

---

## Tech stack

**Databricks:** Apps (AppKit), Lakebase, Foundation Model Serving, Unity Catalog, SQL Warehouse.
**App:** TypeScript, React, Vite, Vitest, Tailwind CSS, Lucide React, Recharts.

---

*Built for the Databricks AI for Good Hackathon — Innovation Summit 2026.*

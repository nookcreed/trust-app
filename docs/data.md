# Data & Sources

BenefitsIQ uses real, publicly available federal and Census data to deliver accurate eligibility guidance and contextual insights.

## Datasets

### 1. Federal Programs (`programs`)
**Source**: USDA FNS, HHS/CMS, SSA official program documentation  
**Content**: Catalog of 8 federal assistance programs (SNAP, Medicaid, CHIP, SSI, TANF, Section 8, WIC, School Meals)  
**Fields**: Program name, category (nutrition/health/income), administering agency, description  
**Provenance**: Curated from official agency websites and program manuals

### 2. Eligibility Rules (`eligibility_rules`)
**Source**: State-published income thresholds from USDA FNS State Options Reports, state SNAP policy manuals, CMS Medicaid/CHIP state plan amendments  
**Content**: Income limits and categorical eligibility rules by program, state, and household size  
**Fields**: Program ID, state, household size, max gross/net monthly income, max % FPL, categorical eligibility flags, notes  
**Provenance**: Cross-referenced with:
- USDA FNS SNAP State Options Reports (FY 2023-2024)
- State SNAP agency policy manuals
- CMS Medicaid.gov state plan documents
- 7 CFR Part 273 (SNAP regulations)

### 3. Federal Poverty Level Thresholds (`fpl_thresholds`)
**Source**: U.S. Department of Health and Human Services (HHS)  
**Content**: Official Federal Poverty Level (FPL) thresholds by year, household size, and region (48 states/DC vs. Alaska vs. Hawaii)  
**Fields**: Year, household size, annual amount, region  
**Provenance**: HHS Poverty Guidelines published annually in the Federal Register  
**Reference**: https://aspe.hhs.gov/poverty-guidelines

### 4. Cohort Statistics (`cohort_stats`)
**Source**: Modeled from published federal participation and processing statistics  
**Content**: State-level patterns for household cohorts (size, income band, situation) — typical program combinations, application order, processing timelines, expedited service rates  
**Fields**: State, household band, income band, situation, programs typically accessed, typical apply order (JSON), avg processing days, expedited %, modeled sample size, source citation, source URL, effective date  
**Provenance**: Modeled from:
- USDA FNS SNAP Participation Reports (monthly state-level participation)
- CMS Medicaid/CHIP Enrollment Reports
- 7 CFR 273.2(i) SNAP processing time standards (7-day expedited, 30-day standard)
- State-reported SNAP Quality Control (QC) data

**Important**: `modeled_n` reflects a **modeled sample size** for each cohort pattern, not observed individuals. The patterns are synthesized from aggregate statistics to illustrate typical journeys. Every row carries a `source_citation` and `effective_date` for traceability.

### 5. U.S. Census ACS State Statistics (`acs_state_stats`)
**Source**: U.S. Census Bureau, American Community Survey (ACS) 5-Year Estimates, 2022  
**Content**: State-level SNAP receipt and poverty statistics from real Census survey data  
**Fields**: State code, state name, total households, SNAP-receiving households, SNAP receipt %, poverty %, ACS year, source citation, source URL  
**API Endpoints**:
- Table B22003 (SNAP receipt): `https://api.census.gov/data/2022/acs/acs5?get=NAME,B22003_001E,B22003_002E&for=state:*`
- Table B17001 (poverty status): `https://api.census.gov/data/2022/acs/acs5?get=NAME,B17001_001E,B17001_002E&for=state:*`

**How to Load**:
```bash
python3 scripts/acs_load.py    # Fetch from Census API → Unity Catalog Delta
python3 scripts/acs_sync.py    # Sync to Lakebase Postgres
```

**Reference**: https://data.census.gov

### 6. Benefit Dollar Values (`benefit_values`)
**Source**: USDA FNS (SNAP allotments), ACF TANF Financial Data, HUD HCV Fact Sheet  
**Content**: Dollar amounts used by the deterministic engine to estimate annual benefit values per program — SNAP max monthly allotments by household size, TANF base grants, Section 8 voucher averages, WIC/CHIP/NSLP per-person values  
**Fields**: Program key, household size (where applicable), monthly/annual dollar amount  
**Provenance**: Federal agency published benefit schedules (FY 2024). The engine falls back to hardcoded `DEFAULT_BENEFIT_VALUES` when this table is absent.

### 7. Application Knowledge Base (`apply_kb`)
**Source**: Official state agency application portals, USDA FNS How to Apply guides, HHS/CMS enrollment documentation  
**Content**: Per-program, per-state application instructions — URLs, required documents, processing timelines, and tips  
**Fields**: Program short name, state, apply URL, instructions, required documents, estimated processing days  
**Provenance**: Curated from official agency "How to Apply" pages

### 8. Application Knowledge Base Embeddings (`apply_kb_emb`)
**Source**: Computed from `apply_kb` content using Databricks Model Serving  
**Content**: Vector embeddings of application knowledge base entries for semantic retrieval during chat  
**Fields**: Row ID (foreign key to `apply_kb`), embedding vector  
**Provenance**: Generated via embedding model on Model Serving; used by the RAG pipeline to surface relevant application guidance

## Data Pipeline

```
┌──────────────────────────────────────────┐
│ Sources                                  │
├──────────────────────────────────────────┤
│ • Curated SQLite DB (federal rules)      │
│ • U.S. Census API (ACS state stats)      │
│ • Agency application portals (apply_kb)  │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│ Unity Catalog (Delta Tables)             │
├──────────────────────────────────────────┤
│ benefitsiq.app.programs        (8 pgms) │
│ benefitsiq.app.eligibility_rules         │
│ benefitsiq.app.fpl_thresholds            │
│ benefitsiq.app.cohort_stats              │
│ benefitsiq.app.acs_state_stats           │
│ benefitsiq.app.benefit_values            │
│ benefitsiq.app.apply_kb                  │
│ benefitsiq.app.apply_kb_emb              │
│ (delta.enableChangeDataFeed = true)      │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│ Lakebase Synced Tables (SNAPSHOT)        │
├──────────────────────────────────────────┤
│ benefitsiq_lb.public.* (Postgres)        │
│ (one-time sync, no continuous cost)      │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│ AppKit App (TypeScript Backend)          │
├──────────────────────────────────────────┤
│ Service-principal Lakebase connection    │
│ AppKit SDK reads synced tables           │
└──────────────────────────────────────────┘
```

## Citation-Forward Design

Every dataset row includes structured source attribution:
- **`cohort_stats`**: `source_citation`, `source_url`, `effective_date` per row
- **`acs_state_stats`**: `source_citation` = "U.S. Census Bureau, American Community Survey 5-Year Estimates (2022), tables B22003 & B17001", `source_url` = "https://data.census.gov"
- **Federal rules**: Traced to specific CFR sections, state policy manuals, and agency reports

This enables the app to present contextualized insights like:

> "In Georgia, ~13% of households receive SNAP benefits (U.S. Census ACS 2022). Families like yours typically apply in this order: SNAP → Medicaid → School Meals."

All data is publicly available and reproducible. The pipeline scripts are version-controlled and auditable.

---

**Last Updated**: 2026-06-14  
**Hackathon**: Databricks Innovation Summit 2026  
**Team**: BenefitsIQ

// BenefitsIQ data catalog route: Unity Catalog metadata + live row counts for judge transparency.

import type { Application, Request } from 'express';
import type { AppKitLike } from './benefits';
import { asStr } from '../utils';

interface TableMetadata {
  name: string;
  uc_path: string;
  rows: number | null;
  description: string;
  source: string;
  source_url: string;
  effective: string;
}

interface Tool {
  name: string;
  description: string;
  role: string;
}

interface CatalogResponse {
  tables: TableMetadata[];
  tools: Tool[];
}

async function getRowCount(
  db: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
  tableName: string,
): Promise<number | null> {
  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM public.${tableName}`);
    const r = rows[0];
    if (r && typeof r.n === 'number') return r.n;
    return null;
  } catch {
    return null;
  }
}

// Read the ACS source citation from the data itself so the label is always accurate:
// stub data carries a PLACEHOLDER citation (shown as a modeled estimate); a real Census
// load carries the true citation. Returns null if the table isn't loaded.
async function getAcsSource(
  db: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
): Promise<string | null> {
  try {
    const { rows } = await db.query('SELECT source_citation FROM public.acs_state_stats LIMIT 1');
    const r = rows[0];
    const cite = r && typeof r.source_citation === 'string' ? r.source_citation : '';
    if (!cite) return null;
    return cite.includes('PLACEHOLDER')
      ? 'Modeled estimate (illustrative) — live U.S. Census ACS load pending'
      : cite;
  } catch {
    return null;
  }
}

export function setupCatalogRoute(appkit: AppKitLike) {
  appkit.server.extend((app: Application) => {
    app.get('/api/data-catalog', async (_req: Request, res) => {
      try {
        // Read as the app's service principal (granted SELECT on public.*) — no user consent needed.
        const db = appkit.lakebase;

        // Fetch row counts + ACS source in parallel
        const [
          programsCount, rulesCount, fplCount, cohortCount, acsCount,
          applyKbCount, applyEmbCount, benefitValuesCount, acsSource,
        ] = await Promise.all([
          getRowCount(db, 'programs'),
          getRowCount(db, 'eligibility_rules'),
          getRowCount(db, 'fpl_thresholds'),
          getRowCount(db, 'cohort_stats'),
          getRowCount(db, 'acs_state_stats'),
          getRowCount(db, 'apply_kb'),
          getRowCount(db, 'apply_kb_emb'),
          getRowCount(db, 'benefit_values'),
          getAcsSource(db),
        ]);
        const acsIsReal = acsSource !== null && !acsSource.includes('Modeled estimate');

        const tables: TableMetadata[] = [
          {
            name: 'programs',
            uc_path: 'benefitsiq.app.programs',
            rows: programsCount,
            description: 'Federal benefit programs (SNAP, Medicaid, CHIP, WIC, LIHEAP, NSLP)',
            source: 'USDA FNS / CMS / HHS program registry',
            source_url: 'https://www.fns.usda.gov',
            effective: '2024',
          },
          {
            name: 'eligibility_rules',
            uc_path: 'benefitsiq.app.eligibility_rules',
            rows: rulesCount,
            description: 'Federal income/FPL eligibility thresholds by state and household size',
            source: 'Federal income/FPL eligibility thresholds (USDA FNS, CMS, KFF)',
            source_url: 'https://www.kff.org/medicaid/state-indicator/medicaid-income-eligibility-limits-for-parents',
            effective: '2024',
          },
          {
            name: 'fpl_thresholds',
            uc_path: 'benefitsiq.app.fpl_thresholds',
            rows: fplCount,
            description: 'Federal Poverty Level annual income thresholds by household size',
            source: 'HHS Federal Poverty Guidelines 2024',
            source_url: 'https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines',
            effective: 'Jan 2024',
          },
          {
            name: 'cohort_stats',
            uc_path: 'benefitsiq.app.cohort_stats',
            rows: cohortCount,
            description: 'Modeled cohort data: typical program combinations, application order, and processing times by state/household/income band',
            source: 'Modeled from USDA FNS SNAP participation + CMS CHIP enrollment + federal processing standards (7 CFR 273.2(i))',
            source_url: 'https://www.fns.usda.gov/pd/supplemental-nutrition-assistance-program-snap',
            effective: 'FY2023 data',
          },
          {
            name: 'acs_state_stats',
            uc_path: 'benefitsiq.app.acs_state_stats',
            rows: acsCount,
            description: 'State-level SNAP-receipt and poverty rates that contextualize the "families like you" panel',
            source: acsSource ?? 'U.S. Census Bureau American Community Survey (ACS)',
            source_url: 'https://www.census.gov/programs-surveys/acs',
            effective: acsCount === null ? 'pending load' : acsIsReal ? '2022 5-year estimates' : 'illustrative (pending real load)',
          },
          {
            name: 'apply_kb',
            uc_path: 'benefitsiq.app.apply_kb',
            rows: applyKbCount,
            description: 'Curated, cited how-to-apply guidance per program — the corpus behind the RAG "How to apply" answers',
            source: 'USDA FNS / CMS / HHS official agency guidance',
            source_url: 'https://www.benefits.gov',
            effective: '2024',
          },
          {
            name: 'apply_kb_emb',
            uc_path: 'benefitsiq.app.apply_kb_emb',
            rows: applyEmbCount,
            description: 'Vector embeddings (GTE-Large, 1024-dim) of the apply_kb chunks for semantic retrieval',
            source: 'Databricks GTE-Large embedding endpoint',
            source_url: 'https://docs.databricks.com/aws/en/machine-learning/foundation-models',
            effective: '2024',
          },
          {
            name: 'benefit_values',
            uc_path: 'benefitsiq.app.benefit_values',
            rows: benefitValuesCount,
            description: 'Benefit dollar values (SNAP/WIC/CHIP/NSLP) as data, not code — injected into the eligibility engine at runtime',
            source: 'USDA FNS / federal benefit schedules',
            source_url: 'https://www.fns.usda.gov/snap/allotment/COLA',
            effective: 'FY2024',
          },
        ];

        const tools: Tool[] = [
          {
            name: 'Unity Catalog',
            description: 'Delta Lake tables with Change Data Feed enabled for versioned, auditable data lineage',
            role: 'Source of truth for all federal benefits data',
          },
          {
            name: 'Lakebase (serverless Postgres)',
            description: 'Synced tables from Unity Catalog, scale-to-zero, sub-50ms queries',
            role: 'Powers eligibility checks and real-time UI',
          },
          {
            name: 'Model Serving (databricks-meta-llama-3-3-70b-instruct)',
            description: 'Conversational AI for guided eligibility discovery and natural language Q&A',
            role: 'Chat interface and natural language understanding',
          },
          {
            name: 'Model Serving (databricks-gte-large-en)',
            description: 'Embedding model (1024-dim) for semantic retrieval over the how-to-apply knowledge base',
            role: 'Powers the RAG "How to apply" feature (cosine search over apply_kb)',
          },
          {
            name: 'Service Principal (least-privilege)',
            description: 'All data reads run as the app service principal with SELECT-only grants on synced tables — no per-user OAuth consent required',
            role: 'Security and data governance',
          },
        ];

        const response: CatalogResponse = { tables, tools };
        res.json(response);
      } catch (e) {
        res.status(500).json({ error: asStr((e as Error).message) });
      }
    });
  });
}

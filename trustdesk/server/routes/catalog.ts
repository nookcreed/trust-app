// Data catalog route: metadata about all Unity Catalog tables with live row counts.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';

interface CatalogEntry {
  name: string;
  description: string;
  row_count: number | null;
  source: string;
  columns: string[];
}

async function getRowCount(
  db: AppKitLike['lakebase'],
  tableName: string,
): Promise<number | null> {
  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ${tableName}`);
    const r = rows[0];
    if (r && typeof r.n === 'number') return r.n;
    return null;
  } catch {
    return null;
  }
}

export function setupCatalogRoute(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    app.get('/api/data-catalog', async (_req: Request, res) => {
      try {
        const db = appkit.lakebase;

        // Fetch row counts in parallel for all tables
        const [
          facilitiesCount,
          pincodesCount,
          nfhs5Count,
          plannerNotesCount,
          assessmentEventsCount,
        ] = await Promise.all([
          getRowCount(db, 'facilities'),
          getRowCount(db, 'india_post_pincode_directory'),
          getRowCount(db, 'nfhs_5_district_health_indicators'),
          getRowCount(db, 'app.planner_notes'),
          getRowCount(db, 'app.assessment_events'),
        ]);

        const tables: CatalogEntry[] = [
          {
            name: 'facilities',
            description: 'Indian healthcare facilities with 51 columns covering identity, location, staffing, equipment, accreditation, and digital presence',
            row_count: facilitiesCount,
            source: 'Hackathon dataset — Indian healthcare facility registry',
            columns: [
              'unique_id', 'name', 'organization_type', 'address_stateOrRegion',
              'address_city', 'address_zipOrPostcode', 'address_line1',
              'latitude', 'longitude', 'numberDoctors', 'capacity',
              'specialties', 'equipment', 'procedure', 'capability',
              'description', 'officialWebsite', 'websites',
              'distinct_social_media_presence_count', 'recency_of_page_update',
              'operatorTypeId', 'area', 'facebookLink', 'phone_numbers',
              'email', 'yearEstablished',
            ],
          },
          {
            name: 'india_post_pincode_directory',
            description: 'India Post PIN code directory for location validation and cross-referencing facility addresses',
            row_count: pincodesCount,
            source: 'India Post open data — PIN code directory',
            columns: [
              'pincode', 'officename', 'officetype', 'delivery',
              'divisionname', 'regionname', 'circlename',
              'district', 'statename', 'latitude', 'longitude',
            ],
          },
          {
            name: 'nfhs_5_district_health_indicators',
            description: 'NFHS-5 (National Family Health Survey 2019-21) district-level health indicators for contextualizing facility trust',
            row_count: nfhs5Count,
            source: 'NFHS-5 (2019-21) — Ministry of Health & Family Welfare, Government of India',
            columns: [
              'state_ut', 'district_name',
              'hh_member_covered_health_insurance_pct',
              'institutional_births_pct', 'children_fully_immunized_pct',
              'total_fertility_rate', 'infant_mortality_rate',
              'under5_mortality_rate', 'women_bmi_below_normal_pct',
              'men_bmi_below_normal_pct',
            ],
          },
          {
            name: 'planner_notes',
            description: 'Planner annotations on facilities — notes, dimension assessments, and planning decisions (app-schema, mutable)',
            row_count: plannerNotesCount,
            source: 'Application data — created at runtime',
            columns: ['id', 'facility_id', 'dimension', 'note', 'decision', 'created_at'],
          },
          {
            name: 'assessment_events',
            description: 'Audit log of trust assessment events for transparency and reproducibility (app-schema, mutable)',
            row_count: assessmentEventsCount,
            source: 'Application data — created at runtime',
            columns: ['id', 'facility_id', 'event_type', 'details', 'created_at'],
          },
        ];

        res.json({ tables });
      } catch (e) {
        console.error('[catalog] error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

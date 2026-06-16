// Dashboard aggregate statistics route.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';
import { num, asStr } from '../utils';

export function setupStatsRoute(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    app.get('/api/stats', async (_req: Request, res) => {
      try {
        const db = appkit.lakebase;

        const [
          totalResult,
          byStateResult,
          byTypeResult,
          avgDoctorsResult,
          avgBedsResult,
          withWebsiteResult,
          withCoordinatesResult,
          withEquipmentResult,
          withSpecialtiesResult,
        ] = await Promise.all([
          db.query('SELECT COUNT(*)::int AS total FROM facilities'),
          db.query('SELECT "address_stateOrRegion" AS state, COUNT(*)::int AS count FROM facilities GROUP BY "address_stateOrRegion" ORDER BY count DESC'),
          db.query('SELECT organization_type AS facility_type, COUNT(*)::int AS count FROM facilities GROUP BY organization_type ORDER BY count DESC'),
          db.query(`SELECT AVG(NULLIF("numberDoctors",'')::int)::float AS avg_doctors FROM facilities WHERE "numberDoctors" ~ '^[0-9]+$'`),
          db.query(`SELECT AVG(NULLIF(capacity,'')::int)::float AS avg_beds FROM facilities WHERE capacity ~ '^[0-9]+$'`),
          db.query(`SELECT COUNT(*)::int AS count FROM facilities WHERE "officialWebsite" IS NOT NULL AND "officialWebsite" != ''`),
          db.query(`SELECT COUNT(*)::int AS count FROM facilities WHERE latitude IS NOT NULL AND longitude IS NOT NULL`),
          db.query(`SELECT COUNT(*)::int AS count FROM facilities WHERE equipment IS NOT NULL AND equipment != ''`),
          db.query(`SELECT COUNT(*)::int AS count FROM facilities WHERE specialties IS NOT NULL AND specialties != ''`),
        ]);

        const totalFacilities = num(totalResult.rows[0]?.total) ?? 0;

        const facilitiesByState: Record<string, number> = {};
        for (const row of byStateResult.rows) {
          const state = asStr(row.state);
          const count = num(row.count);
          if (state && count != null) facilitiesByState[state] = count;
        }

        const facilitiesByType: Record<string, number> = {};
        for (const row of byTypeResult.rows) {
          const type = asStr(row.facility_type);
          const count = num(row.count);
          if (type && count != null) facilitiesByType[type] = count;
        }

        const avgDoctors = num(avgDoctorsResult.rows[0]?.avg_doctors);
        const avgBeds = num(avgBedsResult.rows[0]?.avg_beds);
        const facilitiesWithWebsite = num(withWebsiteResult.rows[0]?.count) ?? 0;

        const facilitiesWithCoordinates = num(withCoordinatesResult.rows[0]?.count) ?? 0;
        const facilitiesWithEquipment = num(withEquipmentResult.rows[0]?.count) ?? 0;
        const facilitiesWithSpecialties = num(withSpecialtiesResult.rows[0]?.count) ?? 0;

        res.json({
          stats: {
            total_facilities: totalFacilities,
            facilities_by_state: facilitiesByState,
            facilities_by_type: facilitiesByType,
            avg_doctors: avgDoctors != null ? Math.round(avgDoctors * 10) / 10 : null,
            avg_beds: avgBeds != null ? Math.round(avgBeds * 10) / 10 : null,
            facilities_with_website: facilitiesWithWebsite,
            facilities_with_coordinates: facilitiesWithCoordinates,
            facilities_with_equipment: facilitiesWithEquipment,
            facilities_with_specialties: facilitiesWithSpecialties,
          },
        });
      } catch (e) {
        console.error('[stats] error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });

    app.get('/api/findings', async (_req: Request, res) => {
      try {
        const db = appkit.lakebase;

        const [
          totalResult,
          staffingResult,
          zeroDoctorsResult,
          zeroBedsResult,
          noAccreditationResult,
        ] = await Promise.all([
          db.query('SELECT COUNT(*)::int AS total FROM facilities'),

          // Staffing anomalies: specialty-to-doctor ratio > 5:1
          db.query(`
            SELECT COUNT(*)::int AS count FROM facilities
            WHERE "numberDoctors" ~ '^[0-9]+$'
              AND specialties IS NOT NULL AND specialties != ''
              AND array_length(string_to_array(specialties, ','), 1)
                  / NULLIF(NULLIF("numberDoctors", '')::int, 0) > 5
          `),

          // Facilities reporting zero or no doctors
          db.query(`
            SELECT COUNT(*)::int AS count FROM facilities
            WHERE "numberDoctors" IS NULL
              OR "numberDoctors" = ''
              OR "numberDoctors" = '0'
          `),

          // Facilities reporting zero or no beds
          db.query(`
            SELECT COUNT(*)::int AS count FROM facilities
            WHERE capacity IS NULL
              OR capacity = ''
              OR capacity = '0'
          `),

          // Facilities with no accreditation info (description field has no NABH/JCI/ISO mention)
          db.query(`
            SELECT COUNT(*)::int AS count FROM facilities
            WHERE description IS NULL
              OR (
                description NOT ILIKE '%nabh%'
                AND description NOT ILIKE '%jci%'
                AND description NOT ILIKE '%iso%'
                AND description NOT ILIKE '%accredit%'
              )
          `),
        ]);

        const totalFacilities = num(totalResult.rows[0]?.total) ?? 0;
        const noAccreditation = num(noAccreditationResult.rows[0]?.count) ?? 0;
        const noAccreditationPct = totalFacilities > 0
          ? Math.round((noAccreditation / totalFacilities) * 100)
          : 0;

        res.json({
          findings: {
            staffing_anomalies: num(staffingResult.rows[0]?.count) ?? 0,
            zero_doctors: num(zeroDoctorsResult.rows[0]?.count) ?? 0,
            zero_beds: num(zeroBedsResult.rows[0]?.count) ?? 0,
            no_accreditation_pct: noAccreditationPct,
            total_facilities: totalFacilities,
          },
        });
      } catch (e) {
        console.error('[findings] error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

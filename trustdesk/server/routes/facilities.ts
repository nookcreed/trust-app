// Facility search and detail routes.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';
import type { Facility } from '../engine/types';
import { num, asStr, parseJsonArray } from '../utils';

/** Parse raw DB row into a typed Facility. */
function toFacility(row: Record<string, unknown>): Facility {
  return {
    id: asStr(row.unique_id),
    facility_name: asStr(row.name),
    facility_type: asStr(row.organization_type),
    state: asStr(row['address_stateOrRegion']),
    district: asStr(row.address_city),
    pincode: asStr(row['address_zipOrPostcode']),
    address: asStr(row.address_line1),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    num_doctors: num(row['numberDoctors']),
    num_beds: num(row.capacity),
    specialties: row.specialties != null ? asStr(row.specialties) : null,
    equipment: row.equipment != null ? asStr(row.equipment) : null,
    procedures: row.procedure != null ? asStr(row.procedure) : null,
    departments: null,
    accreditation_text: row.description != null ? asStr(row.description) : null,
    website: asStr(row['officialWebsite'] || row.websites),
    social_media_count: num(row.distinct_social_media_presence_count),
    last_updated: row.recency_of_page_update != null ? asStr(row.recency_of_page_update) : null,
    capabilities_text: row.capability != null ? asStr(row.capability) : null,
    ownership: row['operatorTypeId'] != null ? asStr(row['operatorTypeId']) : null,
    emergency_services: null,
    num_icu_beds: null,
    num_ot: null,
  };
}

export function setupFacilitiesRoutes(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    // ----- Search / browse -----
    app.get('/api/facilities', async (req: Request, res) => {
      try {
        const db = appkit.lakebase;
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const stateFilter = typeof req.query.state === 'string' ? req.query.state.trim() : '';
        const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : '';
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (q) {
          const pattern = `%${q}%`;
          conditions.push(`(
            name ILIKE $${paramIdx}
            OR "address_stateOrRegion" ILIKE $${paramIdx}
            OR address_city ILIKE $${paramIdx}
            OR specialties ILIKE $${paramIdx}
            OR capability ILIKE $${paramIdx}
          )`);
          params.push(pattern);
          paramIdx++;
        }

        if (stateFilter) {
          conditions.push(`"address_stateOrRegion" ILIKE $${paramIdx}`);
          params.push(stateFilter);
          paramIdx++;
        }

        if (typeFilter) {
          conditions.push(`organization_type ILIKE $${paramIdx}`);
          params.push(typeFilter);
          paramIdx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count + fetch in parallel
        const [countResult, dataResult] = await Promise.all([
          db.query(`SELECT COUNT(*)::int AS total FROM facilities ${where}`, params),
          db.query(
            `SELECT * FROM facilities ${where} ORDER BY name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            [...params, limit, offset],
          ),
        ]);

        const total = num(countResult.rows[0]?.total) ?? 0;
        const facilities: Facility[] = dataResult.rows.map(toFacility);

        res.json({
          facilities,
          total,
          page,
          pages: Math.ceil(total / limit),
        });
      } catch (e) {
        console.error('[facilities] search error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });

    // ----- Detail by ID -----
    app.get('/api/facilities/:id', async (req: Request, res) => {
      try {
        const db = appkit.lakebase;
        const { rows } = await db.query('SELECT * FROM facilities WHERE unique_id = $1', [req.params.id]);

        if (!rows.length) {
          res.status(404).json({ error: 'Facility not found' });
          return;
        }

        const facility = toFacility(rows[0]);
        // Include parsed arrays for convenience
        const parsed = {
          ...facility,
          specialties_list: parseJsonArray(facility.specialties),
          equipment_list: parseJsonArray(facility.equipment),
          procedures_list: parseJsonArray(facility.procedures),
          departments_list: parseJsonArray(facility.departments),
        };

        res.json({ facility: parsed });
      } catch (e) {
        console.error('[facilities] detail error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

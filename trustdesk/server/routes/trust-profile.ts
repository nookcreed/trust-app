// Trust profile computation endpoint — deterministic engine, no LLM.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';
import type { Facility, TrustProfile } from '../engine/types';
import { computeTrustProfile } from '../engine/trust';
import { asStr, num } from '../utils';

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

/** Fetch a single facility by ID. */
async function fetchFacility(db: AppKitLike['lakebase'], id: string): Promise<Facility | null> {
  const { rows } = await db.query('SELECT * FROM facilities WHERE unique_id = $1', [id]);
  return rows.length ? toFacility(rows[0]) : null;
}

/** Optionally enhance trust profile with PIN code location validation. */
async function enhanceWithPincode(
  db: AppKitLike['lakebase'],
  facility: Facility,
  profile: TrustProfile,
): Promise<TrustProfile> {
  if (!facility.pincode) return profile;

  try {
    const { rows } = await db.query(
      'SELECT officename, statename, district AS pin_district FROM india_post_pincode_directory WHERE pincode::text = $1 LIMIT 1',
      [facility.pincode],
    );
    if (!rows.length) return profile;

    const pinRow = rows[0];
    const pinState = asStr(pinRow.statename).toLowerCase();
    const pinDistrict = asStr(pinRow.pin_district).toLowerCase();
    const facilityState = facility.state.toLowerCase();
    const facilityDistrict = facility.district.toLowerCase();

    // If PIN code state/district doesn't match facility's claimed location, add a flag
    if (pinState && facilityState && pinState !== facilityState) {
      const locationDim = profile.dimensions.find((d) => d.key === 'location');
      if (locationDim) {
        locationDim.flags.push({
          severity: 'warning',
          message: `PIN code ${facility.pincode} maps to ${asStr(pinRow.statename)}, but facility claims ${facility.state}`,
          dimension: 'location',
        });
        profile.flags.push({
          severity: 'warning',
          message: `PIN code ${facility.pincode} maps to ${asStr(pinRow.statename)}, but facility claims ${facility.state}`,
          dimension: 'location',
        });
      }
    } else if (pinDistrict && facilityDistrict && pinDistrict !== facilityDistrict) {
      const locationDim = profile.dimensions.find((d) => d.key === 'location');
      if (locationDim) {
        locationDim.evidence.push({
          claim: `Facility is in ${facility.district}`,
          finding: `PIN code ${facility.pincode} maps to district ${asStr(pinRow.pin_district)}`,
          supported: false,
          source: 'India Post PIN code database',
        });
      }
    }
  } catch (e) {
    // PIN code lookup is a nice-to-have; don't fail the whole profile
    console.warn('[trust-profile] PIN code lookup failed:', (e as Error).message);
  }

  return profile;
}

export function setupTrustProfileRoutes(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    // ----- Single facility trust profile -----
    app.post('/api/trust-profile', async (req: Request, res) => {
      try {
        const body = req.body as { facility_id?: string };
        const facilityId = body.facility_id;
        if (!facilityId) {
          res.status(400).json({ error: 'facility_id is required' });
          return;
        }

        const db = appkit.lakebase;
        const facility = await fetchFacility(db, facilityId);
        if (!facility) {
          res.status(404).json({ error: 'Facility not found' });
          return;
        }

        let profile = computeTrustProfile(facility);
        profile = await enhanceWithPincode(db, facility, profile);

        res.json({ profile });
      } catch (e) {
        console.error('[trust-profile] error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });

    // ----- Batch trust profiles -----
    app.post('/api/trust-profile/batch', async (req: Request, res) => {
      try {
        const body = req.body as { facility_ids?: string[] };
        const ids = body.facility_ids;
        if (!Array.isArray(ids) || ids.length === 0) {
          res.status(400).json({ error: 'facility_ids must be a non-empty array' });
          return;
        }
        if (ids.length > 10) {
          res.status(400).json({ error: 'Maximum 10 facilities per batch request' });
          return;
        }

        const db = appkit.lakebase;

        // Build parameterized query for batch fetch
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await db.query(
          `SELECT * FROM facilities WHERE unique_id IN (${placeholders})`,
          ids,
        );

        const facilityMap = new Map<string, Facility>();
        for (const row of rows) {
          const f = toFacility(row);
          facilityMap.set(f.id, f);
        }

        const profiles: TrustProfile[] = [];
        for (const id of ids) {
          const facility = facilityMap.get(id);
          if (!facility) continue;
          let profile = computeTrustProfile(facility);
          profile = await enhanceWithPincode(db, facility, profile);
          profiles.push(profile);
        }

        res.json({ profiles });
      } catch (e) {
        console.error('[trust-profile] batch error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

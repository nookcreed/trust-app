// NFHS-5 district health context route.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';
import type { DistrictContext } from '../engine/types';
import { asStr, num } from '../utils';

export function setupDistrictRoute(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    app.get('/api/district-context/:state/:district', async (req: Request, res) => {
      try {
        const db = appkit.lakebase;
        const state = req.params.state;
        const district = req.params.district;

        if (!state || !district) {
          res.status(400).json({ error: 'state and district are required' });
          return;
        }

        const { rows } = await db.query(
          'SELECT * FROM nfhs_5_district_health_indicators WHERE LOWER(state_ut) = LOWER($1) AND LOWER(district_name) = LOWER($2) LIMIT 1',
          [state, district],
        );

        if (!rows.length) {
          res.status(404).json({ error: `No NFHS-5 data found for ${district}, ${state}` });
          return;
        }

        const row = rows[0];

        // Extract all numeric indicator columns into a flat record
        const indicators: Record<string, number | null> = {};
        for (const [key, value] of Object.entries(row)) {
          if (key === 'state_ut' || key === 'district_name') continue;
          indicators[key] = num(value);
        }

        const context: DistrictContext = {
          state: asStr(row.state_ut),
          district: asStr(row.district_name),
          indicators,
        };

        res.json({ context });
      } catch (e) {
        console.error('[district-context] error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

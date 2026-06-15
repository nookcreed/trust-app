// Planner notes routes: annotations on facilities for healthcare planners.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';
import type { PlannerNote, DimensionKey } from '../engine/types';
import { asStr } from '../utils';

const VALID_DIMENSIONS: Set<string> = new Set([
  'claims_vs_evidence', 'staffing', 'location', 'accreditation',
  'digital', 'completeness', 'consistency',
]);

function toNote(row: Record<string, unknown>): PlannerNote {
  return {
    id: asStr(row.id),
    facility_id: asStr(row.facility_id),
    dimension: VALID_DIMENSIONS.has(asStr(row.dimension))
      ? (asStr(row.dimension) as DimensionKey)
      : undefined,
    note: asStr(row.note),
    decision: row.decision != null ? asStr(row.decision) : undefined,
    created_at: asStr(row.created_at),
  };
}

export function setupPlannerNotesRoutes(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    // ----- Create a planner note -----
    app.post('/api/planner-notes', async (req: Request, res) => {
      try {
        const body = req.body as {
          facility_id?: string;
          dimension?: string;
          note?: string;
          decision?: string;
        };

        if (!body.facility_id || !body.note) {
          res.status(400).json({ error: 'facility_id and note are required' });
          return;
        }

        const dimension = body.dimension && VALID_DIMENSIONS.has(body.dimension)
          ? body.dimension
          : null;

        const db = appkit.lakebase;
        const { rows } = await db.query(
          `INSERT INTO app.planner_notes (facility_id, dimension, note, decision)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [body.facility_id, dimension, body.note, body.decision ?? null],
        );

        if (!rows.length) {
          res.status(500).json({ error: 'Failed to insert note' });
          return;
        }

        res.json({ note: toNote(rows[0]) });
      } catch (e) {
        console.error('[planner-notes] create error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });

    // ----- Get notes for a facility -----
    app.get('/api/planner-notes/:facilityId', async (req: Request, res) => {
      try {
        const facilityId = req.params.facilityId;
        if (!facilityId) {
          res.status(400).json({ error: 'facilityId is required' });
          return;
        }

        const db = appkit.lakebase;
        const { rows } = await db.query(
          'SELECT * FROM app.planner_notes WHERE facility_id = $1 ORDER BY created_at DESC',
          [facilityId],
        );

        const notes: PlannerNote[] = rows.map(toNote);
        res.json({ notes });
      } catch (e) {
        console.error('[planner-notes] list error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

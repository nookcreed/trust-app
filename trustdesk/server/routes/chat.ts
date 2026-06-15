// Chat route: LLM extracts intent from natural language, deterministic engine handles trust.
// The LLM NEVER scores trust or generates health claims.

import type { Request } from 'express';
import type { AppKitLike } from '../types-appkit';
import type { Facility, TrustProfile } from '../engine/types';
import { computeTrustProfile } from '../engine/trust';
import { extractContent, asStr, num } from '../utils';

const SYS = `You are the Facility Trust Desk assistant. You help healthcare planners explore
and understand facility data from India. From the user's message, extract structured intent.

Return ONLY a JSON object:
{
  "intent": "search" | "filter" | "question" | "compare",
  "search_query": "string for SQL ILIKE or null",
  "filters": { "state": "string or null", "type": "string or null", "min_score": number or null },
  "facility_id": "if user references a specific facility",
  "reply": "brief helpful response to the user"
}

IMPORTANT search rules:
- Always separate location from specialty/topic. If the user says "kerala cardiology", set
  filters.state = "Kerala" AND search_query = "cardiology". Do NOT put both in search_query.
- Indian states to recognize: Andhra Pradesh, Bihar, Chhattisgarh, Delhi, Goa, Gujarat,
  Haryana, Himachal Pradesh, Jharkhand, Karnataka, Kerala, Madhya Pradesh, Maharashtra,
  Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Punjab, Rajasthan, Sikkim, Tamil Nadu,
  Telangana, Tripura, Uttar Pradesh, Uttarakhand, West Bengal, Assam, Arunachal Pradesh, Jammu and Kashmir.
- If the user mentions a facility type (hospital, clinic, nursing home), put it in filters.type.
- search_query should contain only the medical specialty, department, or facility name to search for.
- For terse queries like "bihar hospitals" → filters.state="Bihar", filters.type="hospital", search_query=null.

You help users FIND and EXPLORE facilities. You NEVER:
- Assess trust or quality of a facility
- Make health recommendations
- Generate scores or ratings
- Claim a facility is good or bad

If asked about trust/quality, say "Let me pull up the trust profile for that facility —
the deterministic engine will analyze the data." Then set the appropriate intent.`;

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

/** Loosely parse JSON from LLM output that may contain markdown fences or extra text. */
function parseJsonLoose(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v: unknown = JSON.parse(text.slice(a, b + 1));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface ChatIntent {
  intent: 'search' | 'filter' | 'question' | 'compare';
  search_query: string | null;
  filters: { state: string | null; type: string | null; min_score: number | null };
  facility_id: string | null;
  reply: string;
}

function parseIntent(parsed: Record<string, unknown>): ChatIntent {
  const filters = (parsed.filters && typeof parsed.filters === 'object'
    ? parsed.filters
    : {}) as Record<string, unknown>;

  return {
    intent: (['search', 'filter', 'question', 'compare'].includes(asStr(parsed.intent))
      ? asStr(parsed.intent)
      : 'question') as ChatIntent['intent'],
    search_query: typeof parsed.search_query === 'string' ? parsed.search_query : null,
    filters: {
      state: typeof filters.state === 'string' ? filters.state : null,
      type: typeof filters.type === 'string' ? filters.type : null,
      min_score: num(filters.min_score),
    },
    facility_id: typeof parsed.facility_id === 'string' ? parsed.facility_id : null,
    reply: typeof parsed.reply === 'string' ? parsed.reply : '',
  };
}

export function setupChatRoute(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    app.post('/api/chat', async (req: Request, res) => {
      const body = req.body as {
        message?: string;
        context?: { facility_id?: string };
      };
      const message = (typeof body.message === 'string' ? body.message : '').slice(0, 2000);
      const contextFacilityId = body.context?.facility_id ?? null;

      if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      try {
        const db = appkit.lakebase;

        // Step 1: Extract intent from user message via LLM
        let intent: ChatIntent;
        try {
          const contextHint = contextFacilityId
            ? `\nThe user is currently viewing facility ID: ${contextFacilityId}`
            : '';

          const resp = await appkit.serving('default').invoke({
            messages: [
              { role: 'system', content: SYS },
              { role: 'user', content: `${message}${contextHint}` },
            ],
            temperature: 0,
            max_tokens: 500,
          });

          const parsed = parseJsonLoose(extractContent(resp));
          intent = parsed
            ? parseIntent(parsed)
            : { intent: 'question', search_query: null, filters: { state: null, type: null, min_score: null }, facility_id: contextFacilityId, reply: 'I can help you explore facility data. What would you like to find?' };
        } catch (e) {
          console.warn('[chat] LLM call failed:', (e as Error).message);
          intent = {
            intent: 'question',
            search_query: null,
            filters: { state: null, type: null, min_score: null },
            facility_id: contextFacilityId,
            reply: 'I can help you explore facility data. What would you like to find?',
          };
        }

        // Step 2: Execute deterministic actions based on extracted intent
        let facilities: Facility[] | undefined;
        let profile: TrustProfile | undefined;

        // If intent references a specific facility, fetch and run trust profile
        const targetId = intent.facility_id || contextFacilityId;
        if (targetId && (intent.intent === 'question' || intent.intent === 'compare')) {
          const { rows } = await db.query('SELECT * FROM facilities WHERE unique_id = $1', [targetId]);
          if (rows.length) {
            const facility = toFacility(rows[0]);
            profile = computeTrustProfile(facility);
          }
        }

        // If intent is search or filter, query facilities
        if (intent.intent === 'search' || intent.intent === 'filter') {
          const conditions: string[] = [];
          const params: unknown[] = [];
          let paramIdx = 1;

          if (intent.search_query) {
            const pattern = `%${intent.search_query}%`;
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

          if (intent.filters.state) {
            conditions.push(`"address_stateOrRegion" ILIKE $${paramIdx}`);
            params.push(`%${intent.filters.state}%`);
            paramIdx++;
          }

          if (intent.filters.type) {
            conditions.push(`(organization_type ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`);
            params.push(`%${intent.filters.type}%`);
            paramIdx++;
          }

          const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
          const { rows } = await db.query(
            `SELECT * FROM facilities ${where} ORDER BY name LIMIT $${paramIdx}`,
            [...params, 20],
          );
          facilities = rows.map(toFacility);
        }

        res.json({
          reply: intent.reply,
          intent: intent.intent,
          ...(facilities ? { facilities } : {}),
          ...(profile ? { profile } : {}),
        });
      } catch (e) {
        console.error('[chat] error:', (e as Error).message);
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

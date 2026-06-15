// Conversational route: one LLM call per turn extracts/updates a structured profile and
// writes a short warm reply; when the profile is complete, the deterministic engine runs
// and a Statement is returned. (LLM does language; the engine does eligibility.)

import type { Request } from 'express';
import { runCheck, type AppKitLike } from './benefits';
import type { Profile } from '../engine/types';
import { extractContent } from '../utils';

const SYS = `You are BenefitsIQ, a warm assistant that helps U.S. families find government benefits
(SNAP, Medicaid, CHIP, WIC, LIHEAP, school meals). From the conversation so far and the user's new
message, extract a structured profile and write a brief, kind reply.

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "profile": {
    "state": "2-letter US state code or null",
    "household_size": integer or null,
    "monthly_income": number (monthly gross household $) or null — set ONLY if the user explicitly states a dollar amount or says they have zero/no income. Do NOT infer income from employment status (e.g., "lost my job" does NOT mean income is $0 — they may have savings, a partner's income, or severance). If unsure, leave null and ask.",
    "income_uncertain": boolean,
    "recently_lost_job": boolean,
    "has_children": boolean,
    "has_young_children": boolean,
    "is_pregnant": boolean,
    "receives_tanf": boolean,
    "receives_ssi": boolean
  },
  "reply": "one or two short, warm sentences",
  "ready": boolean
}
Rules: merge with the existing profile (keep known values unless the user corrects them). Convert annual
income to monthly (divide by 12). "ready" is true only when state, household_size, and monthly_income are
all known. If something is missing, ask for it warmly in "reply" (one thing at a time). Respond in the
user's language. Never invent eligibility — you only gather facts.

When the profile is already complete, you may be given the user's currently eligible programs and total
in the context. In that case, if the user's new message is a QUESTION rather than a correction, answer it
helpfully and warmly in "reply" using the known profile and the listed programs (e.g. how to apply, what a
program covers, processing times, what each program is). Do NOT invent eligibility or claim they qualify
for anything not in the listed programs — eligibility comes only from the engine. Still keep the profile
fields unchanged unless the user actually corrects a fact.`;

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

function mergeProfile(prev: Profile, next: Record<string, unknown> | undefined): Profile {
  const out: Profile = { ...prev };
  if (!next) return out;
  const setIf = <K extends keyof Profile>(k: K, v: unknown) => {
    if (v !== undefined && v !== null) out[k] = v as Profile[K];
  };
  setIf('state', next.state);
  setIf('household_size', next.household_size);
  setIf('monthly_income', next.monthly_income);
  for (const k of ['income_uncertain', 'recently_lost_job', 'has_children', 'has_young_children', 'is_pregnant', 'receives_tanf', 'receives_ssi'] as const) {
    if (typeof next[k] === 'boolean') out[k] = next[k];
  }
  return out;
}

function missing(p: Profile): string[] {
  const m: string[] = [];
  if (!p.state) m.push('your state');
  if (p.household_size == null) m.push('how many people are in your household');
  if (p.monthly_income == null) m.push('your monthly household income');
  return m;
}

// True if any material eligibility field changed between two profiles. Used to tell
// a correction (re-run + acknowledge) apart from a follow-up question (just answer it).
function profileChanged(prev: Profile, next: Profile): boolean {
  if (prev.state !== next.state) return true;
  if (prev.household_size !== next.household_size) return true;
  if (prev.monthly_income !== next.monthly_income) return true;
  const bools = [
    'income_uncertain', 'recently_lost_job', 'has_children', 'has_young_children',
    'is_pregnant', 'receives_tanf', 'receives_ssi',
  ] as const;
  for (const k of bools) {
    if (!!prev[k] !== !!next[k]) return true;
  }
  return false;
}

export function setupChatRoute(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    app.post('/api/chat', async (req: Request, res) => {
      const body = (req.body ?? {}) as { profile?: Profile; message?: unknown };
      const prev: Profile = body.profile ?? {};
      const message = (typeof body.message === 'string' ? body.message : '').slice(0, 2000);
      try {
        const prevReady = missing(prev).length === 0;

        // If the profile was already complete coming in, run the engine on the prior
        // profile first so the model can answer follow-up questions grounded in the
        // user's actual eligible programs + total (it never invents eligibility).
        let prevContext = '';
        if (prevReady) {
          try {
            const prevStmt = await runCheck(appkit, prev, req);
            if (prevStmt) {
              const names = prevStmt.programs.map((p) => p.short_name);
              prevContext = `\nThe user's profile is already complete. Currently eligible programs: ${
                names.length ? names.join(', ') : 'none found'
              }. Estimated total: $${prevStmt.total.toLocaleString()}/year.`;
            }
          } catch (e) {
            console.warn('[chat] prev check failed:', (e as Error).message);
          }
        }

        let reply = '';
        let profile = prev;
        try {
          const resp = await appkit
            .serving('default')
            .invoke({
              messages: [
                { role: 'system', content: SYS },
                { role: 'user', content: `Existing profile: ${JSON.stringify(prev)}${prevContext}\nUser says: "${message}"` },
              ],
              temperature: 0,
              max_tokens: 600,
            });
          const parsed = parseJsonLoose(extractContent(resp));
          if (parsed) {
            profile = mergeProfile(prev, parsed.profile as Record<string, unknown>);
            reply = typeof parsed.reply === 'string' ? parsed.reply : '';
          }
        } catch (e) {
          console.warn('[chat] LLM call failed:', (e as Error).message);
        }

        const need = missing(profile);
        const ready = need.length === 0;
        const changed = profileChanged(prev, profile);

        let statement: Awaited<ReturnType<typeof runCheck>> = null;
        if (ready) {
          try {
            statement = await runCheck(appkit, profile, req);
          } catch (e) {
            console.warn('[chat] check failed:', (e as Error).message);
          }
        }

        if (statement && !prevReady) {
          // First time the profile became complete: present the canned summary.
          const n = statement.programs.length;
          const amt = statement.total.toLocaleString();
          reply = n
            ? `You likely qualify for ${n} program${n === 1 ? '' : 's'} worth about $${amt}/year — your Statement is below. If anything looks off (household size, income, kids), just tell me and I'll update it.`
            : `Based on what you shared I didn't find programs you clearly qualify for, but eligibility is close for many — tell me more (kids, recent job loss, exact income) and I'll re-check.`;
        } else if (statement && changed) {
          // A correction to an already-complete profile: re-run and acknowledge the update.
          const n = statement.programs.length;
          const amt = statement.total.toLocaleString();
          reply = n
            ? `Updated your Statement — you now likely qualify for ${n} program${n === 1 ? '' : 's'} worth about $${amt}/year. See below.`
            : `I re-checked with your update — I still don't find programs you clearly qualify for, but tell me more and I'll keep looking.`;
        } else if (statement) {
          // Profile complete and unchanged: this is a follow-up question. Use the
          // model's own reply; only fall back if it came back empty.
          if (!reply) {
            reply = "Happy to help with that — could you tell me a bit more about what you'd like to know?";
          }
        } else if (!reply) {
          reply = ready
            ? 'Let me pull that together for you.'
            : `To find what you qualify for, could you tell me ${need[0]}?`;
        }
        res.json({ reply, profile, statement: statement || undefined });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}

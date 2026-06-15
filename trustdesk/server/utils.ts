// Shared utility helpers for Facility Trust Desk server routes.

// ---------------------------------------------------------------------------
// Model Serving response extraction: robustly pull text from the various
// response shapes Databricks Model Serving may return.
// ---------------------------------------------------------------------------

/**
 * Extract the text content from a Model Serving response. Handles OpenAI-style
 * chat completions, raw predictions, message arrays, and plain strings.
 */
export function extractContent(resp: unknown): string {
  if (typeof resp === 'string') return resp;
  if (!resp || typeof resp !== 'object') return '';
  const top = resp as Record<string, unknown>;
  const data = (top.data && typeof top.data === 'object' ? top.data : top) as Record<string, unknown>;
  const choices = data.choices as Array<{ message?: { content?: string }; text?: string }> | undefined;
  if (choices && choices[0]) {
    const mc = choices[0].message?.content;
    if (typeof mc === 'string') return mc;
    if (typeof choices[0].text === 'string') return choices[0].text;
  }
  const msgs = data.messages as Array<{ content?: string }> | undefined;
  if (msgs && msgs.length) {
    const c = msgs[msgs.length - 1]?.content;
    if (typeof c === 'string') return c;
  }
  if (typeof data.content === 'string') return data.content;
  const preds = data.predictions;
  if (typeof preds === 'string') return preds;
  if (Array.isArray(preds) && typeof preds[0] === 'string') return preds[0];
  return '';
}

// ---------------------------------------------------------------------------
// Primitive coercions: safely convert unknown DB/JSON values to typed scalars.
// ---------------------------------------------------------------------------

/** Coerce an unknown value to a finite number, or null. */
export function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce an unknown value to a string (primitives only; objects -> empty). */
export function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return '';
}

/**
 * Parse a stringified array like "['a','b','c']" or a CSV like "a,b,c"
 * into a clean string[]. Also handles actual JSON arrays and null/undefined.
 */
export function parseJsonArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
  if (typeof v !== 'string') return [];
  const s = v.trim();
  if (!s) return [];

  // Try JSON parse first (handles "['a','b']" after replacing single quotes)
  try {
    const normalized = s.replace(/'/g, '"');
    const parsed: unknown = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    }
  } catch {
    // fall through to CSV split
  }

  // CSV fallback
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

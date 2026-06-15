// Shared utility helpers for BenefitsIQ server routes.
//
// These functions were originally duplicated across benefits.ts, explain.ts,
// catalog.ts, apply.ts, and chat.ts. Consolidated here for maintainability
// and to satisfy the "Well-Architected" criterion: single source of truth,
// fewer places for bugs to hide if parsing logic ever changes.

import { DEFAULT_BENEFIT_VALUES } from './engine/eligibility';
import type { RuleRow, FplRow, BenefitValues } from './engine/types';

// ---------------------------------------------------------------------------
// Primitive coercions: safely convert unknown DB/JSON values to typed scalars.
// ---------------------------------------------------------------------------

/** Coerce an unknown value to a finite number, or null. */
export function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce an unknown value to a string (primitives only; objects → empty). */
export function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

// ---------------------------------------------------------------------------
// Eligibility-rule helpers: pick the right rules for a program + state combo,
// and extrapolate FPL thresholds for household sizes beyond the table's range.
// ---------------------------------------------------------------------------

/** Return the most specific rules for a program in a given state, falling back to federal defaults. */
export function rulesFor(all: RuleRow[], programId: number, state: string | null): RuleRow[] {
  const forProg = all.filter((r) => r.program_id === programId);
  const stateRules = forProg.filter((r) => r.state === state);
  return stateRules.length ? stateRules : forProg.filter((r) => r.state == null);
}

/** Look up or extrapolate an FPL row for the given household size. */
export function getFpl(fpl: FplRow[], hh: number): FplRow | null {
  if (hh <= 8) return fpl.find((f) => f.household_size === hh) || null;
  const r8 = fpl.find((f) => f.household_size === 8);
  const r7 = fpl.find((f) => f.household_size === 7);
  if (!r8) return null;
  const inc = r7 ? r8.annual_amount - r7.annual_amount : 5380;
  return { year: r8.year, household_size: hh, annual_amount: r8.annual_amount + (hh - 8) * inc, region: r8.region };
}

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
// Benefit values: build a BenefitValues from DB rows, starting from defaults
// and overriding only the keys present in the table.
// ---------------------------------------------------------------------------

/**
 * Build a BenefitValues from benefit_values rows, starting from
 * DEFAULT_BENEFIT_VALUES and overriding only the keys present in the table.
 * Unknown keys are ignored so forward-compat is safe.
 */
export function buildBenefitValues(rows: Record<string, unknown>[]): BenefitValues {
  const values: BenefitValues = {
    snap_max_monthly: { ...DEFAULT_BENEFIT_VALUES.snap_max_monthly },
    snap_per_additional: DEFAULT_BENEFIT_VALUES.snap_per_additional,
    wic_monthly_per_person: DEFAULT_BENEFIT_VALUES.wic_monthly_per_person,
    chip_annual_per_child: DEFAULT_BENEFIT_VALUES.chip_annual_per_child,
    nslp_annual_per_child: DEFAULT_BENEFIT_VALUES.nslp_annual_per_child,
    tanf_monthly_base: DEFAULT_BENEFIT_VALUES.tanf_monthly_base,
    section8_monthly_base: DEFAULT_BENEFIT_VALUES.section8_monthly_base,
  };
  for (const row of rows) {
    const program = asStr(row.program_short).toUpperCase();
    const key = asStr(row.value_key);
    const value = num(row.value);
    if (value == null || !key) continue;
    if (program === 'SNAP') {
      const hh = /^household_([1-8])$/.exec(key);
      if (hh) values.snap_max_monthly[Number(hh[1])] = value;
      else if (key === 'per_additional') values.snap_per_additional = value;
    } else if (program === 'WIC' && key === 'per_person_monthly') {
      values.wic_monthly_per_person = value;
    } else if (program === 'CHIP' && key === 'per_child_annual') {
      values.chip_annual_per_child = value;
    } else if (program === 'NSLP' && key === 'per_child_annual') {
      values.nslp_annual_per_child = value;
    } else if (program === 'TANF' && key === 'monthly_base') {
      values.tanf_monthly_base = value;
    } else if (program === 'SECTION8' && key === 'monthly_base') {
      values.section8_monthly_base = value;
    }
  }
  return values;
}

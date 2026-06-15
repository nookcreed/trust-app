// Unit tests for the deterministic eligibility engine — the core differentiator vs. a
// chatbot: same inputs always produce the same, explainable, auditable result. The LLM
// never decides eligibility; this pure function does.

import { describe, it, expect } from 'vitest';
import { evaluateProgram, DEFAULT_BENEFIT_VALUES } from './eligibility';
import { householdBand, incomeBand, situationOf, matchCohort, K_ANON_FLOOR } from './cohort';
import type { CohortRow } from './cohort';
import type { Profile, ProgramRow, RuleRow, FplRow } from './types';

const prog = (short: string): ProgramRow => ({
  id: 1, name: short, short_name: short, category: null, description: null, admin_agency: null,
});

const rule = (over: Partial<RuleRow>): RuleRow => ({
  id: 1, program_id: 1, state: 'GA', household_size: null, max_gross_monthly: null,
  max_net_monthly: null, max_pct_fpl: null, categorical_eligible: false, notes: null, ...over,
});

const fpl = (household_size: number, annual_amount: number): FplRow => ({
  year: 2024, household_size, annual_amount, region: 'contiguous',
});

describe('SNAP — gross income test', () => {
  it('is eligible when income is under the gross limit, with the correct annual value', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 0 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null);
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('likely');
    // hh3 max allotment 766/mo, $0 income -> full benefit -> 766*12
    expect(r.estimated_annual_value).toBe(9192);
  });

  it('is ineligible when income exceeds the gross limit (engine rules it OUT with a reason)', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 3000 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null);
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('unlikely');
    expect(r.estimated_annual_value).toBeNull();
    expect(r.reason).toContain('exceeds the');
  });

  it('is borderline when income is between 90% and 100% of the limit', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 2100 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null);
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('borderline');
  });
});

describe('SNAP — benefit is income-sensitive (real net-income formula)', () => {
  it('reduces the benefit as income rises, and stays deterministic', () => {
    const base = { state: 'GA', household_size: 4 } as const;
    const r0 = evaluateProgram({ ...base, monthly_income: 0 }, prog('SNAP'), [rule({ max_gross_monthly: 3500 })], null);
    const r1 = evaluateProgram({ ...base, monthly_income: 1000 }, prog('SNAP'), [rule({ max_gross_monthly: 3500 })], null);
    const r2 = evaluateProgram({ ...base, monthly_income: 2000 }, prog('SNAP'), [rule({ max_gross_monthly: 3500 })], null);
    // hh4 max 973/mo: $0 -> 11676; $1000 -> 9516; $2000 -> 6636
    expect(r0.estimated_annual_value).toBe(11676);
    expect(r1.estimated_annual_value).toBe(9516);
    expect(r2.estimated_annual_value).toBe(6636);
    expect((r0.estimated_annual_value ?? 0)).toBeGreaterThan(r1.estimated_annual_value ?? 0);
    expect((r1.estimated_annual_value ?? 0)).toBeGreaterThan(r2.estimated_annual_value ?? 0);
  });
});

describe('Categorical eligibility (TANF/SSI) bypasses the income test', () => {
  it('is eligible via TANF even when income is above the gross limit', () => {
    const p: Profile = { state: 'GA', household_size: 2, monthly_income: 9000, receives_tanf: true };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 1500, categorical_eligible: true })], null);
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('likely');
    expect(r.reason).toContain('Categorically eligible');
  });
});

describe('Household-composition gates (applied before income)', () => {
  it('rules CHIP out when there are no children', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 0 };
    const r = evaluateProgram(p, prog('CHIP'), [rule({ max_pct_fpl: 2.5 })], fpl(1, 15060));
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain('children only');
  });

  it('rules WIC out when not pregnant and no young children', () => {
    const p: Profile = { state: 'GA', household_size: 2, monthly_income: 0, has_children: true };
    const r = evaluateProgram(p, prog('WIC'), [rule({ max_pct_fpl: 1.85 })], fpl(2, 20440));
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain('pregnant');
  });

  it('rules NSLP out when there are no children', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 0 };
    const r = evaluateProgram(p, prog('NSLP'), [rule({ max_pct_fpl: 1.85 })], fpl(1, 15060));
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain('children');
  });

  it('values CHIP per child when eligible', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 1000, has_children: true };
    const r = evaluateProgram(p, prog('CHIP'), [rule({ max_pct_fpl: 2.5 })], fpl(3, 25820));
    expect(r.eligible).toBe(true);
    // chip 3600/child * max(1, hh-1) = 3600 * 2
    expect(r.estimated_annual_value).toBe(7200);
  });
});

describe('FPL-percentage rule (Medicaid-style)', () => {
  it('is eligible when income is under the FPL percentage limit', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 2000 };
    const r = evaluateProgram(p, prog('MEDICAID'), [rule({ max_pct_fpl: 1.38 })], fpl(3, 25820));
    expect(r.eligible).toBe(true);
    expect(r.reason).toContain('federal poverty level');
  });

  it('is ineligible in a non-expansion state (max_pct_fpl = 0)', () => {
    const p: Profile = { state: 'TX', household_size: 3, monthly_income: 1000 };
    const r = evaluateProgram(p, prog('MEDICAID'), [rule({ max_pct_fpl: 0, notes: 'State has not expanded Medicaid.' })], fpl(3, 25820));
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('unlikely');
  });
});

describe('Insufficient inputs are flagged, never guessed', () => {
  it('requires verification when income is missing', () => {
    const p: Profile = { state: 'GA', household_size: 3 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null);
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('requires_verification');
  });

  it('requires verification when no rules exist for the state', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 0 };
    const r = evaluateProgram(p, prog('SNAP'), [], null);
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('requires_verification');
    expect(r.reason).toContain('No eligibility rules');
  });
});

describe('Determinism + data-driven values', () => {
  it('produces identical output for identical input', () => {
    const p: Profile = { state: 'GA', household_size: 4, monthly_income: 1500 };
    const a = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 3500 })], null);
    const b = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 3500 })], null);
    expect(a).toEqual(b);
  });

  it('uses injected benefit values (values are data, not code)', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 0 };
    const custom = { ...DEFAULT_BENEFIT_VALUES, snap_max_monthly: { ...DEFAULT_BENEFIT_VALUES.snap_max_monthly, 3: 1000 } };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null, custom);
    expect(r.estimated_annual_value).toBe(12000); // 1000/mo * 12
  });
});

describe('TANF — composition gate + value estimation ("adding a program is adding data")', () => {
  it('is eligible with children under FPL threshold, with scaled annual value', () => {
    // Family of 3 in GA, income well under 50% FPL -> eligible
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 500, has_children: true };
    const r = evaluateProgram(p, prog('TANF'), [rule({ max_pct_fpl: 0.50 })], fpl(3, 25820));
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('likely');
    // tanf_monthly_base 400, hh3 -> 400/mo * 12 = 4800
    expect(r.estimated_annual_value).toBe(4800);
  });

  it('rules TANF out without children (composition gate)', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 0 };
    const r = evaluateProgram(p, prog('TANF'), [rule({ max_pct_fpl: 0.50 })], fpl(1, 15060));
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain('dependent children');
  });

  it('scales TANF value for larger households', () => {
    // Family of 5: base 400 + 2 extra members * 80 = 560/mo * 12 = 6720
    const p: Profile = { state: 'GA', household_size: 5, monthly_income: 0, has_children: true };
    const r = evaluateProgram(p, prog('TANF'), [rule({ max_pct_fpl: 0.50 })], fpl(5, 36580));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(6720);
  });
});

describe('SECTION8 — income test + flat value estimation', () => {
  it('is eligible under income threshold with flat housing voucher value', () => {
    // Individual in GA, income under 50% FPL -> eligible
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400 };
    const r = evaluateProgram(p, prog('SECTION8'), [rule({ max_pct_fpl: 0.50 })], fpl(1, 15060));
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('likely');
    // section8_monthly_base 1000 * 12 = 12000 (flat, doesn't scale with household)
    expect(r.estimated_annual_value).toBe(12000);
  });

  it('does NOT have a composition gate (available to individuals without children)', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 0 };
    const r = evaluateProgram(p, prog('SECTION8'), [rule({ max_pct_fpl: 0.50 })], fpl(1, 15060));
    // Should be eligible even without children — Section 8 has no composition gate
    expect(r.eligible).toBe(true);
  });

  it('is ineligible when income exceeds the FPL threshold', () => {
    // Income at 80% FPL, threshold is 50% FPL -> ineligible
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 1800 };
    const r = evaluateProgram(p, prog('SECTION8'), [rule({ max_pct_fpl: 0.50 })], fpl(3, 25820));
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('unlikely');
  });
});

// ---------------------------------------------------------------------------
// income_uncertain modifier
// ---------------------------------------------------------------------------
describe('income_uncertain modifier', () => {
  it('upgrades ineligible confidence from unlikely to requires_verification', () => {
    // Income above the limit -> normally "unlikely", but income_uncertain upgrades it
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 3000, income_uncertain: true };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null);
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('requires_verification');
    expect(r.reason).toContain('approximate');
  });

  it('does NOT change the result when eligible (income_uncertain only affects ineligible)', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 500, income_uncertain: true };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2152 })], null);
    expect(r.eligible).toBe(true);
    // Confidence stays 'likely' (well under 90% of limit) — uncertainty does not downgrade
    expect(r.confidence).toBe('likely');
  });

  it('upgrades FPL-based ineligible confidence when income is uncertain', () => {
    // Income above 138% FPL for Medicaid -> ineligible; income_uncertain -> requires_verification
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 4000, income_uncertain: true };
    const r = evaluateProgram(p, prog('MEDICAID'), [rule({ max_pct_fpl: 1.38 })], fpl(3, 25820));
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('requires_verification');
    expect(r.reason).toContain('approximate');
  });
});

// ---------------------------------------------------------------------------
// edgeCaseNotes — job loss advice
// ---------------------------------------------------------------------------
describe('edgeCaseNotes — job loss advice for SNAP and Medicaid', () => {
  it('adds job-loss guidance for SNAP when recently_lost_job is true', () => {
    const p: Profile = { state: 'GA', household_size: 2, monthly_income: 0, recently_lost_job: true, job_loss_weeks_ago: 3 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 1500 })], null);
    expect(r.eligible).toBe(true);
    expect(r.notes).toContain('current income');
    expect(r.notes).toContain('expedited processing');
    expect(r.notes).toContain('3 week(s) ago');
  });

  it('adds job-loss guidance for Medicaid when recently_lost_job is true', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 0, recently_lost_job: true };
    const r = evaluateProgram(p, prog('MEDICAID'), [rule({ max_pct_fpl: 1.38 })], fpl(3, 25820));
    expect(r.eligible).toBe(true);
    expect(r.notes).toContain('current income');
    expect(r.notes).toContain('recently');
  });

  it('does NOT add notes for non-SNAP/Medicaid programs even with job loss', () => {
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 0, recently_lost_job: true, has_children: true };
    const r = evaluateProgram(p, prog('TANF'), [rule({ max_pct_fpl: 0.50 })], fpl(3, 25820));
    expect(r.eligible).toBe(true);
    expect(r.notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SNAP benefit for large households (size > 8) — per_additional extrapolation
// ---------------------------------------------------------------------------
describe('SNAP — large household extrapolation (size > 8)', () => {
  it('extrapolates max allotment using per_additional for household of 10', () => {
    // snapMaxMonthly(10) = snap_max_monthly[8] + (10-8) * snap_per_additional
    //                    = 1751 + 2 * 219 = 2189
    // With $0 income: full allotment -> 2189 * 12 = 26268
    const p: Profile = { state: 'GA', household_size: 10, monthly_income: 0 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 5000 })], null);
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(2189 * 12); // 26268
  });

  it('extrapolates correctly for household of 12', () => {
    // snapMaxMonthly(12) = 1751 + (12-8) * 219 = 1751 + 876 = 2627
    const p: Profile = { state: 'GA', household_size: 12, monthly_income: 0 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 6000 })], null);
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(2627 * 12); // 31524
  });
});

// ---------------------------------------------------------------------------
// WIC value estimation — participant counting
// ---------------------------------------------------------------------------
describe('WIC — value estimation with participant counting', () => {
  it('counts pregnant woman as 1 participant (no young children)', () => {
    // is_pregnant=true, has_young_children=false -> participants = 1
    // value = 50 * 1 * 12 = 600
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 0, is_pregnant: true };
    const r = evaluateProgram(p, prog('WIC'), [rule({ max_pct_fpl: 1.85 })], fpl(1, 15060));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(600);
  });

  it('counts young children as max(1, hh-1) participants (no pregnancy)', () => {
    // has_young_children=true, hh=4 -> participants = max(1, 4-1) = 3
    // value = 50 * 3 * 12 = 1800
    const p: Profile = { state: 'GA', household_size: 4, monthly_income: 0, has_young_children: true };
    const r = evaluateProgram(p, prog('WIC'), [rule({ max_pct_fpl: 1.85 })], fpl(4, 31200));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(1800);
  });

  it('counts both pregnant + young children (pregnant adds 1)', () => {
    // is_pregnant=true + has_young_children=true, hh=3
    // participants = 1 + max(1, 3-1) = 1 + 2 = 3
    // value = 50 * 3 * 12 = 1800
    const p: Profile = { state: 'GA', household_size: 3, monthly_income: 0, is_pregnant: true, has_young_children: true };
    const r = evaluateProgram(p, prog('WIC'), [rule({ max_pct_fpl: 1.85 })], fpl(3, 25820));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(1800);
  });
});

// ---------------------------------------------------------------------------
// NSLP value estimation — scales by number of children
// ---------------------------------------------------------------------------
describe('NSLP — value scales by number of children', () => {
  it('estimates for a 2-person household (1 child)', () => {
    // nslp_annual_per_child * max(1, hh-1) = 900 * max(1, 2-1) = 900
    const p: Profile = { state: 'GA', household_size: 2, monthly_income: 0, has_children: true };
    const r = evaluateProgram(p, prog('NSLP'), [rule({ max_pct_fpl: 1.85 })], fpl(2, 20440));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(900);
  });

  it('estimates for a 5-person household (4 children)', () => {
    // 900 * max(1, 5-1) = 900 * 4 = 3600
    const p: Profile = { state: 'GA', household_size: 5, monthly_income: 0, has_children: true };
    const r = evaluateProgram(p, prog('NSLP'), [rule({ max_pct_fpl: 1.85 })], fpl(5, 36580));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(3600);
  });
});

// ---------------------------------------------------------------------------
// Negative and edge inputs — the engine must not crash or produce nonsense
// ---------------------------------------------------------------------------
describe('Negative and edge inputs', () => {
  it('handles household_size=0 by falling back to 1', () => {
    // household_size 0 -> engine uses || 1 fallback
    const p: Profile = { state: 'GA', household_size: 0, monthly_income: 0 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 2000 })], null);
    expect(r.eligible).toBe(true);
    // hh falls back to 1 for SNAP value: snapMaxMonthly(1)=291, $0 income -> 291*12 = 3492
    expect(r.estimated_annual_value).toBe(291 * 12);
  });

  it('handles negative income without crashing', () => {
    // monthly_income=-100 is unusual but should still be evaluated (net clamped to 0)
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: -100 };
    const r = evaluateProgram(p, prog('SNAP'), [rule({ max_gross_monthly: 1500 })], null);
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('likely');
  });

  it('handles household_size=1 with has_children=true (unusual but valid)', () => {
    // CHIP with hh=1 and has_children=true: passes composition gate
    // max(1, 1-1) = max(1,0) = 1 child -> 3600 * 1 = 3600
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 0, has_children: true };
    const r = evaluateProgram(p, prog('CHIP'), [rule({ max_pct_fpl: 2.5 })], fpl(1, 15060));
    expect(r.eligible).toBe(true);
    expect(r.estimated_annual_value).toBe(3600);
  });

  it('sanitizes household_size=0 to 1 via defensive guard (does not crash)', () => {
    // Verify the input sanitization path: household_size=0 is treated as 1
    // at the top of evaluateProgram(), not just via || fallbacks deep in the code.
    const p: Profile = { state: 'GA', household_size: 0, monthly_income: 500 };
    const r = evaluateProgram(p, prog('SNAP'), [
      rule({ household_size: 1, max_gross_monthly: 1500 }),
      rule({ household_size: 2, max_gross_monthly: 2000 }),
    ], null);
    expect(r.eligible).toBe(true);
    // Should match the household_size=1 rule, not the household_size=2 rule
    expect(r.reason).toContain('$1,500');
  });

  it('sanitizes monthly_income=-100 to 0 via defensive guard (does not crash)', () => {
    // Verify the input sanitization path: negative income is clamped to 0
    // at the top of evaluateProgram(), producing the same result as income=0.
    const pNeg: Profile = { state: 'GA', household_size: 1, monthly_income: -100 };
    const pZero: Profile = { state: 'GA', household_size: 1, monthly_income: 0 };
    const rules = [rule({ max_gross_monthly: 1500 })];
    const rNeg = evaluateProgram(pNeg, prog('SNAP'), rules, null);
    const rZero = evaluateProgram(pZero, prog('SNAP'), rules, null);
    // Both should produce identical results — negative income is treated as 0
    expect(rNeg.eligible).toBe(true);
    expect(rNeg.estimated_annual_value).toEqual(rZero.estimated_annual_value);
    expect(rNeg.reason).toEqual(rZero.reason);
  });
});

// ---------------------------------------------------------------------------
// Data-driven extensibility — "programs are data, not code"
// ---------------------------------------------------------------------------
describe('Data-driven extensibility — a NEW program evaluates without code changes', () => {
  it('evaluates a hypothetical TESTPROG using only data (no engine code changes)', () => {
    // Create a completely new program that the engine has never seen
    const testProg: ProgramRow = {
      id: 99, name: 'Test Assistance Program', short_name: 'TESTPROG',
      category: 'testing', description: 'Hypothetical program', admin_agency: 'Test Agency',
    };
    const testRule: RuleRow = {
      id: 99, program_id: 99, state: 'NY', household_size: null,
      max_gross_monthly: 2000, max_net_monthly: null, max_pct_fpl: null,
      categorical_eligible: false, notes: null,
    };
    const p: Profile = { state: 'NY', household_size: 2, monthly_income: 1500 };
    const r = evaluateProgram(p, testProg, [testRule], null);
    // Engine correctly evaluates eligibility using the gross income rule
    expect(r.eligible).toBe(true);
    expect(r.confidence).toBe('likely');
    expect(r.program_short_name).toBe('TESTPROG');
    expect(r.program_name).toBe('Test Assistance Program');
    // No value estimator for unknown programs — annual value is null (safe default)
    expect(r.estimated_annual_value).toBeNull();
  });

  it('evaluates TESTPROG as ineligible when income exceeds the rule threshold', () => {
    const testProg: ProgramRow = {
      id: 99, name: 'Test Assistance Program', short_name: 'TESTPROG',
      category: 'testing', description: null, admin_agency: null,
    };
    const testRule: RuleRow = {
      id: 99, program_id: 99, state: 'NY', household_size: null,
      max_gross_monthly: 2000, max_net_monthly: null, max_pct_fpl: null,
      categorical_eligible: false, notes: null,
    };
    const p: Profile = { state: 'NY', household_size: 2, monthly_income: 3000 };
    const r = evaluateProgram(p, testProg, [testRule], null);
    expect(r.eligible).toBe(false);
    expect(r.confidence).toBe('unlikely');
  });

  it('evaluates TESTPROG with FPL-based rules (no hardcoded program list)', () => {
    const testProg: ProgramRow = {
      id: 100, name: 'FPL Test Program', short_name: 'FPLTEST',
      category: 'testing', description: null, admin_agency: null,
    };
    const testRule: RuleRow = {
      id: 100, program_id: 100, state: 'CA', household_size: null,
      max_gross_monthly: null, max_net_monthly: null, max_pct_fpl: 2.0,
      categorical_eligible: false, notes: null,
    };
    const p: Profile = { state: 'CA', household_size: 4, monthly_income: 1000 };
    const r = evaluateProgram(p, testProg, [testRule], fpl(4, 31200));
    expect(r.eligible).toBe(true);
    expect(r.program_short_name).toBe('FPLTEST');
  });
});

// ---------------------------------------------------------------------------
// Cohort matching — householdBand, incomeBand, matchCohort, k-anonymity
// ---------------------------------------------------------------------------

const cohortRow = (over: Partial<CohortRow>): CohortRow => ({
  state: 'GA',
  household_band: '1',
  income_band: 'very_low',
  situation: 'baseline',
  programs_typical: '["SNAP","MEDICAID"]',
  typical_apply_order: '["SNAP","MEDICAID"]',
  avg_processing_days: 14,
  expedited_pct: 0.25,
  modeled_n: 150,
  source_citation: 'CPS ASEC 2023',
  source_url: null,
  effective_date: null,
  ...over,
});

describe('Cohort — householdBand', () => {
  it('returns "1" for household size 1', () => {
    expect(householdBand(1)).toBe('1');
  });

  it('returns "2" for household size 2', () => {
    expect(householdBand(2)).toBe('2');
  });

  it('returns "3" for household size 3', () => {
    expect(householdBand(3)).toBe('3');
  });

  it('returns "4plus" for household size 4', () => {
    expect(householdBand(4)).toBe('4plus');
  });

  it('returns "4plus" for household size 8', () => {
    expect(householdBand(8)).toBe('4plus');
  });
});

describe('Cohort — incomeBand', () => {
  it('returns "very_low" when income < 50% FPL', () => {
    // hh=1, FPL_100_MONTHLY[1]=1250, income=400 -> 400/1250=0.32 < 0.5 -> very_low
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400 };
    expect(incomeBand(p)).toBe('very_low');
  });

  it('returns "low" when income is 50-99% FPL', () => {
    // hh=1, FPL_100_MONTHLY[1]=1250, income=800 -> 800/1250=0.64 -> low
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 800 };
    expect(incomeBand(p)).toBe('low');
  });

  it('returns "moderate" when income is 100-184% FPL', () => {
    // hh=1, FPL_100_MONTHLY[1]=1250, income=1500 -> 1500/1250=1.2 -> moderate
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 1500 };
    expect(incomeBand(p)).toBe('moderate');
  });

  it('returns "above" when income >= 185% FPL', () => {
    // hh=1, FPL_100_MONTHLY[1]=1250, income=2500 -> 2500/1250=2.0 -> above
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 2500 };
    expect(incomeBand(p)).toBe('above');
  });

  it('defaults to very_low when income is missing (0)', () => {
    const p: Profile = { state: 'GA', household_size: 3 };
    expect(incomeBand(p)).toBe('very_low');
  });
});

describe('Cohort — situationOf', () => {
  it('returns "job_loss" when recently_lost_job is true', () => {
    expect(situationOf({ recently_lost_job: true })).toBe('job_loss');
  });

  it('returns "pregnant" when is_pregnant is true (and no job loss)', () => {
    expect(situationOf({ is_pregnant: true })).toBe('pregnant');
  });

  it('returns "has_young_children" when has_young_children is true', () => {
    expect(situationOf({ has_young_children: true })).toBe('has_young_children');
  });

  it('returns "baseline" when no special situation flags', () => {
    expect(situationOf({ state: 'GA', household_size: 2 })).toBe('baseline');
  });

  it('prioritizes job_loss over pregnancy', () => {
    expect(situationOf({ recently_lost_job: true, is_pregnant: true })).toBe('job_loss');
  });
});

describe('Cohort — matchCohort finds exact match', () => {
  it('returns the exact-match cohort when available', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400 };
    const rows = [
      cohortRow({ household_band: '1', income_band: 'very_low', situation: 'baseline', modeled_n: 200 }),
      cohortRow({ household_band: '2', income_band: 'low', situation: 'baseline', modeled_n: 100 }),
    ];
    const c = matchCohort(rows, p);
    expect(c).not.toBeNull();
    expect(c!.modeled_n).toBe(200);
    expect(c!.programs_typical).toEqual(['SNAP', 'MEDICAID']);
  });
});

describe('Cohort — matchCohort widens progressively on miss', () => {
  it('falls back to baseline situation when exact situation is missing', () => {
    // Profile situation is job_loss, but no cohort for job_loss — falls back to baseline
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400, recently_lost_job: true };
    const rows = [
      // No job_loss row, only baseline for this band
      cohortRow({ household_band: '1', income_band: 'very_low', situation: 'baseline', modeled_n: 50 }),
    ];
    const c = matchCohort(rows, p);
    expect(c).not.toBeNull();
    expect(c!.modeled_n).toBe(50);
  });

  it('falls back to household band only when income band also misses', () => {
    // Profile income_band is very_low, but only a "low" row exists for this hh band
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 100 }; // very_low
    const rows = [
      // income band doesn't match (low, not very_low), but same hh band + baseline
      cohortRow({ household_band: '1', income_band: 'low', situation: 'baseline', modeled_n: 80 }),
    ];
    const c = matchCohort(rows, p);
    expect(c).not.toBeNull();
    expect(c!.modeled_n).toBe(80);
  });

  it('returns null when no rows match the household band', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400 };
    const rows = [
      // Only hh band "4plus" available — does not match hh=1
      cohortRow({ household_band: '4plus', income_band: 'very_low', situation: 'baseline', modeled_n: 200 }),
    ];
    const c = matchCohort(rows, p);
    expect(c).toBeNull();
  });
});

describe('Cohort — k-anonymity floor (n >= 30)', () => {
  it('returns the cohort when modeled_n meets the floor', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400 };
    const rows = [
      cohortRow({ household_band: '1', income_band: 'very_low', situation: 'baseline', modeled_n: K_ANON_FLOOR }),
    ];
    const c = matchCohort(rows, p);
    expect(c).not.toBeNull();
    expect(c!.modeled_n).toBe(K_ANON_FLOOR);
  });

  it('suppresses the cohort when modeled_n is below the floor', () => {
    const p: Profile = { state: 'GA', household_size: 1, monthly_income: 400 };
    const rows = [
      cohortRow({ household_band: '1', income_band: 'very_low', situation: 'baseline', modeled_n: K_ANON_FLOOR - 1 }),
    ];
    const c = matchCohort(rows, p);
    // n=29 is below k-anon floor of 30 — must suppress
    expect(c).toBeNull();
  });

  it('skips small cohorts and picks a larger valid one during widening', () => {
    const p: Profile = { state: 'GA', household_size: 2, monthly_income: 300, recently_lost_job: true };
    const rows = [
      // Exact match has n < 30 (too small)
      cohortRow({ household_band: '2', income_band: 'very_low', situation: 'job_loss', modeled_n: 10 }),
      // Wider match (baseline for same hh+income band) is large enough
      cohortRow({ household_band: '2', income_band: 'very_low', situation: 'baseline', modeled_n: 100 }),
    ];
    const c = matchCohort(rows, p);
    expect(c).not.toBeNull();
    // Should have picked the baseline row (n=100) after skipping the small exact match
    expect(c!.modeled_n).toBe(100);
  });
});

describe('Cohort — matchCohort returns null for missing profile fields', () => {
  it('returns null when state is missing', () => {
    const p: Profile = { household_size: 2, monthly_income: 500 };
    const c = matchCohort([cohortRow({})], p);
    expect(c).toBeNull();
  });

  it('returns null when household_size is missing', () => {
    const p: Profile = { state: 'GA', monthly_income: 500 };
    const c = matchCohort([cohortRow({})], p);
    expect(c).toBeNull();
  });
});

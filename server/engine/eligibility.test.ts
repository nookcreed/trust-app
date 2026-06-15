// Unit tests for the deterministic eligibility engine — the core differentiator vs. a
// chatbot: same inputs always produce the same, explainable, auditable result. The LLM
// never decides eligibility; this pure function does.

import { describe, it, expect } from 'vitest';
import { evaluateProgram, DEFAULT_BENEFIT_VALUES } from './eligibility';
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
    expect(r.reason).toContain('vs. limit');
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
    expect(r.reason).toContain('% FPL');
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

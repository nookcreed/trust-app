// Deterministic eligibility engine — faithful TypeScript port of
// benefitsiq/engine/eligibility.py. Pure functions, no I/O.

import type {
  Profile,
  ProgramRow,
  RuleRow,
  FplRow,
  EligibilityResult,
  Confidence,
  BenefitValues,
} from './types';

// Default benefit dollar values — the canonical fallback used when the
// benefit_values table is absent. These are the values the engine has always
// shipped, so behavior with defaults is identical to the previous hardcoded path.
export const DEFAULT_BENEFIT_VALUES: BenefitValues = {
  snap_max_monthly: {
    1: 291, 2: 535, 3: 766, 4: 973, 5: 1155, 6: 1386, 7: 1532, 8: 1751,
  },
  snap_per_additional: 219,
  wic_monthly_per_person: 50,
  chip_annual_per_child: 3600,
  nslp_annual_per_child: 900,
  tanf_monthly_base: 400,       // ACF TANF avg ~$400/mo for family of 3 (states vary widely)
  section8_monthly_base: 1000,  // HUD HCV avg ~$1,000/mo (varies enormously by metro FMR)
};

// SNAP benefit formula parameters (federal, simplified). Real SNAP reduces the maximum
// allotment by 30% of *net* income, so the benefit falls as income rises — modeling this
// makes the estimate respond to income instead of being a flat per-household amount.
const SNAP_EARNED_INCOME_DEDUCTION = 0.2; // 20% of earned income is deducted
const SNAP_STANDARD_DEDUCTION = 200; // simplified standard deduction (~$198–$258 by size)
const SNAP_BENEFIT_REDUCTION_RATE = 0.3; // benefit drops by 30% of net income
const SNAP_MIN_MONTHLY = 23; // federal minimum benefit for eligible small households

function snapMaxMonthly(size: number, values: BenefitValues): number {
  if (size <= 8) return values.snap_max_monthly[size] ?? values.snap_max_monthly[1] ?? 291;
  return values.snap_max_monthly[8] + (size - 8) * values.snap_per_additional;
}

// Income-sensitive SNAP value: max allotment minus 30% of net monthly income, floored at the
// federal minimum and capped at the max allotment. Net = gross − 20% earned deduction − standard.
function snapAnnualValue(p: Profile, values: BenefitValues): number {
  const size = p.household_size || 1;
  const maxMonthly = snapMaxMonthly(size, values);
  const gross = p.monthly_income ?? 0;
  const net = Math.max(0, gross * (1 - SNAP_EARNED_INCOME_DEDUCTION) - SNAP_STANDARD_DEDUCTION);
  const monthly = Math.max(SNAP_MIN_MONTHLY, maxMonthly - SNAP_BENEFIT_REDUCTION_RATE * net);
  return Math.round(Math.min(maxMonthly, monthly)) * 12;
}

// TANF value estimate: base monthly grant scaled by household size. Real TANF grants
// vary wildly by state ($170/mo in MS to $770/mo in NH for a family of 3), but the
// ACF national average is ~$400/mo for a family of 3. We scale modestly for larger
// families: +$80/mo per additional person (roughly 20% of base per additional child).
// Source: ACF TANF Financial Data, FY 2023 (https://www.acf.hhs.gov/ofa/data)
function tanfAnnualValue(p: Profile, values: BenefitValues): number {
  const size = p.household_size || 3;
  const base = values.tanf_monthly_base;
  const additionalMembers = Math.max(0, size - 3);
  const monthly = base + additionalMembers * Math.round(base * 0.2);
  return monthly * 12;
}

// Section 8 / Housing Choice Voucher value estimate: covers the difference between
// 30% of tenant income and the local Fair Market Rent (FMR). We approximate as a
// flat ~$1,000/mo since the subsidy is per housing unit, not per person. The actual
// amount depends on local FMR and tenant income — it ranges from $600/mo in rural
// areas to $2,000+/mo in high-cost metros.
// Source: HUD Housing Choice Voucher Fact Sheet (https://www.hud.gov/topics/housing_choice_voucher_program_section_8)
function section8AnnualValue(_p: Profile, values: BenefitValues): number {
  return values.section8_monthly_base * 12;
}

function edgeCaseNotes(p: Profile, shortName: string): string | null {
  if (p.recently_lost_job && (shortName === 'SNAP' || shortName === 'MEDICAID')) {
    const weeks = p.job_loss_weeks_ago;
    const when = weeks ? `${weeks} week(s) ago` : 'recently';
    return (
      `You mentioned losing your job ${when}. Use your current income (which may be $0) — ` +
      `not your former salary — when applying. You may also qualify for expedited processing.`
    );
  }
  return null;
}

function applyIncomeRule(
  income: number,
  rule: RuleRow,
  fpl: FplRow | null,
  incomeUncertain: boolean,
): { eligible: boolean; confidence: Confidence; reason: string } {
  let eligible: boolean;
  let confidence: Confidence;
  let reason: string;

  if (rule.max_gross_monthly != null) {
    const pct = income / rule.max_gross_monthly;
    eligible = pct <= 1.0;
    confidence = pct <= 0.9 ? 'likely' : 'borderline';
    const incFmt = `$${Math.round(income).toLocaleString()}`;
    const limFmt = `$${Math.round(rule.max_gross_monthly).toLocaleString()}`;
    reason = eligible
      ? `Your household income of ${incFmt}/month is under the ${limFmt}/month limit for this program.`
      : `Your household income of ${incFmt}/month exceeds the ${limFmt}/month limit for this program.`;
  } else if (rule.max_pct_fpl != null && fpl) {
    if (rule.max_pct_fpl === 0) {
      return {
        eligible: false,
        confidence: 'unlikely',
        reason: rule.notes || 'This state has not expanded eligibility to this population.',
      };
    }
    const monthlyFpl = fpl.annual_amount / 12;
    const actualPct = income > 0 ? income / monthlyFpl : 0;
    eligible = actualPct <= rule.max_pct_fpl;
    confidence = actualPct / rule.max_pct_fpl <= 0.9 ? 'likely' : 'borderline';
    const incFmt = `$${Math.round(income).toLocaleString()}`;
    const limFmt = `$${Math.round(monthlyFpl * rule.max_pct_fpl).toLocaleString()}`;
    const limPctFmt = `${Math.round(rule.max_pct_fpl * 100)}%`;
    reason = eligible
      ? `Your household income of ${incFmt}/month is under the ${limFmt}/month limit (${limPctFmt} of the federal poverty level).`
      : `Your household income of ${incFmt}/month exceeds the ${limFmt}/month limit (${limPctFmt} of the federal poverty level).`;
  } else {
    return {
      eligible: false,
      confidence: 'requires_verification',
      reason: 'Cannot evaluate — rule thresholds missing.',
    };
  }

  if (!eligible) confidence = 'unlikely';
  if (incomeUncertain && confidence === 'unlikely') {
    confidence = 'requires_verification';
    reason += ' Income was approximate — worth verifying with exact figures.';
  }
  return { eligible, confidence, reason };
}

export function evaluateProgram(
  profile: Profile,
  program: ProgramRow,
  rules: RuleRow[],
  fpl: FplRow | null,
  values: BenefitValues = DEFAULT_BENEFIT_VALUES,
): EligibilityResult {
  // ── Defensive input sanitization ──────────────────────────────────
  // The engine must never crash on bad input. Clamp nonsensical values
  // to safe defaults so downstream math stays well-defined.
  const p: Profile = {
    ...profile,
    household_size:
      profile.household_size != null && profile.household_size > 0
        ? profile.household_size
        : 1,
    monthly_income:
      profile.monthly_income != null && profile.monthly_income < 0
        ? 0
        : profile.monthly_income,
  };

  const make = (
    eligible: boolean,
    confidence: Confidence,
    reason: string,
    annualValue: number | null = null,
    notes: string | null = null,
  ): EligibilityResult => ({
    program_id: program.id,
    program_name: program.name,
    program_short_name: program.short_name,
    eligible,
    confidence,
    reason,
    estimated_annual_value: annualValue,
    notes,
  });

  const sn = program.short_name;

  // Household composition gates (before income)
  if (sn === 'CHIP' && !p.has_children)
    return make(false, 'unlikely', 'CHIP covers children only — no children indicated in household.');
  if (sn === 'WIC' && !(p.has_young_children || p.is_pregnant))
    return make(false, 'unlikely', 'WIC is for pregnant women and children under 5 — neither indicated.');
  if (sn === 'NSLP' && !p.has_children)
    return make(false, 'unlikely', 'NSLP is for school-age children (K-12) — no children indicated in household.');
  if (sn === 'TANF' && !p.has_children)
    return make(false, 'unlikely', 'TANF is for families with dependent children — no children indicated in household.');

  if (!rules.length)
    return make(false, 'requires_verification', 'No eligibility rules found for this state.');

  const householdSize = p.household_size || 1;
  const rule =
    rules.find((r) => r.household_size === householdSize) ||
    rules.find((r) => r.household_size == null) ||
    rules[0];

  const income = p.monthly_income;

  if (rule.categorical_eligible && (p.receives_tanf || p.receives_ssi)) {
    return make(
      true,
      'likely',
      'Categorically eligible via TANF/SSI — income test does not apply.',
      sn === 'SNAP' ? snapAnnualValue(p, values) : null,
    );
  }

  if (income == null)
    return make(false, 'requires_verification', 'Income not provided — cannot evaluate.');

  const { eligible, confidence, reason } = applyIncomeRule(
    income,
    rule,
    fpl,
    !!p.income_uncertain,
  );
  const notes = edgeCaseNotes(p, sn);

  let annualValue: number | null = null;
  if (eligible && sn === 'SNAP') annualValue = snapAnnualValue(p, values);
  else if (eligible && sn === 'CHIP')
    annualValue = values.chip_annual_per_child * Math.max(1, (p.household_size || 2) - 1);
  else if (eligible && sn === 'WIC') {
    const participants =
      (p.is_pregnant ? 1 : 0) +
      (p.has_young_children ? Math.max(1, (p.household_size || 2) - 1) : 0);
    annualValue = values.wic_monthly_per_person * participants * 12;
  } else if (eligible && sn === 'NSLP')
    annualValue = values.nslp_annual_per_child * Math.max(1, (p.household_size || 2) - 1);
  else if (eligible && sn === 'TANF')
    annualValue = tanfAnnualValue(p, values);
  else if (eligible && sn === 'SECTION8')
    annualValue = section8AnnualValue(p, values);

  return make(eligible, confidence, reason, annualValue, notes);
}

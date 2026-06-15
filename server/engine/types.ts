// Shared types for the BenefitsIQ eligibility engine (TS port of the Python engine).
// Rows mirror the Lakebase synced tables (benefitsiq_lb.public.*).

export interface Profile {
  state?: string | null;
  household_size?: number | null;
  monthly_income?: number | null;
  income_uncertain?: boolean;
  recently_lost_job?: boolean;
  job_loss_weeks_ago?: number | null;
  receives_tanf?: boolean;
  receives_ssi?: boolean;
  has_children?: boolean;
  has_young_children?: boolean;
  is_pregnant?: boolean;
}

export interface ProgramRow {
  id: number;
  name: string;
  short_name: string;
  category: string | null;
  description: string | null;
  admin_agency: string | null;
}

export interface RuleRow {
  id: number;
  program_id: number;
  state: string | null;
  household_size: number | null;
  max_gross_monthly: number | null;
  max_net_monthly: number | null;
  max_pct_fpl: number | null;
  categorical_eligible: boolean | null;
  notes: string | null;
}

export interface FplRow {
  year: number;
  household_size: number;
  annual_amount: number;
  region: string;
}

// Benefit dollar values injected into the engine at runtime (sourced from the
// benefitsiq.app.benefit_values UC table, synced to Lakebase public.benefit_values).
// The engine falls back to DEFAULT_BENEFIT_VALUES when the table is absent.
export interface BenefitValues {
  snap_max_monthly: Record<number, number>; // household size 1..8
  snap_per_additional: number;
  wic_monthly_per_person: number;
  chip_annual_per_child: number;
  nslp_annual_per_child: number;
  tanf_monthly_base: number;           // ~$400/mo for family of 3 (ACF, varies by state)
  section8_monthly_base: number;       // ~$1000/mo (HUD, varies by metro area)
}

export type Confidence =
  | 'likely'
  | 'borderline'
  | 'unlikely'
  | 'requires_verification';

export interface EligibilityResult {
  program_id: number;
  program_name: string;
  program_short_name: string;
  eligible: boolean;
  confidence: Confidence;
  reason: string;
  estimated_annual_value: number | null;
  notes: string | null;
}

// Statement payload returned to the UI.
export interface StatementProgram {
  short_name: string;
  name: string;
  amount: number | null;
  basis: string;
  source: string;
  confidence: Confidence;
  next_step: string | null;
  apply_url: string;
}

// Real-world context from the U.S. Census ACS (optional — present only once the
// acs_state_stats dataset has been loaded + synced). See scripts/acs_load.py.
export interface AcsContext {
  state: string;
  state_name: string;
  snap_receipt_pct: number;
  poverty_pct: number;
  source: string;
}

export interface Cohort {
  label: string;
  modeled_n: number;
  apply_order: string[];
  programs_typical: string[];
  avg_processing_days: number | null;
  expedited_pct: number | null;
  source: string;
}

export interface Statement {
  state: string | null;
  household_size: number | null;
  monthly_income: number | null;
  recently_lost_job: boolean;
  total: number;
  programs: StatementProgram[];
  cohort: Cohort | null;
  acs: AcsContext | null;
}

/**
 * Type definitions for the Facility Trust Desk scoring engine.
 * All types are pure data — no I/O, no side effects.
 */

// ---------------------------------------------------------------------------
// Trust taxonomy
// ---------------------------------------------------------------------------

export type TrustLevel = 'high' | 'moderate' | 'low' | 'insufficient_data';

export type DimensionKey =
  | 'claims_vs_evidence'
  | 'staffing'
  | 'location'
  | 'accreditation'
  | 'digital'
  | 'completeness'
  | 'consistency';

// ---------------------------------------------------------------------------
// Evidence & flags
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  claim: string;
  finding: string;
  supported: boolean;
  source: string;
}

export interface Flag {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  dimension: DimensionKey;
}

// ---------------------------------------------------------------------------
// Dimension score
// ---------------------------------------------------------------------------

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  weight: number;
  /** 0–100 */
  score: number;
  level: TrustLevel;
  evidence: EvidenceItem[];
  flags: Flag[];
  /** false = insufficient data; excluded from composite */
  available: boolean;
}

// ---------------------------------------------------------------------------
// Composite trust profile
// ---------------------------------------------------------------------------

export interface TrustProfile {
  facility_id: string;
  facility_name: string;
  /** Weighted average of available dimensions, 0–100 */
  composite_score: number;
  composite_level: TrustLevel;
  dimensions: DimensionScore[];
  flags: Flag[];
  /** How many of the 7 dimensions had enough data to score */
  scored_dimensions: number;
  /** Always 7 */
  total_dimensions: number;
}

// ---------------------------------------------------------------------------
// Facility — matches the 51-column hackathon dataset
// ---------------------------------------------------------------------------

export interface Facility {
  id: string;
  facility_name: string;
  facility_type: string; // Hospital, Clinic, Nursing Home, etc.
  state: string;
  district: string;
  pincode: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  num_doctors: number | null;
  num_beds: number | null;
  /** Comma-separated or JSON-array string, e.g. "['Cardiology','Radiology']" */
  specialties: string | null;
  /** Comma-separated or JSON-array string */
  equipment: string | null;
  /** Comma-separated or JSON-array string */
  procedures: string | null;
  /** Comma-separated or JSON-array string */
  departments: string | null;
  /** Free text mentioning NABH/ISO/JCI etc. */
  accreditation_text: string | null;
  website: string | null;
  social_media_count: number | null;
  /** ISO date string or similar */
  last_updated: string | null;
  /** Free text describing facility capabilities */
  capabilities_text: string | null;
  ownership: string | null; // public, private, trust, etc.
  emergency_services: boolean | number | string | null;
  num_icu_beds: number | null;
  /** Number of operation theaters */
  num_ot: number | null;
  /** Catch-all for extra columns in the dataset */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parsed facility — arrays extracted from strings
// ---------------------------------------------------------------------------

export interface ParsedFacility extends Facility {
  specialties_list: string[];
  equipment_list: string[];
  procedures_list: string[];
  departments_list: string[];
}

// ---------------------------------------------------------------------------
// Planner notes & district context (supporting types)
// ---------------------------------------------------------------------------

export interface PlannerNote {
  id: string;
  facility_id: string;
  dimension?: DimensionKey;
  note: string;
  decision?: string;
  created_at: string;
}

export interface DistrictContext {
  state: string;
  district: string;
  indicators: Record<string, number | null>;
}

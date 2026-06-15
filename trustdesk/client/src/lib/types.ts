export type TrustLevel = 'high' | 'moderate' | 'low' | 'insufficient_data';
export type DimensionKey =
  | 'claims_vs_evidence'
  | 'staffing'
  | 'location'
  | 'accreditation'
  | 'digital'
  | 'completeness'
  | 'consistency';

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

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  weight: number;
  score: number;
  level: TrustLevel;
  evidence: EvidenceItem[];
  flags: Flag[];
  available: boolean;
}

export interface TrustProfile {
  facility_id: string;
  facility_name: string;
  composite_score: number;
  composite_level: TrustLevel;
  dimensions: DimensionScore[];
  flags: Flag[];
  scored_dimensions: number;
  total_dimensions: number;
}

export interface Facility {
  id: string;
  facility_name: string;
  facility_type: string;
  state: string;
  district: string;
  pincode: string;
  num_doctors: number | null;
  num_beds: number | null;
  specialties: string;
  equipment: string;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  [key: string]: unknown;
}

export interface PlannerNote {
  id: string;
  facility_id: string;
  dimension?: DimensionKey;
  note: string;
  decision?: string;
  created_at: string;
}

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  claims_vs_evidence: 'Claims vs Evidence',
  staffing: 'Staffing Adequacy',
  location: 'Location Verification',
  accreditation: 'Accreditation Status',
  digital: 'Digital Presence',
  completeness: 'Data Completeness',
  consistency: 'Data Consistency',
};

export const TRUST_LEVEL_CONFIG: Record<
  TrustLevel,
  { label: string; color: string; bg: string; ring: string }
> = {
  high: {
    label: 'High Trust',
    color: 'text-green-600',
    bg: 'bg-green-50',
    ring: 'ring-green-200',
  },
  moderate: {
    label: 'Moderate Trust',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
  },
  low: {
    label: 'Low Trust',
    color: 'text-red-600',
    bg: 'bg-red-50',
    ring: 'ring-red-200',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    color: 'text-gray-400',
    bg: 'bg-gray-50',
    ring: 'ring-gray-200',
  },
};

export function trustLevelStroke(level: TrustLevel): string {
  switch (level) {
    case 'high':
      return '#16a34a';
    case 'moderate':
      return '#d97706';
    case 'low':
      return '#dc2626';
    case 'insufficient_data':
      return '#9ca3af';
  }
}

export function trustLevelStrokeTrack(level: TrustLevel): string {
  switch (level) {
    case 'high':
      return '#dcfce7';
    case 'moderate':
      return '#fef3c7';
    case 'low':
      return '#fee2e2';
    case 'insufficient_data':
      return '#f3f4f6';
  }
}

import { describe, it, expect } from 'vitest';
import type { Facility, ParsedFacility } from './types.js';
import {
  parseStringList,
  parseFacility,
  scoreClaimsVsEvidence,
  scoreStaffing,
  scoreLocation,
  scoreAccreditation,
  scoreDigital,
  scoreCompleteness,
  scoreConsistency,
  computeTrustProfile,
} from './trust.js';

// ---------------------------------------------------------------------------
// Test facility factories
// ---------------------------------------------------------------------------

function makeFacility(overrides: Partial<Facility> = {}): Facility {
  return {
    id: 'test-001',
    facility_name: 'Test Hospital',
    facility_type: 'Hospital',
    state: 'Maharashtra',
    district: 'Mumbai',
    pincode: '400001',
    address: '123 Test Street',
    latitude: 19.076,
    longitude: 72.8777,
    num_doctors: 10,
    num_beds: 50,
    specialties: "['Cardiology','Radiology','General Surgery']",
    equipment: "['ECG','CT Scanner','Anesthesia Machine','Operation Theater','Defibrillator']",
    procedures: "['Angiography','CT Scan','Laparoscopy']",
    departments: "['Medicine','Surgery','Radiology']",
    accreditation_text: 'NABH accredited facility',
    website: 'https://testhospital.in',
    social_media_count: 3,
    last_updated: '2026-01-15',
    capabilities_text: 'Full-service hospital with NABH accreditation and ISO 9001 certification',
    ownership: 'private',
    emergency_services: true,
    num_icu_beds: 5,
    num_ot: 3,
    ...overrides,
  };
}

function makeParsed(overrides: Partial<Facility> = {}): ParsedFacility {
  return parseFacility(makeFacility(overrides));
}

/** Sanjivani Hospital — Kerala facility with coordinates in North Atlantic */
function makeSanjivani(): Facility {
  return makeFacility({
    id: 'sanjivani-001',
    facility_name: 'Sanjivani Hospital',
    facility_type: 'Hospital',
    state: 'Kerala',
    district: 'Ernakulam',
    pincode: '682001',
    latitude: 55.0,  // North Atlantic!
    longitude: -10.0, // Way off
    num_doctors: 8,
    num_beds: 40,
    specialties: "['Cardiology','General Medicine','Pediatrics','General Surgery']",
    equipment: "['ECG','Echo','Defibrillator','Stethoscope','Operation Theater','Anesthesia Machine','Infant Warmer']",
    procedures: "['Angiography','Vaccination','Laparoscopy']",
    departments: "['Cardiology','Medicine','Pediatrics','Surgery']",
    accreditation_text: 'NABH accredited',
    website: 'https://sanjivani.in',
    social_media_count: 2,
    last_updated: '2025-06-01',
    capabilities_text: 'Multi-specialty hospital',
    num_icu_beds: 3,
    num_ot: 2,
    emergency_services: true,
  });
}

/** Shaurya Hospital — 2 doctors, 19 specialties, has ECG but no CT for radiology */
function makeShaurya(): Facility {
  return makeFacility({
    id: 'shaurya-001',
    facility_name: 'Shaurya Hospital',
    facility_type: 'Hospital',
    state: 'Rajasthan',
    district: 'Jaipur',
    pincode: '302001',
    latitude: 26.9124,
    longitude: 75.7873,
    num_doctors: 2,
    num_beds: 20,
    specialties: "['Cardiology','Radiology','Orthopedics','Pediatrics','General Surgery','Neurology','Nephrology','Gastroenterology','Dermatology','ENT','Ophthalmology','Gynecology','Urology','Psychiatry','Pulmonology','Endocrinology','Oncology','Dental','Physiotherapy']",
    equipment: "['ECG','Stethoscope','BP Apparatus']",
    procedures: "['General Consultation']",
    departments: "['Medicine']",
    accreditation_text: null,
    website: null,
    social_media_count: 0,
    last_updated: null,
    capabilities_text: null,
    num_icu_beds: 0,
    num_ot: 0,
    emergency_services: false,
    ownership: 'private',
  });
}

/** Dr Jindal's Clinic — claims pediatrics, only has stethoscope */
function makeJindal(): Facility {
  return makeFacility({
    id: 'jindal-001',
    facility_name: "Dr Jindal's Clinic",
    facility_type: 'Clinic',
    state: 'Delhi',
    district: 'New Delhi',
    pincode: '110001',
    latitude: 28.6139,
    longitude: 77.209,
    num_doctors: 1,
    num_beds: 0,
    specialties: "['Pediatrics']",
    equipment: "['Stethoscope']",
    procedures: null,
    departments: "['Pediatrics']",
    accreditation_text: null,
    website: null,
    social_media_count: null,
    last_updated: null,
    capabilities_text: null,
    num_icu_beds: 0,
    num_ot: 0,
    emergency_services: false,
    ownership: 'private',
  });
}

// ===========================================================================
// parseStringList
// ===========================================================================

describe('parseStringList', () => {
  it('parses JSON array', () => {
    expect(parseStringList('["Cardiology","Radiology"]')).toEqual([
      'Cardiology',
      'Radiology',
    ]);
  });

  it('parses Python-style single-quote array', () => {
    expect(parseStringList("['Cardiology','Radiology']")).toEqual([
      'Cardiology',
      'Radiology',
    ]);
  });

  it('parses comma-separated string', () => {
    expect(parseStringList('Cardiology, Radiology, ENT')).toEqual([
      'Cardiology',
      'Radiology',
      'ENT',
    ]);
  });

  it('returns empty array for null', () => {
    expect(parseStringList(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseStringList('')).toEqual([]);
  });

  it('returns empty array for whitespace', () => {
    expect(parseStringList('   ')).toEqual([]);
  });

  it('handles mixed-quote Python arrays', () => {
    expect(parseStringList("['Cardiology', \"Radiology\"]")).toEqual([
      'Cardiology',
      'Radiology',
    ]);
  });

  it('handles single item array', () => {
    expect(parseStringList("['Cardiology']")).toEqual(['Cardiology']);
  });

  it('trims whitespace from items', () => {
    expect(parseStringList(' Cardiology ,  Radiology ')).toEqual([
      'Cardiology',
      'Radiology',
    ]);
  });

  it('filters empty items from trailing commas', () => {
    expect(parseStringList('Cardiology, Radiology,')).toEqual([
      'Cardiology',
      'Radiology',
    ]);
  });
});

// ===========================================================================
// parseFacility
// ===========================================================================

describe('parseFacility', () => {
  it('parses all list fields', () => {
    const f = parseFacility(makeFacility());
    expect(f.specialties_list).toContain('Cardiology');
    expect(f.equipment_list).toContain('ECG');
    expect(f.procedures_list).toContain('Angiography');
    expect(f.departments_list).toContain('Medicine');
  });

  it('preserves scalar fields', () => {
    const f = parseFacility(makeFacility());
    expect(f.facility_name).toBe('Test Hospital');
    expect(f.num_doctors).toBe(10);
  });

  it('handles all-null list fields', () => {
    const f = parseFacility(
      makeFacility({
        specialties: null,
        equipment: null,
        procedures: null,
        departments: null,
      }),
    );
    expect(f.specialties_list).toEqual([]);
    expect(f.equipment_list).toEqual([]);
    expect(f.procedures_list).toEqual([]);
    expect(f.departments_list).toEqual([]);
  });
});

// ===========================================================================
// Dimension 1: Claims vs Evidence
// ===========================================================================

describe('scoreClaimsVsEvidence', () => {
  it('high score for well-equipped hospital', () => {
    const result = scoreClaimsVsEvidence(makeParsed());
    expect(result.key).toBe('claims_vs_evidence');
    expect(result.weight).toBe(0.25);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.level).toBe('high');
    expect(result.available).toBe(true);
  });

  it('insufficient_data when no specialties', () => {
    const result = scoreClaimsVsEvidence(
      makeParsed({ specialties: null }),
    );
    expect(result.available).toBe(false);
    expect(result.level).toBe('insufficient_data');
  });

  it('flags specialty with no matching equipment — Jindal scenario', () => {
    const f = parseFacility(makeJindal());
    const result = scoreClaimsVsEvidence(f);
    // Pediatrics requires Nebulizer/Infant Warmer/etc — Stethoscope is not in the list
    expect(result.flags.some((fl) => fl.severity === 'critical')).toBe(true);
    expect(result.score).toBeLessThan(50);
  });

  it('low score for Shaurya — 19 specialties, barely any equipment', () => {
    const f = parseFacility(makeShaurya());
    const result = scoreClaimsVsEvidence(f);
    expect(result.score).toBeLessThan(30);
    expect(result.flags.filter((fl) => fl.severity === 'critical').length).toBeGreaterThan(5);
  });

  it('handles unknown specialties gracefully', () => {
    const result = scoreClaimsVsEvidence(
      makeParsed({ specialties: "['Ayurveda','Homeopathy']", equipment: "['Stethoscope']" }),
    );
    // Unknown specialties get benefit of the doubt
    expect(result.available).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('handles empty equipment list', () => {
    const result = scoreClaimsVsEvidence(
      makeParsed({
        specialties: "['Cardiology']",
        equipment: null,
        procedures: null,
      }),
    );
    expect(result.score).toBe(0);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('produces evidence items for each specialty', () => {
    const result = scoreClaimsVsEvidence(makeParsed());
    expect(result.evidence.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// Dimension 2: Staffing
// ===========================================================================

describe('scoreStaffing', () => {
  it('good score for reasonable doctor-to-specialty ratio', () => {
    const result = scoreStaffing(makeParsed());
    // 10 doctors, 3 specialties = 1:0.3 ratio — excellent
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.available).toBe(true);
  });

  it('insufficient_data when num_doctors is null', () => {
    const result = scoreStaffing(makeParsed({ num_doctors: null }));
    expect(result.available).toBe(false);
    expect(result.level).toBe('insufficient_data');
  });

  it('critical flag for Shaurya — 2 doctors, 19 specialties', () => {
    const f = parseFacility(makeShaurya());
    const result = scoreStaffing(f);
    expect(result.flags.some((fl) => fl.severity === 'critical')).toBe(true);
    expect(result.score).toBeLessThanOrEqual(50);
  });

  it('flags 0 doctors with specialties', () => {
    const result = scoreStaffing(
      makeParsed({ num_doctors: 0, specialties: "['Cardiology']" }),
    );
    expect(result.score).toBeLessThanOrEqual(20);
    expect(result.flags.some((fl) => fl.severity === 'critical')).toBe(true);
  });

  it('flags high beds-per-doctor ratio', () => {
    const result = scoreStaffing(
      makeParsed({ num_doctors: 2, num_beds: 100, specialties: "['General Medicine']" }),
    );
    expect(result.flags.some((fl) => fl.message.includes('beds per doctor'))).toBe(true);
  });

  it('no flag for reasonable beds-per-doctor', () => {
    const result = scoreStaffing(
      makeParsed({ num_doctors: 10, num_beds: 50 }),
    );
    expect(result.flags.filter((fl) => fl.message.includes('beds per doctor'))).toHaveLength(0);
  });
});

// ===========================================================================
// Dimension 3: Location
// ===========================================================================

describe('scoreLocation', () => {
  it('high score for valid Indian coordinates + matching PIN', () => {
    const result = scoreLocation(makeParsed());
    expect(result.score).toBe(100);
    expect(result.level).toBe('high');
    expect(result.available).toBe(true);
  });

  it('critical flag for Sanjivani — coordinates in North Atlantic', () => {
    const f = parseFacility(makeSanjivani());
    const result = scoreLocation(f);
    expect(result.flags.some((fl) => fl.severity === 'critical')).toBe(true);
    expect(result.score).toBeLessThanOrEqual(50);
  });

  it('flags PIN code mismatch', () => {
    const result = scoreLocation(
      makeParsed({ state: 'Kerala', pincode: '400001' }), // Maharashtra PIN for Kerala
    );
    expect(result.evidence.some((e) => !e.supported && e.claim.includes('PIN'))).toBe(true);
  });

  it('insufficient_data when no coordinates and no PIN', () => {
    const result = scoreLocation(
      makeParsed({ latitude: null, longitude: null, pincode: '', state: '' }),
    );
    expect(result.available).toBe(false);
  });

  it('handles coordinates-only (no PIN)', () => {
    const result = scoreLocation(
      makeParsed({ pincode: '', state: '' }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('handles PIN-only (no coordinates)', () => {
    const result = scoreLocation(
      makeParsed({ latitude: null, longitude: null }),
    );
    expect(result.available).toBe(true);
  });
});

// ===========================================================================
// Dimension 4: Accreditation
// ===========================================================================

describe('scoreAccreditation', () => {
  it('score 80 for NABH-accredited facility', () => {
    const result = scoreAccreditation(makeParsed());
    expect(result.score).toBe(80);
    expect(result.available).toBe(true);
  });

  it('insufficient_data when no accreditation or capabilities text', () => {
    const result = scoreAccreditation(
      makeParsed({ accreditation_text: null, capabilities_text: null }),
    );
    expect(result.available).toBe(false);
  });

  it('score 40 when text exists but no keywords', () => {
    const result = scoreAccreditation(
      makeParsed({
        accreditation_text: 'No special certification',
        capabilities_text: 'General hospital',
      }),
    );
    expect(result.score).toBe(40);
  });

  it('detects ISO keyword', () => {
    const result = scoreAccreditation(
      makeParsed({
        accreditation_text: null,
        capabilities_text: 'ISO 9001 certified hospital',
      }),
    );
    expect(result.score).toBe(80);
    expect(result.evidence.some((e) => e.claim.includes('ISO'))).toBe(true);
  });

  it('detects JCI keyword', () => {
    const result = scoreAccreditation(
      makeParsed({
        accreditation_text: 'JCI accredited',
        capabilities_text: null,
      }),
    );
    expect(result.score).toBe(80);
  });

  it('flags that accreditation needs independent verification', () => {
    const result = scoreAccreditation(makeParsed());
    expect(result.flags.some((fl) => fl.message.includes('verification'))).toBe(true);
  });
});

// ===========================================================================
// Dimension 5: Digital Presence
// ===========================================================================

describe('scoreDigital', () => {
  it('high score for website + social + recent update', () => {
    const result = scoreDigital(makeParsed());
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.available).toBe(true);
  });

  it('insufficient_data when no digital info at all', () => {
    const result = scoreDigital(
      makeParsed({
        website: null,
        social_media_count: null,
        last_updated: null,
      }),
    );
    expect(result.available).toBe(false);
  });

  it('lower score without website', () => {
    const withWebsite = scoreDigital(makeParsed());
    const withoutWebsite = scoreDigital(
      makeParsed({ website: null }),
    );
    expect(withoutWebsite.score).toBeLessThan(withWebsite.score);
  });

  it('flags very stale data', () => {
    const result = scoreDigital(
      makeParsed({ last_updated: '2020-01-01', website: null, social_media_count: null }),
    );
    expect(result.flags.some((fl) => fl.message.includes('outdated'))).toBe(true);
  });

  it('handles website-only', () => {
    const result = scoreDigital(
      makeParsed({ social_media_count: null, last_updated: null }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(40);
  });
});

// ===========================================================================
// Dimension 6: Completeness
// ===========================================================================

describe('scoreCompleteness', () => {
  it('high score for well-populated facility', () => {
    const result = scoreCompleteness(makeParsed());
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.available).toBe(true); // always available
  });

  it('low score when most fields are null', () => {
    const result = scoreCompleteness(
      makeParsed({
        latitude: null,
        longitude: null,
        num_doctors: null,
        num_beds: null,
        specialties: null,
        equipment: null,
        procedures: null,
        departments: null,
        website: null,
        capabilities_text: null,
        last_updated: null,
      }),
    );
    expect(result.score).toBeLessThan(50);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('always returns available=true', () => {
    const result = scoreCompleteness(makeParsed({ specialties: null }));
    expect(result.available).toBe(true);
  });

  it('lists missing fields in evidence', () => {
    const result = scoreCompleteness(
      makeParsed({ website: null }),
    );
    expect(result.evidence.some((e) => e.finding.includes('website'))).toBe(true);
  });
});

// ===========================================================================
// Dimension 7: Consistency
// ===========================================================================

describe('scoreConsistency', () => {
  it('high score for consistent facility', () => {
    const result = scoreConsistency(makeParsed());
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.available).toBe(true);
  });

  it('flags surgery without OT', () => {
    const result = scoreConsistency(
      makeParsed({
        specialties: "['General Surgery']",
        num_ot: 0,
        equipment: "['Stethoscope']", // no OT in equipment
      }),
    );
    expect(result.flags.some((fl) => fl.message.includes('operation theater'))).toBe(true);
  });

  it('flags clinic with too many specialties', () => {
    const result = scoreConsistency(
      makeParsed({
        facility_type: 'Clinic',
        specialties: "['Cardiology','Radiology','Orthopedics','Neurology','Nephrology','Gastroenterology','Dermatology']",
      }),
    );
    expect(result.flags.some((fl) => fl.message.includes('Clinic'))).toBe(true);
  });

  it('flags ICU specialty with 0 ICU beds', () => {
    const result = scoreConsistency(
      makeParsed({
        specialties: "['Critical Care']",
        num_icu_beds: 0,
      }),
    );
    expect(result.flags.some((fl) => fl.message.includes('ICU'))).toBe(true);
  });

  it('flags small bed count with many specialties', () => {
    const result = scoreConsistency(
      makeParsed({
        num_beds: 5,
        specialties: "['Cardiology','Radiology','Orthopedics','Neurology','Nephrology','Gastroenterology']",
      }),
    );
    expect(result.flags.some((fl) => fl.message.includes('5-bed'))).toBe(true);
  });

  it('flags emergency services without emergency equipment', () => {
    const result = scoreConsistency(
      makeParsed({
        emergency_services: true,
        equipment: "['Stethoscope','BP Apparatus']",
        specialties: "['General Medicine']",
      }),
    );
    expect(result.flags.some((fl) => fl.message.includes('emergency'))).toBe(true);
  });

  it('insufficient_data when no consistency checks possible', () => {
    const result = scoreConsistency(
      makeParsed({
        facility_type: '',
        specialties: null,
        num_beds: null,
        num_ot: null,
        num_icu_beds: null,
        emergency_services: null,
        equipment: null,
        departments: null,
      }),
    );
    expect(result.available).toBe(false);
  });
});

// ===========================================================================
// computeTrustProfile — composite scoring
// ===========================================================================

describe('computeTrustProfile', () => {
  it('produces valid trust profile for well-equipped hospital', () => {
    const profile = computeTrustProfile(makeFacility());
    expect(profile.facility_id).toBe('test-001');
    expect(profile.facility_name).toBe('Test Hospital');
    expect(profile.composite_score).toBeGreaterThanOrEqual(50);
    expect(profile.total_dimensions).toBe(7);
    expect(profile.scored_dimensions).toBeGreaterThanOrEqual(5);
    expect(profile.dimensions).toHaveLength(7);
  });

  it('deterministic — same input always produces same output', () => {
    const f = makeFacility();
    const p1 = computeTrustProfile(f);
    const p2 = computeTrustProfile(f);
    expect(p1.composite_score).toBe(p2.composite_score);
    expect(p1.composite_level).toBe(p2.composite_level);
    expect(p1.scored_dimensions).toBe(p2.scored_dimensions);
    expect(p1.dimensions.map((d) => d.score)).toEqual(p2.dimensions.map((d) => d.score));
    expect(p1.flags.length).toBe(p2.flags.length);
  });

  it('Sanjivani: location flags but otherwise decent', () => {
    const profile = computeTrustProfile(makeSanjivani());
    const locDim = profile.dimensions.find((d) => d.key === 'location')!;
    expect(locDim.flags.some((fl) => fl.severity === 'critical')).toBe(true);
    expect(locDim.score).toBeLessThanOrEqual(50);
    // Other dimensions should be mostly fine
    const claimsDim = profile.dimensions.find((d) => d.key === 'claims_vs_evidence')!;
    expect(claimsDim.score).toBeGreaterThan(50);
  });

  it('Shaurya: low composite score with many critical flags', () => {
    const profile = computeTrustProfile(makeShaurya());
    expect(profile.composite_score).toBeLessThanOrEqual(50);
    expect(profile.flags.filter((fl) => fl.severity === 'critical').length).toBeGreaterThan(3);
  });

  it('Jindal: low claims score, reasonable location', () => {
    const profile = computeTrustProfile(makeJindal());
    const claimsDim = profile.dimensions.find((d) => d.key === 'claims_vs_evidence')!;
    expect(claimsDim.score).toBe(0);
    const locDim = profile.dimensions.find((d) => d.key === 'location')!;
    expect(locDim.score).toBe(100);
  });

  it('excludes insufficient_data dimensions from composite', () => {
    const profile = computeTrustProfile(
      makeFacility({
        accreditation_text: null,
        capabilities_text: null,
        website: null,
        social_media_count: null,
        last_updated: null,
      }),
    );
    expect(profile.scored_dimensions).toBeLessThan(7);
    // Accreditation + Digital should be excluded
    const accred = profile.dimensions.find((d) => d.key === 'accreditation')!;
    const digital = profile.dimensions.find((d) => d.key === 'digital')!;
    expect(accred.available).toBe(false);
    expect(digital.available).toBe(false);
  });

  it('insufficient_data composite level when < 3 dimensions available', () => {
    const profile = computeTrustProfile(
      makeFacility({
        specialties: null,
        equipment: null,
        procedures: null,
        departments: null,
        num_doctors: null,
        latitude: null,
        longitude: null,
        pincode: '',
        state: '',
        accreditation_text: null,
        capabilities_text: null,
        website: null,
        social_media_count: null,
        last_updated: null,
        num_ot: null,
        num_icu_beds: null,
        num_beds: null,
        emergency_services: null,
        facility_type: '',
      }),
    );
    expect(profile.composite_level).toBe('insufficient_data');
  });

  it('collects flags from all dimensions', () => {
    const profile = computeTrustProfile(makeShaurya());
    const flagDimensions = new Set(profile.flags.map((fl) => fl.dimension));
    expect(flagDimensions.size).toBeGreaterThanOrEqual(2);
  });

  it('composite score is between 0 and 100', () => {
    for (const factory of [makeFacility, makeSanjivani, makeShaurya, makeJindal]) {
      const profile = computeTrustProfile(factory());
      expect(profile.composite_score).toBeGreaterThanOrEqual(0);
      expect(profile.composite_score).toBeLessThanOrEqual(100);
    }
  });

  it('all dimension scores are between 0 and 100', () => {
    const profile = computeTrustProfile(makeFacility());
    for (const dim of profile.dimensions) {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
    }
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('edge cases', () => {
  it('handles facility with all null values', () => {
    const f = makeFacility({
      specialties: null,
      equipment: null,
      procedures: null,
      departments: null,
      num_doctors: null,
      num_beds: null,
      latitude: null,
      longitude: null,
      pincode: '',
      accreditation_text: null,
      capabilities_text: null,
      website: null,
      social_media_count: null,
      last_updated: null,
      num_icu_beds: null,
      num_ot: null,
      emergency_services: null,
    });
    const profile = computeTrustProfile(f);
    expect(profile.composite_score).toBeGreaterThanOrEqual(0);
    expect(profile.total_dimensions).toBe(7);
  });

  it('handles zero doctors with zero specialties', () => {
    const result = scoreStaffing(
      makeParsed({ num_doctors: 0, specialties: null }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it('handles huge specialty list', () => {
    const bigList = Array.from({ length: 50 }, (_, i) => `Specialty${i}`).join(',');
    const result = scoreClaimsVsEvidence(
      makeParsed({ specialties: bigList, equipment: null }),
    );
    // All unknown specialties — should still work
    expect(result.available).toBe(true);
  });

  it('handles duplicate specialties', () => {
    const result = scoreConsistency(
      makeParsed({
        specialties: "['Cardiology','cardiology','CARDIOLOGY']",
      }),
    );
    expect(result.evidence.some((e) => e.finding.includes('duplicate'))).toBe(true);
  });

  it('Shaurya profile has critical staffing flag', () => {
    const profile = computeTrustProfile(makeShaurya());
    const staffing = profile.dimensions.find((d) => d.key === 'staffing')!;
    expect(staffing.flags.some((fl) => fl.severity === 'critical')).toBe(true);
  });

  it('claims dimension weight is 0.25', () => {
    const result = scoreClaimsVsEvidence(makeParsed());
    expect(result.weight).toBe(0.25);
  });

  it('staffing dimension weight is 0.15', () => {
    const result = scoreStaffing(makeParsed());
    expect(result.weight).toBe(0.15);
  });

  it('location dimension weight is 0.15', () => {
    const result = scoreLocation(makeParsed());
    expect(result.weight).toBe(0.15);
  });

  it('accreditation dimension weight is 0.15', () => {
    const result = scoreAccreditation(makeParsed());
    expect(result.weight).toBe(0.15);
  });

  it('digital dimension weight is 0.10', () => {
    const result = scoreDigital(makeParsed());
    expect(result.weight).toBe(0.10);
  });

  it('completeness dimension weight is 0.10', () => {
    const result = scoreCompleteness(makeParsed());
    expect(result.weight).toBe(0.10);
  });

  it('consistency dimension weight is 0.10', () => {
    const result = scoreConsistency(makeParsed());
    expect(result.weight).toBe(0.10);
  });
});

// ===========================================================================
// Knowledge map coverage
// ===========================================================================

describe('knowledge map coverage', () => {
  it('Cardiology has required equipment', () => {
    const f = makeParsed({
      specialties: "['Cardiology']",
      equipment: "['ECG']",
      procedures: null,
    });
    const result = scoreClaimsVsEvidence(f);
    expect(result.evidence[0].supported).toBe(true);
  });

  it('Radiology needs imaging equipment', () => {
    const f = makeParsed({
      specialties: "['Radiology']",
      equipment: "['Stethoscope']",
      procedures: null,
    });
    const result = scoreClaimsVsEvidence(f);
    const radioEvidence = result.evidence.find((e) => e.claim.includes('Radiology'));
    expect(radioEvidence?.supported).toBe(false);
  });

  it('General Surgery needs OT or Anesthesia Machine', () => {
    const f = makeParsed({
      specialties: "['General Surgery']",
      equipment: "['Anesthesia Machine']",
      procedures: null,
    });
    const result = scoreClaimsVsEvidence(f);
    const surgEvidence = result.evidence.find((e) => e.claim.includes('General Surgery'));
    expect(surgEvidence?.supported).toBe(true);
  });

  it('recognizes synonym "orthopaedics" as orthopedics', () => {
    const f = makeParsed({
      specialties: "['Orthopaedics']",
      equipment: "['C-arm']",
      procedures: null,
    });
    const result = scoreClaimsVsEvidence(f);
    const orthoEvidence = result.evidence.find((e) => e.claim.includes('Orthopaedics'));
    expect(orthoEvidence?.supported).toBe(true);
  });

  it('recognizes synonym "paediatrics" as pediatrics', () => {
    const f = makeParsed({
      specialties: "['Paediatrics']",
      equipment: "['Nebulizer']",
      procedures: null,
    });
    const result = scoreClaimsVsEvidence(f);
    const pedEvidence = result.evidence.find((e) => e.claim.includes('Paediatrics'));
    expect(pedEvidence?.supported).toBe(true);
  });
});

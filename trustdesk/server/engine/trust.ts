/**
 * Deterministic trust scoring engine — 7 dimensions.
 *
 * Every function is PURE: no I/O, no network, no database.
 * Same input → same output, every time.
 */

import type {
  Facility,
  ParsedFacility,
  DimensionScore,
  DimensionKey,
  TrustLevel,
  TrustProfile,
  EvidenceItem,
  Flag,
} from './types.js';

import {
  SPECIALTY_REQUIREMENTS,
  SPECIALTY_SYNONYMS,
  SPECIALTY_KEYWORD_RULES,
  FACILITY_TYPE_EXPECTATIONS,
  ACCREDITATION_KEYWORDS,
  IMPORTANT_FIELDS,
} from './knowledge.js';

import {
  validateCoordinates,
  validatePincode,
} from './geo.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a string that looks like a JSON array, Python list, or CSV into string[] */
export function parseStringList(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try JSON parse first: ["Cardiology","Radiology"]
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      // Not valid JSON — might be Python-style with single quotes
      // Replace single quotes with double quotes and try again
      try {
        const fixed = trimmed.replace(/'/g, '"');
        const parsed: unknown = JSON.parse(fixed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {
        // Strip brackets and split by comma
        const inner = trimmed.slice(1, -1);
        return inner
          .split(',')
          .map((s) => s.replace(/['"]/g, '').trim())
          .filter(Boolean);
      }
    }
  }

  // Comma-separated
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse a Facility into a ParsedFacility with array fields */
export function parseFacility(raw: Facility): ParsedFacility {
  return {
    ...raw,
    specialties_list: parseStringList(raw.specialties),
    equipment_list: parseStringList(raw.equipment),
    procedures_list: parseStringList(raw.procedures),
    departments_list: parseStringList(raw.departments),
  };
}

/** Convert camelCase or PascalCase to space-separated lowercase words */
function camelToWords(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

/** Normalize a specialty name to its canonical form */
function normalizeSpecialty(name: string): string {
  const lower = name.toLowerCase().trim();

  // 1. Direct match in SPECIALTY_REQUIREMENTS
  if (SPECIALTY_REQUIREMENTS[lower]) return lower;

  // 2. Explicit synonym lookup
  if (SPECIALTY_SYNONYMS[lower]) return SPECIALTY_SYNONYMS[lower];

  // 3. Convert camelCase and try again
  const words = camelToWords(name);
  if (words !== lower) {
    if (SPECIALTY_REQUIREMENTS[words]) return words;
    if (SPECIALTY_SYNONYMS[words]) return SPECIALTY_SYNONYMS[words];
  }

  // 4. Keyword-based fallback: check if the words contain keyword patterns
  for (const rule of SPECIALTY_KEYWORD_RULES) {
    if (rule.keywords.every((kw) => words.includes(kw))) {
      return rule.canonical;
    }
  }

  // 5. No match — return the lowercased words form
  return words;
}

/** Deduplicate a list of strings (case-insensitive) */
function deduplicateCI(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/** Score → TrustLevel */
function scoreToLevel(score: number): TrustLevel {
  if (score >= 75) return 'high';
  if (score >= 50) return 'moderate';
  return 'low';
}

/** Check if a value is non-null, non-undefined, and non-empty string */
function hasValue(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  return true;
}

/** Case-insensitive check if any item in `haystack` contains `needle` */
function listContainsCI(haystack: string[], needle: string): boolean {
  const lowerNeedle = needle.toLowerCase();
  return haystack.some((h) => h.toLowerCase().includes(lowerNeedle));
}

/** Check if a facility's equipment or procedures list matches ANY required item */
function findMatches(
  facilityItems: string[],
  requiredItems: string[],
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const req of requiredItems) {
    if (listContainsCI(facilityItems, req)) {
      matched.push(req);
    } else {
      missing.push(req);
    }
  }

  return { matched, missing };
}

// ---------------------------------------------------------------------------
// Dimension 1: Claims vs Evidence (weight 0.25)
// ---------------------------------------------------------------------------

export function scoreClaimsVsEvidence(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'claims_vs_evidence';
  const label = 'Claims vs Evidence';
  const weight = 0.25;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  const specialties = deduplicateCI(f.specialties_list);

  if (specialties.length === 0) {
    return {
      key,
      label,
      weight,
      score: 0,
      level: 'insufficient_data',
      evidence: [{ claim: 'Specialty claims', finding: 'No specialties listed', supported: false, source: 'specialties field' }],
      flags: [],
      available: false,
    };
  }

  let supported = 0;
  let total = 0;

  for (const specialty of specialties) {
    const canonical = normalizeSpecialty(specialty);
    const requirements = SPECIALTY_REQUIREMENTS[canonical];

    if (!requirements) {
      // Unknown specialty — can't verify, skip silently
      continue;
    }

    total++;

    // Check equipment
    const equipMatch = findMatches(f.equipment_list, requirements.equipment);
    // Check procedures
    const procMatch = findMatches(f.procedures_list, requirements.procedures);

    const hasAnyEquipment = equipMatch.matched.length > 0;
    const hasAnyProcedure = procMatch.matched.length > 0;

    if (hasAnyEquipment || hasAnyProcedure) {
      supported++;
      evidence.push({
        claim: `Specialty: ${specialty}`,
        finding: `Supported by ${equipMatch.matched.length} equipment + ${procMatch.matched.length} procedure matches`,
        supported: true,
        source: 'equipment & procedures fields',
      });
    } else {
      evidence.push({
        claim: `Specialty: ${specialty}`,
        finding: `No matching equipment or procedures found. Expected: ${requirements.equipment.slice(0, 3).join(', ')}...`,
        supported: false,
        source: 'equipment & procedures fields',
      });
      flags.push({
        severity: 'critical',
        message: `Claims "${specialty}" specialty but has no matching equipment or procedures`,
        dimension: key,
      });
    }
  }

  if (total === 0) {
    // All specialties were unknown — score based on evidence count
    return {
      key,
      label,
      weight,
      score: 50,
      level: 'moderate',
      evidence,
      flags,
      available: true,
    };
  }

  const score = Math.round((supported / total) * 100);

  return {
    key,
    label,
    weight,
    score,
    level: scoreToLevel(score),
    evidence,
    flags,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Dimension 2: Staffing (weight 0.15)
// ---------------------------------------------------------------------------

export function scoreStaffing(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'staffing';
  const label = 'Staffing Adequacy';
  const weight = 0.15;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  const doctors = f.num_doctors;
  const beds = f.num_beds;
  const specialties = deduplicateCI(f.specialties_list);

  if (doctors === null || doctors === undefined) {
    return {
      key,
      label,
      weight,
      score: 0,
      level: 'insufficient_data',
      evidence: [{ claim: 'Doctor count', finding: 'Not reported', supported: false, source: 'num_doctors field' }],
      flags: [],
      available: false,
    };
  }

  let score = 100;

  // Doctor-to-specialty ratio
  if (specialties.length > 0 && doctors > 0) {
    const ratio = specialties.length / doctors;
    evidence.push({
      claim: `${doctors} doctors cover ${specialties.length} specialties`,
      finding: `Ratio: 1 doctor per ${(specialties.length / doctors).toFixed(1)} specialties`,
      supported: ratio <= 3,
      source: 'num_doctors + specialties fields',
    });

    if (ratio >= 5) {
      score -= 50;
      flags.push({
        severity: 'critical',
        message: `${doctors} doctor(s) covering ${specialties.length} specialties (1:${ratio.toFixed(0)} ratio is not credible)`,
        dimension: key,
      });
    } else if (ratio > 3) {
      score -= 25;
      flags.push({
        severity: 'warning',
        message: `${doctors} doctor(s) covering ${specialties.length} specialties (1:${ratio.toFixed(0)} ratio is concerning)`,
        dimension: key,
      });
    }
  } else if (doctors === 0 && specialties.length > 0) {
    score -= 60;
    flags.push({
      severity: 'critical',
      message: `Claims ${specialties.length} specialties but reports 0 doctors`,
      dimension: key,
    });
    evidence.push({
      claim: 'Doctors for specialties',
      finding: '0 doctors with claimed specialties',
      supported: false,
      source: 'num_doctors field',
    });
  }

  // Beds-per-doctor ratio
  if (beds !== null && beds !== undefined && beds > 0 && doctors > 0) {
    const bedsPerDoc = beds / doctors;
    evidence.push({
      claim: `${beds} beds with ${doctors} doctors`,
      finding: `${bedsPerDoc.toFixed(1)} beds per doctor`,
      supported: bedsPerDoc <= 30,
      source: 'num_beds + num_doctors fields',
    });

    if (bedsPerDoc > 30) {
      score -= 20;
      flags.push({
        severity: 'warning',
        message: `${bedsPerDoc.toFixed(0)} beds per doctor — dangerously high ratio`,
        dimension: key,
      });
    }
  }

  // Zero doctors is a problem regardless
  if (doctors === 0) {
    score = Math.min(score, 20);
    evidence.push({
      claim: 'Has doctors',
      finding: 'Reports 0 doctors',
      supported: false,
      source: 'num_doctors field',
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    key,
    label,
    weight,
    score,
    level: scoreToLevel(score),
    evidence,
    flags,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Dimension 3: Location (weight 0.15)
// ---------------------------------------------------------------------------

export function scoreLocation(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'location';
  const label = 'Location Verification';
  const weight = 0.15;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  let score = 100;
  let hasSomething = false;

  // Coordinate validation
  if (f.latitude !== null && f.longitude !== null) {
    hasSomething = true;
    const coordResult = validateCoordinates(f.latitude, f.longitude);

    if (!coordResult.valid) {
      score -= 50;
      evidence.push({
        claim: 'Valid coordinates',
        finding: coordResult.issues.join('; '),
        supported: false,
        source: 'latitude + longitude fields',
      });
      flags.push({
        severity: 'critical',
        message: coordResult.issues.join('; '),
        dimension: key,
      });
    } else if (!coordResult.inIndia) {
      score -= 50;
      evidence.push({
        claim: 'Coordinates in India',
        finding: coordResult.issues.join('; '),
        supported: false,
        source: 'latitude + longitude fields',
      });
      flags.push({
        severity: 'critical',
        message: `Coordinates (${f.latitude}, ${f.longitude}) are outside India`,
        dimension: key,
      });
    } else {
      evidence.push({
        claim: 'Coordinates in India',
        finding: 'Coordinates fall within India',
        supported: true,
        source: 'latitude + longitude fields',
      });
    }
  }

  // PIN code validation
  if (f.pincode && f.state) {
    hasSomething = true;
    const pinResult = validatePincode(f.pincode, f.state);

    if (!pinResult.valid) {
      score -= 30;
      evidence.push({
        claim: 'Valid PIN code',
        finding: pinResult.issues.join('; '),
        supported: false,
        source: 'pincode field',
      });
      flags.push({
        severity: 'warning',
        message: pinResult.issues.join('; '),
        dimension: key,
      });
    } else if (!pinResult.matches_state) {
      score -= 20;
      evidence.push({
        claim: 'PIN matches state',
        finding: pinResult.issues.join('; '),
        supported: false,
        source: 'pincode + state fields',
      });
      flags.push({
        severity: 'warning',
        message: `PIN code ${f.pincode} does not match state ${f.state}`,
        dimension: key,
      });
    } else {
      evidence.push({
        claim: 'PIN matches state',
        finding: `PIN code ${f.pincode} matches ${f.state}`,
        supported: true,
        source: 'pincode + state fields',
      });
    }
  }

  if (!hasSomething) {
    return {
      key,
      label,
      weight,
      score: 0,
      level: 'insufficient_data',
      evidence: [{ claim: 'Location data', finding: 'No coordinates or PIN code provided', supported: false, source: 'location fields' }],
      flags: [],
      available: false,
    };
  }

  score = Math.max(0, Math.min(100, score));

  return {
    key,
    label,
    weight,
    score,
    level: scoreToLevel(score),
    evidence,
    flags,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Dimension 4: Accreditation (weight 0.15)
// ---------------------------------------------------------------------------

export function scoreAccreditation(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'accreditation';
  const label = 'Accreditation';
  const weight = 0.15;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  const sources = [
    f.accreditation_text ?? '',
    f.capabilities_text ?? '',
  ].join(' ');

  if (!sources.trim()) {
    return {
      key,
      label,
      weight,
      score: 0,
      level: 'insufficient_data',
      evidence: [{
        claim: 'Accreditation info',
        finding: 'No accreditation or capabilities text provided',
        supported: false,
        source: 'accreditation_text + capabilities_text fields',
      }],
      flags: [],
      available: false,
    };
  }

  const found: string[] = [];
  const upperSources = sources.toUpperCase();

  for (const keyword of ACCREDITATION_KEYWORDS) {
    if (upperSources.includes(keyword.toUpperCase())) {
      found.push(keyword);
    }
  }

  if (found.length > 0) {
    evidence.push({
      claim: `Accreditation: ${found.join(', ')}`,
      finding: 'Claimed in text but cannot be independently verified from this dataset alone',
      supported: true,
      source: 'accreditation_text + capabilities_text fields',
    });
    flags.push({
      severity: 'info',
      message: `Accreditation claimed (${found.join(', ')}) — requires independent verification`,
      dimension: key,
    });

    return {
      key,
      label,
      weight,
      score: 80,
      level: 'high',
      evidence,
      flags,
      available: true,
    };
  }

  // Text exists but no accreditation keywords found
  evidence.push({
    claim: 'Accreditation',
    finding: 'No accreditation keywords found in facility text',
    supported: false,
    source: 'accreditation_text + capabilities_text fields',
  });

  return {
    key,
    label,
    weight,
    score: 40,
    level: 'low',
    evidence,
    flags,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Dimension 5: Digital Presence (weight 0.10)
// ---------------------------------------------------------------------------

export function scoreDigital(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'digital';
  const label = 'Digital Presence';
  const weight = 0.10;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  let score = 0;
  let hasSomething = false;

  // Website
  if (hasValue(f.website)) {
    hasSomething = true;
    score += 40;
    evidence.push({
      claim: 'Has website',
      finding: `Website listed: ${f.website}`,
      supported: true,
      source: 'website field',
    });
  }

  // Social media
  const socialCount = f.social_media_count;
  if (socialCount !== null && socialCount !== undefined) {
    hasSomething = true;
    if (socialCount > 0) {
      score += Math.min(30, socialCount * 10);
      evidence.push({
        claim: 'Social media presence',
        finding: `${socialCount} social media account(s)`,
        supported: true,
        source: 'social_media_count field',
      });
    } else {
      evidence.push({
        claim: 'Social media presence',
        finding: 'No social media accounts reported',
        supported: false,
        source: 'social_media_count field',
      });
    }
  }

  // Last updated recency
  if (hasValue(f.last_updated)) {
    hasSomething = true;
    const lastDate = new Date(f.last_updated as string);
    if (!isNaN(lastDate.getTime())) {
      const now = new Date('2026-06-15'); // deterministic "now" for the hackathon
      const daysSince = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSince <= 365) {
        score += 30;
        evidence.push({
          claim: 'Recently updated',
          finding: `Last updated ${daysSince} days ago`,
          supported: true,
          source: 'last_updated field',
        });
      } else if (daysSince <= 730) {
        score += 15;
        evidence.push({
          claim: 'Recently updated',
          finding: `Last updated ${daysSince} days ago (over 1 year)`,
          supported: false,
          source: 'last_updated field',
        });
        flags.push({
          severity: 'info',
          message: `Data last updated over ${Math.floor(daysSince / 365)} year(s) ago`,
          dimension: key,
        });
      } else {
        score += 5;
        evidence.push({
          claim: 'Recently updated',
          finding: `Last updated ${daysSince} days ago (very stale)`,
          supported: false,
          source: 'last_updated field',
        });
        flags.push({
          severity: 'warning',
          message: `Data last updated over ${Math.floor(daysSince / 365)} years ago — may be outdated`,
          dimension: key,
        });
      }
    }
  }

  if (!hasSomething) {
    return {
      key,
      label,
      weight,
      score: 0,
      level: 'insufficient_data',
      evidence: [{ claim: 'Digital presence', finding: 'No website, social media, or update info', supported: false, source: 'digital fields' }],
      flags: [],
      available: false,
    };
  }

  score = Math.max(0, Math.min(100, score));

  return {
    key,
    label,
    weight,
    score,
    level: scoreToLevel(score),
    evidence,
    flags,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Dimension 6: Completeness (weight 0.10)
// ---------------------------------------------------------------------------

export function scoreCompleteness(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'completeness';
  const label = 'Data Completeness';
  const weight = 0.10;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  let filled = 0;
  const missing: string[] = [];

  for (const field of IMPORTANT_FIELDS) {
    const val = (f as Record<string, unknown>)[field];
    if (hasValue(val)) {
      filled++;
    } else {
      missing.push(field);
    }
  }

  const total = IMPORTANT_FIELDS.length;
  const pct = Math.round((filled / total) * 100);

  evidence.push({
    claim: 'Data completeness',
    finding: `${filled}/${total} important fields populated (${pct}%)`,
    supported: pct >= 70,
    source: 'all fields',
  });

  if (missing.length > 0) {
    evidence.push({
      claim: 'Missing fields',
      finding: `Missing: ${missing.join(', ')}`,
      supported: false,
      source: 'all fields',
    });
  }

  if (pct < 50) {
    flags.push({
      severity: 'warning',
      message: `Only ${pct}% of important fields are populated`,
      dimension: key,
    });
  }

  return {
    key,
    label,
    weight,
    score: pct,
    level: scoreToLevel(pct),
    evidence,
    flags,
    available: true, // always available — we can always measure completeness
  };
}

// ---------------------------------------------------------------------------
// Dimension 7: Consistency (weight 0.10)
// ---------------------------------------------------------------------------

export function scoreConsistency(f: ParsedFacility): DimensionScore {
  const key: DimensionKey = 'consistency';
  const label = 'Internal Consistency';
  const weight = 0.10;
  const evidence: EvidenceItem[] = [];
  const flags: Flag[] = [];

  let issues = 0;
  let checks = 0;

  const specialties = deduplicateCI(f.specialties_list);
  const facilityType = (f.facility_type ?? '').trim();
  const expectations = FACILITY_TYPE_EXPECTATIONS[facilityType];

  // Check 1: Too many specialties for facility type
  if (expectations && specialties.length > 0) {
    checks++;
    if (specialties.length > expectations.max_reasonable_specialties) {
      issues++;
      flags.push({
        severity: 'warning',
        message: `${facilityType} claims ${specialties.length} specialties (max reasonable: ${expectations.max_reasonable_specialties})`,
        dimension: key,
      });
      evidence.push({
        claim: `Specialty count for ${facilityType}`,
        finding: `${specialties.length} specialties exceeds reasonable max of ${expectations.max_reasonable_specialties}`,
        supported: false,
        source: 'facility_type + specialties',
      });
    } else {
      evidence.push({
        claim: `Specialty count for ${facilityType}`,
        finding: `${specialties.length} specialties within reasonable range`,
        supported: true,
        source: 'facility_type + specialties',
      });
    }
  }

  // Check 2: Too many departments for facility type
  if (expectations && f.departments_list.length > 0) {
    checks++;
    if (f.departments_list.length > expectations.max_reasonable_departments) {
      issues++;
      flags.push({
        severity: 'warning',
        message: `${facilityType} claims ${f.departments_list.length} departments (max reasonable: ${expectations.max_reasonable_departments})`,
        dimension: key,
      });
      evidence.push({
        claim: `Department count for ${facilityType}`,
        finding: `${f.departments_list.length} departments exceeds reasonable max of ${expectations.max_reasonable_departments}`,
        supported: false,
        source: 'facility_type + departments',
      });
    }
  }

  // Check 3: Surgery specialty without OT
  const hasSurgicalSpecialty = specialties.some((s) => {
    const c = normalizeSpecialty(s);
    return c.includes('surgery') || c === 'orthopedics' || c === 'neurosurgery' ||
           c === 'urology' || c === 'ophthalmology' || c === 'gynecology';
  });

  if (hasSurgicalSpecialty) {
    checks++;
    const numOt = f.num_ot ?? 0;
    const hasOtEquip = listContainsCI(f.equipment_list, 'Operation Theater') ||
                       listContainsCI(f.equipment_list, 'Operation Theatre') ||
                       listContainsCI(f.equipment_list, 'OT');

    if (numOt === 0 && !hasOtEquip) {
      issues++;
      flags.push({
        severity: 'critical',
        message: 'Claims surgical specialty but reports no operation theaters',
        dimension: key,
      });
      evidence.push({
        claim: 'Surgical facility has OT',
        finding: 'No operation theaters despite surgical specialties',
        supported: false,
        source: 'specialties + num_ot + equipment',
      });
    } else {
      evidence.push({
        claim: 'Surgical facility has OT',
        finding: `Operation theater capacity: ${numOt > 0 ? numOt + ' OT(s)' : 'listed in equipment'}`,
        supported: true,
        source: 'specialties + num_ot + equipment',
      });
    }
  }

  // Check 4: ICU claimed but no ICU beds
  const hasICUSpecialty = specialties.some((s) => {
    const c = normalizeSpecialty(s);
    return c === 'critical care' || c === 'icu';
  });

  if (hasICUSpecialty) {
    checks++;
    const icuBeds = f.num_icu_beds ?? 0;
    if (icuBeds === 0) {
      issues++;
      flags.push({
        severity: 'critical',
        message: 'Claims ICU/Critical Care but reports 0 ICU beds',
        dimension: key,
      });
      evidence.push({
        claim: 'ICU has beds',
        finding: '0 ICU beds despite ICU/Critical Care specialty claim',
        supported: false,
        source: 'specialties + num_icu_beds',
      });
    }
  }

  // Check 5: Duplicate specialties (after normalization)
  // Use raw list, not deduplicated — we WANT to detect duplicates
  const rawSpecialties = f.specialties_list;
  if (rawSpecialties.length > 0) {
    checks++;
    const normalized = rawSpecialties.map(normalizeSpecialty);
    const uniqueNorm = new Set(normalized);
    const duplicates = normalized.length - uniqueNorm.size;
    if (duplicates > 0) {
      issues++;
      flags.push({
        severity: 'info',
        message: `${duplicates} duplicate specialty entries (after normalization)`,
        dimension: key,
      });
      evidence.push({
        claim: 'No duplicate specialties',
        finding: `${duplicates} duplicate(s) found`,
        supported: false,
        source: 'specialties',
      });
    }
  }

  // Check 6: Small facility with excessive specialties
  const beds = f.num_beds ?? 0;
  if (beds > 0 && beds <= 10 && specialties.length > 5) {
    checks++;
    issues++;
    flags.push({
      severity: 'warning',
      message: `${beds}-bed facility claims ${specialties.length} specialties — unlikely to sustain all`,
      dimension: key,
    });
    evidence.push({
      claim: 'Bed count supports specialty count',
      finding: `Only ${beds} beds for ${specialties.length} specialties`,
      supported: false,
      source: 'num_beds + specialties',
    });
  }

  // Check 7: Emergency services claim consistency
  const claimsEmergency = f.emergency_services === true ||
    f.emergency_services === 1 ||
    f.emergency_services === 'Yes' ||
    f.emergency_services === 'yes' ||
    f.emergency_services === 'Y';

  if (claimsEmergency) {
    checks++;
    const hasEmergencyEquip =
      listContainsCI(f.equipment_list, 'Defibrillator') ||
      listContainsCI(f.equipment_list, 'Ventilator') ||
      listContainsCI(f.equipment_list, 'Crash Cart') ||
      listContainsCI(f.equipment_list, 'Ambu Bag');

    if (!hasEmergencyEquip && f.equipment_list.length > 0) {
      // Only flag if they listed equipment but none is emergency-related
      issues++;
      flags.push({
        severity: 'warning',
        message: 'Claims emergency services but lists no emergency equipment (defibrillator, ventilator, crash cart)',
        dimension: key,
      });
      evidence.push({
        claim: 'Emergency equipment present',
        finding: 'No emergency-specific equipment despite emergency services claim',
        supported: false,
        source: 'emergency_services + equipment',
      });
    }
  }

  if (checks === 0) {
    return {
      key,
      label,
      weight,
      score: 0,
      level: 'insufficient_data',
      evidence: [{ claim: 'Consistency checks', finding: 'Not enough data to run consistency checks', supported: false, source: 'multiple fields' }],
      flags: [],
      available: false,
    };
  }

  const score = Math.round(((checks - issues) / checks) * 100);

  return {
    key,
    label,
    weight,
    score: Math.max(0, Math.min(100, score)),
    level: scoreToLevel(score),
    evidence,
    flags,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Composite trust profile
// ---------------------------------------------------------------------------

export function computeTrustProfile(raw: Facility): TrustProfile {
  const f = parseFacility(raw);

  const dimensions: DimensionScore[] = [
    scoreClaimsVsEvidence(f),
    scoreStaffing(f),
    scoreLocation(f),
    scoreAccreditation(f),
    scoreDigital(f),
    scoreCompleteness(f),
    scoreConsistency(f),
  ];

  // Weighted average over available dimensions only
  const available = dimensions.filter((d) => d.available);
  let compositeScore = 0;

  if (available.length > 0) {
    const totalWeight = available.reduce((sum, d) => sum + d.weight, 0);
    const weightedSum = available.reduce((sum, d) => sum + d.score * d.weight, 0);
    compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  // Collect all flags from all dimensions
  const allFlags: Flag[] = dimensions.flatMap((d) => d.flags);

  const compositeLevel: TrustLevel =
    available.length < 3
      ? 'insufficient_data'
      : scoreToLevel(compositeScore);

  return {
    facility_id: raw.id,
    facility_name: raw.facility_name,
    composite_score: compositeScore,
    composite_level: compositeLevel,
    dimensions,
    flags: allFlags,
    scored_dimensions: available.length,
    total_dimensions: 7,
  };
}

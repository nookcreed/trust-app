/**
 * Geographic validation — pure functions for Indian facility locations.
 * No I/O, no network calls. All reference data is inline.
 */

// ---------------------------------------------------------------------------
// India bounding box (generous; covers Andaman & Nicobar, Lakshadweep)
// ---------------------------------------------------------------------------

export const INDIA_BOUNDS = {
  lat: { min: 6.5, max: 37.5 },
  lon: { min: 68.0, max: 97.5 },
} as const;

// ---------------------------------------------------------------------------
// State → PIN prefix mapping
// First 1–2 digits of 6-digit Indian PIN code by state/UT.
// Sources: India Post PIN code directory.
// ---------------------------------------------------------------------------

export const STATE_PIN_PREFIXES: Record<string, number[]> = {
  // North India
  'Delhi': [11],
  'Haryana': [12, 13],
  'Punjab': [14, 15, 16],
  'Himachal Pradesh': [17],
  'Jammu and Kashmir': [18, 19],
  'Jammu & Kashmir': [18, 19],
  'Ladakh': [19],
  'Chandigarh': [16],
  'Uttarakhand': [24, 25, 26],

  // Uttar Pradesh (largest range)
  'Uttar Pradesh': [20, 21, 22, 23, 24, 25, 26, 27, 28],

  // Rajasthan
  'Rajasthan': [30, 31, 32, 33, 34],

  // Gujarat & Dadra-Nagar
  'Gujarat': [36, 37, 38, 39],
  'Dadra and Nagar Haveli': [39],
  'Dadra and Nagar Haveli and Daman and Diu': [39, 36],
  'Daman and Diu': [39, 36],

  // Madhya Pradesh & Chhattisgarh
  'Madhya Pradesh': [45, 46, 47, 48, 49],
  'Chhattisgarh': [49, 48, 47],

  // Maharashtra
  'Maharashtra': [40, 41, 42, 43, 44],

  // Goa
  'Goa': [40],

  // Karnataka
  'Karnataka': [56, 57, 58, 59],

  // Andhra Pradesh & Telangana
  'Andhra Pradesh': [51, 52, 53],
  'Telangana': [50, 51],

  // Tamil Nadu & Puducherry
  'Tamil Nadu': [60, 61, 62, 63, 64],
  'Puducherry': [60, 61],
  'Pondicherry': [60, 61],

  // Kerala & Lakshadweep
  'Kerala': [67, 68, 69],
  'Lakshadweep': [68],

  // West Bengal
  'West Bengal': [70, 71, 72, 73, 74],

  // Odisha
  'Odisha': [75, 76, 77],
  'Orissa': [75, 76, 77],

  // Bihar & Jharkhand
  'Bihar': [80, 81, 82, 83, 84, 85],
  'Jharkhand': [81, 82, 83, 84, 85],

  // Northeast
  'Assam': [78],
  'Meghalaya': [79],
  'Arunachal Pradesh': [79],
  'Nagaland': [79],
  'Manipur': [79],
  'Mizoram': [79],
  'Tripura': [79],
  'Sikkim': [73],

  // Andaman
  'Andaman and Nicobar Islands': [74],
  'Andaman & Nicobar': [74],
};

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/**
 * Check whether (lat, lon) falls within India's bounding box.
 */
export function isInIndia(lat: number, lon: number): boolean {
  return (
    lat >= INDIA_BOUNDS.lat.min &&
    lat <= INDIA_BOUNDS.lat.max &&
    lon >= INDIA_BOUNDS.lon.min &&
    lon <= INDIA_BOUNDS.lon.max
  );
}

/**
 * Check whether a PIN code's leading digits match the expected
 * prefixes for a given state.
 */
export function pinMatchesState(pincode: string, state: string): boolean {
  const clean = pincode.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;

  const normalizedState = state.trim();
  const prefixes = STATE_PIN_PREFIXES[normalizedState];
  if (!prefixes) {
    // Unknown state — can't validate, don't reject
    return true;
  }

  const first2 = parseInt(clean.substring(0, 2), 10);
  return prefixes.includes(first2);
}

/**
 * Validate raw coordinate values. Returns structured result with
 * validity, India-check, and issue list.
 */
export function validateCoordinates(
  lat: unknown,
  lon: unknown,
): { valid: boolean; inIndia: boolean; issues: string[] } {
  const issues: string[] = [];

  const latNum = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const lonNum = typeof lon === 'number' ? lon : parseFloat(String(lon));

  if (isNaN(latNum) || isNaN(lonNum)) {
    issues.push('Coordinates are not valid numbers');
    return { valid: false, inIndia: false, issues };
  }

  if (latNum < -90 || latNum > 90) {
    issues.push(`Latitude ${latNum} is outside valid range [-90, 90]`);
    return { valid: false, inIndia: false, issues };
  }

  if (lonNum < -180 || lonNum > 180) {
    issues.push(`Longitude ${lonNum} is outside valid range [-180, 180]`);
    return { valid: false, inIndia: false, issues };
  }

  const inIndia = isInIndia(latNum, lonNum);
  if (!inIndia) {
    // Check if lat/lon might be swapped
    const swappedInIndia = isInIndia(lonNum, latNum);
    if (swappedInIndia) {
      issues.push(
        `Coordinates (${latNum}, ${lonNum}) are outside India but would be inside if swapped — possible lat/lon swap`,
      );
    } else {
      issues.push(
        `Coordinates (${latNum}, ${lonNum}) are outside India`,
      );
    }
  }

  return { valid: true, inIndia, issues };
}

/**
 * Validate a PIN code string and optionally check state match.
 */
export function validatePincode(
  pincode: string,
  state: string,
): { valid: boolean; matches_state: boolean; issues: string[] } {
  const issues: string[] = [];
  const clean = pincode.replace(/\s/g, '');

  if (!/^\d{6}$/.test(clean)) {
    issues.push(`PIN code "${pincode}" is not a valid 6-digit number`);
    return { valid: false, matches_state: false, issues };
  }

  if (clean === '000000') {
    issues.push('PIN code is all zeros');
    return { valid: false, matches_state: false, issues };
  }

  const matchesState = pinMatchesState(clean, state);
  if (!matchesState) {
    issues.push(
      `PIN code ${clean} prefix does not match expected prefixes for ${state}`,
    );
  }

  return { valid: true, matches_state: matchesState, issues };
}

/**
 * Haversine distance between two points on Earth, in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

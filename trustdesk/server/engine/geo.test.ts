import { describe, it, expect } from 'vitest';
import {
  isInIndia,
  pinMatchesState,
  validateCoordinates,
  validatePincode,
  haversineDistance,
  INDIA_BOUNDS,
  STATE_PIN_PREFIXES,
} from './geo.js';

// ---------------------------------------------------------------------------
// isInIndia
// ---------------------------------------------------------------------------

describe('isInIndia', () => {
  it('returns true for Mumbai', () => {
    expect(isInIndia(19.076, 72.8777)).toBe(true);
  });

  it('returns true for Delhi', () => {
    expect(isInIndia(28.6139, 77.209)).toBe(true);
  });

  it('returns true for Chennai', () => {
    expect(isInIndia(13.0827, 80.2707)).toBe(true);
  });

  it('returns true for Srinagar (north extreme)', () => {
    expect(isInIndia(34.0837, 74.7973)).toBe(true);
  });

  it('returns true for Kanyakumari (south extreme)', () => {
    expect(isInIndia(8.0883, 77.5385)).toBe(true);
  });

  it('returns false for London', () => {
    expect(isInIndia(51.5074, -0.1278)).toBe(false);
  });

  it('returns false for New York', () => {
    expect(isInIndia(40.7128, -74.006)).toBe(false);
  });

  it('returns false for North Atlantic (Sanjivani scenario)', () => {
    // Kerala facility with coordinates in North Atlantic
    expect(isInIndia(55.0, -10.0)).toBe(false);
  });

  it('returns false for coordinates in the ocean south of India', () => {
    expect(isInIndia(2.0, 75.0)).toBe(false);
  });

  it('returns true for boundary lat min', () => {
    expect(isInIndia(6.5, 80.0)).toBe(true);
  });

  it('returns true for boundary lat max', () => {
    expect(isInIndia(37.5, 80.0)).toBe(true);
  });

  it('returns false for just below lat min', () => {
    expect(isInIndia(6.4, 80.0)).toBe(false);
  });

  it('returns false for just above lat max', () => {
    expect(isInIndia(37.6, 80.0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pinMatchesState
// ---------------------------------------------------------------------------

describe('pinMatchesState', () => {
  it('Kerala PIN matches Kerala', () => {
    expect(pinMatchesState('682001', 'Kerala')).toBe(true);
  });

  it('Maharashtra PIN matches Maharashtra', () => {
    expect(pinMatchesState('400001', 'Maharashtra')).toBe(true);
  });

  it('Delhi PIN matches Delhi', () => {
    expect(pinMatchesState('110001', 'Delhi')).toBe(true);
  });

  it('Karnataka PIN matches Karnataka', () => {
    expect(pinMatchesState('560001', 'Karnataka')).toBe(true);
  });

  it('Tamil Nadu PIN matches Tamil Nadu', () => {
    expect(pinMatchesState('600001', 'Tamil Nadu')).toBe(true);
  });

  it('Gujarat PIN matches Gujarat', () => {
    expect(pinMatchesState('380001', 'Gujarat')).toBe(true);
  });

  it('Kerala PIN does NOT match Maharashtra', () => {
    expect(pinMatchesState('682001', 'Maharashtra')).toBe(false);
  });

  it('returns true for unknown state (benefit of the doubt)', () => {
    expect(pinMatchesState('999999', 'Unknown State XYZ')).toBe(true);
  });

  it('returns false for invalid PIN (not 6 digits)', () => {
    expect(pinMatchesState('1234', 'Delhi')).toBe(false);
  });

  it('returns false for non-numeric PIN', () => {
    expect(pinMatchesState('abcdef', 'Delhi')).toBe(false);
  });

  it('handles PIN with spaces', () => {
    expect(pinMatchesState('110 001', 'Delhi')).toBe(true);
  });

  it('Rajasthan PIN matches Rajasthan', () => {
    expect(pinMatchesState('302001', 'Rajasthan')).toBe(true);
  });

  it('UP PIN matches Uttar Pradesh', () => {
    expect(pinMatchesState('226001', 'Uttar Pradesh')).toBe(true);
  });

  it('West Bengal PIN matches West Bengal', () => {
    expect(pinMatchesState('700001', 'West Bengal')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCoordinates
// ---------------------------------------------------------------------------

describe('validateCoordinates', () => {
  it('valid coordinates in India', () => {
    const result = validateCoordinates(28.6139, 77.209);
    expect(result.valid).toBe(true);
    expect(result.inIndia).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('valid coordinates outside India', () => {
    const result = validateCoordinates(51.5074, -0.1278);
    expect(result.valid).toBe(true);
    expect(result.inIndia).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('NaN coordinates', () => {
    const result = validateCoordinates('abc', 77.0);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Coordinates are not valid numbers');
  });

  it('latitude out of range', () => {
    const result = validateCoordinates(95, 77.0);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain('outside valid range');
  });

  it('detects possible lat/lon swap', () => {
    // Swapped Delhi coordinates: lon as lat, lat as lon
    const result = validateCoordinates(77.209, 28.6139);
    expect(result.valid).toBe(true);
    expect(result.inIndia).toBe(false);
    expect(result.issues.some((i) => i.includes('swap'))).toBe(true);
  });

  it('handles string inputs', () => {
    const result = validateCoordinates('28.6139', '77.209');
    expect(result.valid).toBe(true);
    expect(result.inIndia).toBe(true);
  });

  it('handles null-like values', () => {
    const result = validateCoordinates(null, null);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePincode
// ---------------------------------------------------------------------------

describe('validatePincode', () => {
  it('valid PIN matching state', () => {
    const result = validatePincode('110001', 'Delhi');
    expect(result.valid).toBe(true);
    expect(result.matches_state).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('valid PIN not matching state', () => {
    const result = validatePincode('682001', 'Delhi');
    expect(result.valid).toBe(true);
    expect(result.matches_state).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('invalid PIN (too short)', () => {
    const result = validatePincode('1234', 'Delhi');
    expect(result.valid).toBe(false);
  });

  it('all-zero PIN', () => {
    const result = validatePincode('000000', 'Delhi');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('PIN code is all zeros');
  });

  it('PIN with non-digits', () => {
    const result = validatePincode('11000a', 'Delhi');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------

describe('haversineDistance', () => {
  it('same point returns 0', () => {
    expect(haversineDistance(28.6, 77.2, 28.6, 77.2)).toBe(0);
  });

  it('Mumbai to Delhi is roughly 1150 km', () => {
    const dist = haversineDistance(19.076, 72.8777, 28.6139, 77.209);
    expect(dist).toBeGreaterThan(1100);
    expect(dist).toBeLessThan(1200);
  });

  it('Mumbai to Chennai is roughly 1030 km', () => {
    const dist = haversineDistance(19.076, 72.8777, 13.0827, 80.2707);
    expect(dist).toBeGreaterThan(980);
    expect(dist).toBeLessThan(1080);
  });

  it('short distance within same city', () => {
    // Two points in Bangalore ~10 km apart
    const dist = haversineDistance(12.9716, 77.5946, 12.9352, 77.6245);
    expect(dist).toBeGreaterThan(3);
    expect(dist).toBeLessThan(15);
  });

  it('antipodal points return roughly 20000 km', () => {
    const dist = haversineDistance(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(19900);
    expect(dist).toBeLessThan(20100);
  });
});

// ---------------------------------------------------------------------------
// Data completeness — STATE_PIN_PREFIXES coverage
// ---------------------------------------------------------------------------

describe('STATE_PIN_PREFIXES coverage', () => {
  it('has at least 20 states', () => {
    expect(Object.keys(STATE_PIN_PREFIXES).length).toBeGreaterThanOrEqual(20);
  });

  it('all prefixes are 2-digit numbers', () => {
    for (const [_state, prefixes] of Object.entries(STATE_PIN_PREFIXES)) {
      for (const p of prefixes) {
        expect(p).toBeGreaterThanOrEqual(10);
        expect(p).toBeLessThanOrEqual(99);
      }
    }
  });
});

describe('INDIA_BOUNDS', () => {
  it('lat range is valid', () => {
    expect(INDIA_BOUNDS.lat.min).toBeLessThan(INDIA_BOUNDS.lat.max);
  });

  it('lon range is valid', () => {
    expect(INDIA_BOUNDS.lon.min).toBeLessThan(INDIA_BOUNDS.lon.max);
  });
});

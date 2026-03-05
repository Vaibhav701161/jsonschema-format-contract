import { describe, it, expect } from 'vitest';
import {
  FORMAT_REGISTRY,
  getFormatSpec,
  getSupportedFormats,
  getFormatsByCategory,
  getAllEdgeCases,
} from './formatRegistry';

describe('FORMAT_REGISTRY', () => {
  it('should contain standard JSON Schema formats', () => {
    const required = ['email', 'uri', 'hostname', 'ipv4', 'ipv6', 'date-time', 'date', 'time', 'uuid', 'json-pointer'];
    for (const fmt of required) {
      expect(FORMAT_REGISTRY[fmt]).toBeDefined();
    }
  });

  it('should have rfc references for all formats', () => {
    for (const [name, spec] of Object.entries(FORMAT_REGISTRY)) {
      expect(spec.rfc).toBeTruthy();
      expect(spec.name).toBe(name);
    }
  });

  it('should have grammar for all formats', () => {
    for (const spec of Object.values(FORMAT_REGISTRY)) {
      expect(spec.grammar.length).toBeGreaterThan(0);
    }
  });

  it('should have at least 3 edge cases per format', () => {
    for (const [name, spec] of Object.entries(FORMAT_REGISTRY)) {
      expect(spec.edgeCases.length, `${name} should have >= 3 edge cases`).toBeGreaterThanOrEqual(3);
    }
  });

  it('should have both valid and invalid edge cases for major formats', () => {
    const major = ['email', 'uri', 'date-time', 'ipv4', 'ipv6', 'hostname'];
    for (const fmt of major) {
      const spec = FORMAT_REGISTRY[fmt];
      expect(spec.edgeCases.some((e) => e.valid), `${fmt} needs valid cases`).toBe(true);
      expect(spec.edgeCases.some((e) => !e.valid), `${fmt} needs invalid cases`).toBe(true);
    }
  });
});

describe('getFormatSpec', () => {
  it('should return spec for known format', () => {
    const spec = getFormatSpec('email');
    expect(spec).toBeDefined();
    expect(spec!.name).toBe('email');
  });

  it('should return undefined for unknown format', () => {
    expect(getFormatSpec('nonexistent')).toBeUndefined();
  });
});

describe('getSupportedFormats', () => {
  it('should return sorted list', () => {
    const formats = getSupportedFormats();
    const sorted = [...formats].sort();
    expect(formats).toEqual(sorted);
  });

  it('should include >= 15 formats', () => {
    expect(getSupportedFormats().length).toBeGreaterThanOrEqual(15);
  });
});

describe('getFormatsByCategory', () => {
  it('should return temporal formats', () => {
    const temporal = getFormatsByCategory('temporal');
    expect(temporal.length).toBeGreaterThanOrEqual(3);
    expect(temporal.every((s) => s.category === 'temporal')).toBe(true);
  });

  it('should return network formats', () => {
    const network = getFormatsByCategory('network');
    expect(network.length).toBeGreaterThanOrEqual(2);
  });

  it('should return sorted by name', () => {
    const temporal = getFormatsByCategory('temporal');
    const names = temporal.map((s) => s.name);
    expect(names).toEqual([...names].sort());
  });
});

describe('getAllEdgeCases', () => {
  it('should return edge cases for known format', () => {
    const cases = getAllEdgeCases('email');
    expect(cases.length).toBeGreaterThan(0);
  });

  it('should return empty for unknown format', () => {
    expect(getAllEdgeCases('nonexistent')).toEqual([]);
  });
});

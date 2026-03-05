import { describe, it, expect } from 'vitest';
import {
  generateFormatTestSuite,
  generateAllFormatTestSuites,
  toTestSuiteJson,
} from './formatTestGenerator';

describe('generateFormatTestSuite', () => {
  it('should generate suite for email', () => {
    const suite = generateFormatTestSuite('email');
    expect(suite).toBeDefined();
    expect(suite!.format).toBe('email');
    expect(suite!.rfc).toBe('RFC 5321/5322');
    expect(suite!.validTests.tests.length).toBeGreaterThan(0);
    expect(suite!.invalidTests.tests.length).toBeGreaterThan(0);
    expect(suite!.totalTests).toBe(
      suite!.validTests.tests.length + suite!.invalidTests.tests.length,
    );
  });

  it('should generate suite for date-time', () => {
    const suite = generateFormatTestSuite('date-time');
    expect(suite).toBeDefined();
    expect(suite!.validTests.schema.format).toBe('date-time');
  });

  it('should return undefined for unknown format', () => {
    expect(generateFormatTestSuite('nonexistent')).toBeUndefined();
  });

  it('should produce valid test cases with valid=true', () => {
    const suite = generateFormatTestSuite('uri')!;
    for (const test of suite.validTests.tests) {
      expect(test.valid).toBe(true);
    }
  });

  it('should produce invalid test cases with valid=false', () => {
    const suite = generateFormatTestSuite('ipv4')!;
    for (const test of suite.invalidTests.tests) {
      expect(test.valid).toBe(false);
    }
  });

  it('should include grammar analysis when available', () => {
    const suite = generateFormatTestSuite('email')!;
    expect(suite.grammarAnalysis).toBeDefined();
  });
});

describe('generateAllFormatTestSuites', () => {
  it('should generate suites for all supported formats', () => {
    const suites = generateAllFormatTestSuites();
    expect(suites.length).toBeGreaterThanOrEqual(15);
    const formats = suites.map((s) => s.format);
    expect(formats).toContain('email');
    expect(formats).toContain('uri');
    expect(formats).toContain('date-time');
  });

  it('should produce deterministic output', () => {
    const first = generateAllFormatTestSuites();
    const second = generateAllFormatTestSuites();
    expect(first.map((s) => s.format)).toEqual(second.map((s) => s.format));
  });
});

describe('toTestSuiteJson', () => {
  it('should produce JSON Schema Test Suite format', () => {
    const suite = generateFormatTestSuite('email')!;
    const json = toTestSuiteJson(suite);
    expect(json.length).toBe(2); // valid + invalid groups

    const group = json[0] as { description: string; schema: { format: string }; tests: unknown[] };
    expect(group.description).toBeTruthy();
    expect(group.schema.format).toBe('email');
    expect(group.tests.length).toBeGreaterThan(0);
  });

  it('should have correct test shape', () => {
    const suite = generateFormatTestSuite('uri')!;
    const json = toTestSuiteJson(suite);
    const group = json[0] as { tests: Array<{ description: string; data: string; valid: boolean }> };
    for (const test of group.tests) {
      expect(typeof test.description).toBe('string');
      expect(typeof test.data).toBe('string');
      expect(typeof test.valid).toBe('boolean');
    }
  });
});

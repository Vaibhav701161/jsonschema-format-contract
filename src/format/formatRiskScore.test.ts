import { describe, it, expect } from 'vitest';
import { computeFormatRiskAggregate } from './formatRiskScore';
import type { FormatSurfaceReport } from './types';

function makeReport(overrides: Partial<FormatSurfaceReport> & { riskScore: number }): FormatSurfaceReport {
  return {
    format: 'email',
    pointer: '#/test',
    branchDepth: 0,
    refDepth: 0,
    combinatorDepth: 0,
    fanOut: 0,
    ...overrides,
  };
}

describe('computeFormatRiskAggregate', () => {
  it('returns zeros for empty reports', () => {
    const result = computeFormatRiskAggregate([]);
    expect(result).toEqual({
      totalFormats: 0,
      highRiskFormats: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
    });
  });

  it('computes summary for single report', () => {
    const result = computeFormatRiskAggregate([makeReport({ riskScore: 25 })]);
    expect(result.totalFormats).toBe(1);
    expect(result.highRiskFormats).toBe(0);
    expect(result.averageRiskScore).toBe(25);
    expect(result.maxRiskScore).toBe(25);
  });

  it('counts high risk formats with default threshold', () => {
    const reports = [
      makeReport({ riskScore: 10, pointer: '#/a' }),
      makeReport({ riskScore: 60, pointer: '#/b' }),
      makeReport({ riskScore: 80, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports);
    expect(result.totalFormats).toBe(3);
    expect(result.highRiskFormats).toBe(2); // 60 > 50, 80 > 50
    expect(result.maxRiskScore).toBe(80);
  });

  it('uses custom high risk threshold', () => {
    const reports = [
      makeReport({ riskScore: 10, pointer: '#/a' }),
      makeReport({ riskScore: 60, pointer: '#/b' }),
      makeReport({ riskScore: 80, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports, 70);
    expect(result.highRiskFormats).toBe(1); // only 80 > 70
  });

  it('computes average risk score rounded to 2 decimals', () => {
    const reports = [
      makeReport({ riskScore: 10, pointer: '#/a' }),
      makeReport({ riskScore: 20, pointer: '#/b' }),
      makeReport({ riskScore: 33, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports);
    expect(result.averageRiskScore).toBe(21); // (10+20+33)/3 = 21
  });

  it('tracks max risk score', () => {
    const reports = [
      makeReport({ riskScore: 5, pointer: '#/a' }),
      makeReport({ riskScore: 95, pointer: '#/b' }),
      makeReport({ riskScore: 42, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports);
    expect(result.maxRiskScore).toBe(95);
  });

  it('returns all high risk when all scores exceed threshold', () => {
    const reports = [
      makeReport({ riskScore: 60, pointer: '#/a' }),
      makeReport({ riskScore: 70, pointer: '#/b' }),
      makeReport({ riskScore: 80, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports);
    expect(result.highRiskFormats).toBe(3);
  });

  it('returns zero high risk when all scores are below threshold', () => {
    const reports = [
      makeReport({ riskScore: 10, pointer: '#/a' }),
      makeReport({ riskScore: 20, pointer: '#/b' }),
      makeReport({ riskScore: 30, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports);
    expect(result.highRiskFormats).toBe(0);
  });

  it('handles exact threshold boundary (not high risk)', () => {
    const reports = [makeReport({ riskScore: 50, pointer: '#/a' })];
    const result = computeFormatRiskAggregate(reports);
    expect(result.highRiskFormats).toBe(0); // 50 is NOT > 50
  });

  it('handles score of 0', () => {
    const reports = [makeReport({ riskScore: 0, pointer: '#/a' })];
    const result = computeFormatRiskAggregate(reports);
    expect(result.totalFormats).toBe(1);
    expect(result.highRiskFormats).toBe(0);
    expect(result.averageRiskScore).toBe(0);
    expect(result.maxRiskScore).toBe(0);
  });

  it('handles score of 100', () => {
    const reports = [makeReport({ riskScore: 100, pointer: '#/a' })];
    const result = computeFormatRiskAggregate(reports);
    expect(result.totalFormats).toBe(1);
    expect(result.highRiskFormats).toBe(1);
    expect(result.averageRiskScore).toBe(100);
    expect(result.maxRiskScore).toBe(100);
  });

  it('is deterministic across multiple runs', () => {
    const reports = [
      makeReport({ riskScore: 15, pointer: '#/a' }),
      makeReport({ riskScore: 75, pointer: '#/b' }),
    ];
    const run1 = computeFormatRiskAggregate(reports);
    const run2 = computeFormatRiskAggregate(reports);
    expect(run1).toEqual(run2);
  });

  it('computes correct average with non-trivial division', () => {
    const reports = [
      makeReport({ riskScore: 1, pointer: '#/a' }),
      makeReport({ riskScore: 2, pointer: '#/b' }),
      makeReport({ riskScore: 3, pointer: '#/c' }),
    ];
    const result = computeFormatRiskAggregate(reports);
    expect(result.averageRiskScore).toBe(2);
  });

  it('handles large number of reports', () => {
    const reports = Array.from({ length: 100 }, (_, i) =>
      makeReport({ riskScore: i, pointer: `#/${i}` }),
    );
    const result = computeFormatRiskAggregate(reports);
    expect(result.totalFormats).toBe(100);
    expect(result.maxRiskScore).toBe(99);
    // Average: (0+1+...+99)/100 = 49.5
    expect(result.averageRiskScore).toBe(49.5);
  });

  it('handles threshold of 0 (everything above is high risk)', () => {
    const reports = [
      makeReport({ riskScore: 1, pointer: '#/a' }),
      makeReport({ riskScore: 0, pointer: '#/b' }),
    ];
    const result = computeFormatRiskAggregate(reports, 0);
    expect(result.highRiskFormats).toBe(1); // score 1 > 0
  });
});

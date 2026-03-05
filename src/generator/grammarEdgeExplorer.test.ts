import { describe, it, expect } from 'vitest';
import { exploreGrammarEdges } from './grammarEdgeExplorer';

describe('exploreGrammarEdges', () => {
  it('should explore edges for known format', () => {
    const result = exploreGrammarEdges('email');
    expect(result).toBeDefined();
    expect(result!.format).toBe('email');
    expect(result!.totalBranches).toBeGreaterThan(0);
  });

  it('should calculate coverage percentage', () => {
    const result = exploreGrammarEdges('uri')!;
    expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.coveragePercent).toBeLessThanOrEqual(100);
  });

  it('should identify uncovered areas', () => {
    const result = exploreGrammarEdges('ipv6')!;
    // IPv6 has many grammar branches, likely some uncovered
    expect(result.uncoveredAreas).toBeDefined();
    expect(Array.isArray(result.uncoveredAreas)).toBe(true);
  });

  it('should prioritize uncovered areas', () => {
    const result = exploreGrammarEdges('email')!;
    if (result.uncoveredAreas.length > 1) {
      const priorities = result.uncoveredAreas.map((a) => a.priority);
      const order = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
      }
    }
  });

  it('should provide suggestions', () => {
    const result = exploreGrammarEdges('hostname')!;
    for (const area of result.uncoveredAreas) {
      expect(area.suggestion).toBeTruthy();
      expect(typeof area.suggestion).toBe('string');
    }
  });

  it('should return undefined for unknown format', () => {
    expect(exploreGrammarEdges('nonexistent')).toBeUndefined();
  });

  it('should produce consistent results', () => {
    const first = exploreGrammarEdges('date-time')!;
    const second = exploreGrammarEdges('date-time')!;
    expect(first.totalBranches).toBe(second.totalBranches);
    expect(first.coveragePercent).toBe(second.coveragePercent);
  });

  it('should have coveredCount + uncoveredCount === totalBranches', () => {
    const result = exploreGrammarEdges('ipv4')!;
    expect(result.coveredCount + result.uncoveredCount).toBe(result.totalBranches);
  });
});

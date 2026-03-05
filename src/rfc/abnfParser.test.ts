import { describe, it, expect } from 'vitest';
import { parseAbnf, countGrammarBranches, extractEdgeCaseHints } from './abnfParser';

describe('parseAbnf', () => {
  it('should extract rules from ABNF grammar', () => {
    const grammar = 'foo = "bar" / "baz"\nqux = 1*DIGIT';
    const features = parseAbnf(grammar);
    expect(features.rules).toHaveLength(2);
    expect(features.rules[0].name).toBe('foo');
    expect(features.rules[1].name).toBe('qux');
  });

  it('should detect alternations', () => {
    const grammar = 'foo = "a" / "b" / "c"';
    const features = parseAbnf(grammar);
    expect(features.alternations.length).toBeGreaterThanOrEqual(3);
  });

  it('should detect optional elements', () => {
    const grammar = 'foo = "bar" ["baz"]';
    const features = parseAbnf(grammar);
    expect(features.optionalElements.length).toBe(1);
    expect(features.optionalElements[0]).toContain('baz');
  });

  it('should detect repetitions', () => {
    const grammar = 'foo = *DIGIT "." 1*ALPHA';
    const features = parseAbnf(grammar);
    expect(features.repetitions.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect numeric ranges', () => {
    const grammar = 'foo = %x30-39';
    const features = parseAbnf(grammar);
    expect(features.numericRanges.length).toBe(1);
    expect(features.numericRanges[0]).toContain('48-57'); // 0x30=48, 0x39=57
  });

  it('should handle empty grammar', () => {
    const features = parseAbnf('');
    expect(features.rules).toHaveLength(0);
    expect(features.totalBranches).toBe(0);
  });

  it('should handle comments', () => {
    const grammar = '; This is a comment\nfoo = "bar"';
    const features = parseAbnf(grammar);
    expect(features.rules).toHaveLength(1);
  });

  it('should handle continuation lines', () => {
    const grammar = 'foo = "a"\n    / "b"';
    const features = parseAbnf(grammar);
    expect(features.rules).toHaveLength(1);
  });
});

describe('countGrammarBranches', () => {
  it('should return totalBranches from features', () => {
    const features = parseAbnf('foo = "a" / "b"\nbar = ["opt"]');
    expect(countGrammarBranches(features)).toBe(features.totalBranches);
    expect(features.totalBranches).toBeGreaterThan(0);
  });
});

describe('extractEdgeCaseHints', () => {
  it('should produce sorted hints', () => {
    const features = parseAbnf('foo = "a" / "b"\nbar = ["opt"] %x30-39');
    const hints = extractEdgeCaseHints(features);
    expect(hints.length).toBeGreaterThan(0);
    // Verify sorted
    const sorted = [...hints].sort();
    expect(hints).toEqual(sorted);
  });

  it('should include optional hints', () => {
    const features = parseAbnf('foo = ["opt"]');
    const hints = extractEdgeCaseHints(features);
    expect(hints.some((h) => h.startsWith('optional-present'))).toBe(true);
    expect(hints.some((h) => h.startsWith('optional-absent'))).toBe(true);
  });

  it('should include range hints', () => {
    const features = parseAbnf('foo = %x41-5A');
    const hints = extractEdgeCaseHints(features);
    expect(hints.some((h) => h.startsWith('range-min'))).toBe(true);
    expect(hints.some((h) => h.startsWith('range-max'))).toBe(true);
    expect(hints.some((h) => h.startsWith('range-below-min'))).toBe(true);
    expect(hints.some((h) => h.startsWith('range-above-max'))).toBe(true);
  });

  it('should include alternation hints', () => {
    const features = parseAbnf('foo = "a" / "b"');
    const hints = extractEdgeCaseHints(features);
    expect(hints.some((h) => h.startsWith('alternation-branch'))).toBe(true);
  });

  it('should return empty for empty grammar', () => {
    const features = parseAbnf('');
    const hints = extractEdgeCaseHints(features);
    expect(hints).toEqual([]);
  });
});

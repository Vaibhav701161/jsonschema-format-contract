import { describe, it, expect } from 'vitest';
import { analyzeFormatGrammar, analyzeGrammarFromSpec } from './grammarAnalyzer';
import { getFormatSpec } from './formatRegistry';

describe('analyzeFormatGrammar', () => {
  it('should analyze known format grammar', () => {
    const analysis = analyzeFormatGrammar('email');
    expect(analysis).toBeDefined();
    expect(analysis!.format).toBe('email');
    expect(analysis!.rfc).toBe('RFC 5321/5322');
    expect(analysis!.totalBranches).toBeGreaterThan(0);
    expect(analysis!.branches.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown format', () => {
    expect(analyzeFormatGrammar('nonexistent')).toBeUndefined();
  });

  it('should categorize branches correctly', () => {
    const analysis = analyzeFormatGrammar('uri');
    expect(analysis).toBeDefined();
    const categories = new Set(analysis!.branches.map((b) => b.category));
    expect(categories.size).toBeGreaterThanOrEqual(1);
  });

  it('should produce edge case hints', () => {
    const analysis = analyzeFormatGrammar('date-time');
    expect(analysis).toBeDefined();
    expect(analysis!.edgeCaseHints.length).toBeGreaterThan(0);
  });

  it('should include ABNF features', () => {
    const analysis = analyzeFormatGrammar('ipv4');
    expect(analysis).toBeDefined();
    expect(analysis!.abnfFeatures.rules.length).toBeGreaterThan(0);
  });
});

describe('analyzeGrammarFromSpec', () => {
  it('should produce analysis from spec', () => {
    const spec = getFormatSpec('uuid')!;
    const analysis = analyzeGrammarFromSpec(spec);
    expect(analysis.format).toBe('uuid');
    expect(analysis.branches.length).toBeGreaterThanOrEqual(0);
  });
});

import { describe, it, expect } from 'vitest';
import { classifyFormatRisk, classifyAllFormatRisks } from './classifyFormatRisk';
import type { FormatStructuralContext } from '../context/types';
import type { FormatRiskWeightConfig } from './types';
import { DEFAULT_RISK_WEIGHTS, HIGH_RISK_THRESHOLD } from './types';

function ctx(overrides: Partial<FormatStructuralContext> = {}): FormatStructuralContext {
  return {
    pointer: '#/properties/test',
    format: 'email',
    underRef: false,
    refChainDepth: 0,
    underDynamicRef: false,
    insideRecursiveCycle: false,
    underCombinator: false,
    combinatorTypes: [],
    combinatorDepth: 0,
    underConditional: false,
    underIf: false,
    underThen: false,
    underElse: false,
    underUnionType: false,
    underPatternProperties: false,
    underUnevaluatedProperties: false,
    requiredProperty: false,
    maxAncestorDepth: 1,
    ...overrides,
  };
}

describe('classifyFormatRisk', () => {
  it('returns zero score for vanilla context', () => {
    const result = classifyFormatRisk(ctx());
    expect(result.riskScore).toBe(0);
    expect(result.riskFactors).toEqual([]);
    expect(result.pointer).toBe('#/properties/test');
    expect(result.format).toBe('email');
  });

  it('adds recursive-cycle weight', () => {
    const result = classifyFormatRisk(ctx({ insideRecursiveCycle: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.recursiveCycle);
    expect(result.riskFactors).toContain('recursive-cycle');
    expect(result.requiresRecursionStress).toBe(true);
  });

  it('adds under-conditional weight', () => {
    const result = classifyFormatRisk(ctx({ underConditional: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.underConditional);
    expect(result.riskFactors).toContain('under-conditional');
    expect(result.requiresConditionalStress).toBe(true);
  });

  it('adds under-dynamic-ref weight', () => {
    const result = classifyFormatRisk(ctx({ underDynamicRef: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.underDynamicRef);
    expect(result.riskFactors).toContain('under-dynamic-ref');
    expect(result.requiresDynamicScopeStress).toBe(true);
  });

  it('adds under-unevaluated-properties weight', () => {
    const result = classifyFormatRisk(ctx({ underUnevaluatedProperties: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.underUnevaluatedProperties);
    expect(result.riskFactors).toContain('under-unevaluated-properties');
    expect(result.requiresAnnotationStress).toBe(true);
  });

  it('adds under-pattern-properties weight', () => {
    const result = classifyFormatRisk(ctx({ underPatternProperties: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.underPatternProperties);
    expect(result.riskFactors).toContain('under-pattern-properties');
  });

  it('adds union-type weight', () => {
    const result = classifyFormatRisk(ctx({ underUnionType: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.unionType);
    expect(result.riskFactors).toContain('union-type');
  });

  it('adds required-property weight', () => {
    const result = classifyFormatRisk(ctx({ requiredProperty: true }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.requiredProperty);
    expect(result.riskFactors).toContain('required-property');
  });

  it('does not add ref-chain when depth <= threshold', () => {
    const result = classifyFormatRisk(ctx({ refChainDepth: 3 }));
    expect(result.riskFactors).not.toContain(expect.stringContaining('ref-chain'));
    expect(result.requiresRefChainStress).toBe(true); // refChainDepth > 1
  });

  it('adds ref-chain-deep when depth > threshold', () => {
    const result = classifyFormatRisk(ctx({ refChainDepth: 4 }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.refChainDeep);
    expect(result.riskFactors).toContain('ref-chain-depth-4');
    expect(result.requiresRefChainStress).toBe(true);
  });

  it('does not add combinator-deep when depth <= threshold', () => {
    const result = classifyFormatRisk(ctx({
      underCombinator: true,
      combinatorTypes: ['allOf', 'oneOf'],
      combinatorDepth: 2,
    }));
    expect(result.riskFactors).not.toContain(expect.stringContaining('combinator-depth'));
  });

  it('adds combinator-deep when depth > threshold', () => {
    const result = classifyFormatRisk(ctx({
      underCombinator: true,
      combinatorTypes: ['allOf', 'oneOf', 'anyOf', 'not'],
      combinatorDepth: 4,
    }));
    expect(result.riskScore).toBe(DEFAULT_RISK_WEIGHTS.combinatorDeep);
    expect(result.riskFactors).toContain('combinator-depth-4');
    expect(result.requiresCombinatorStress).toBe(true);
  });

  it('no depth penalty when depth <= 5', () => {
    const result = classifyFormatRisk(ctx({ maxAncestorDepth: 5 }));
    expect(result.riskFactors).not.toContain(expect.stringContaining('depth-penalty'));
  });

  it('adds depth penalty when depth > 5', () => {
    const result = classifyFormatRisk(ctx({ maxAncestorDepth: 8 }));
    const expectedPenalty = (8 - 5) * DEFAULT_RISK_WEIGHTS.depthPenalty;
    expect(result.riskScore).toBe(expectedPenalty);
    expect(result.riskFactors).toContain('depth-penalty-8');
  });

  it('caps depth penalty at 10', () => {
    const result = classifyFormatRisk(ctx({ maxAncestorDepth: 50 }));
    expect(result.riskScore).toBe(10);
  });

  it('score is bounded at 100', () => {
    const result = classifyFormatRisk(ctx({
      insideRecursiveCycle: true,     // 20
      refChainDepth: 10,              // 15
      combinatorDepth: 10,            // 15
      underCombinator: true,
      combinatorTypes: ['allOf'],
      underConditional: true,         // 10
      underDynamicRef: true,          // 25
      underUnevaluatedProperties: true, // 20
      underPatternProperties: true,   // 5
      underUnionType: true,           // 5
      requiredProperty: true,         // 3
      maxAncestorDepth: 50,           // 10 (capped)
    }));
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('score is never negative', () => {
    const result = classifyFormatRisk(ctx());
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
  });

  it('combines multiple factors additively', () => {
    const result = classifyFormatRisk(ctx({
      insideRecursiveCycle: true,  // 20
      underConditional: true,      // 10
    }));
    expect(result.riskScore).toBe(30);
    expect(result.riskFactors).toContain('recursive-cycle');
    expect(result.riskFactors).toContain('under-conditional');
  });

  it('uses custom weights when provided', () => {
    const customWeights: FormatRiskWeightConfig = {
      ...DEFAULT_RISK_WEIGHTS,
      recursiveCycle: 50,
    };
    const result = classifyFormatRisk(ctx({ insideRecursiveCycle: true }), customWeights);
    expect(result.riskScore).toBe(50);
  });

  it('custom threshold changes when ref-chain-deep triggers', () => {
    const customWeights: FormatRiskWeightConfig = {
      ...DEFAULT_RISK_WEIGHTS,
      refChainThreshold: 1,
    };
    const result = classifyFormatRisk(ctx({ refChainDepth: 2 }), customWeights);
    expect(result.riskFactors).toContain('ref-chain-depth-2');
  });

  it('risk factors are sorted alphabetically', () => {
    const result = classifyFormatRisk(ctx({
      underConditional: true,
      insideRecursiveCycle: true,
      underPatternProperties: true,
    }));
    const factors = result.riskFactors;
    const sorted = [...factors].sort();
    expect(factors).toEqual(sorted);
  });

  it('requiresRefChainStress is true when refChainDepth > 1', () => {
    expect(classifyFormatRisk(ctx({ refChainDepth: 0 })).requiresRefChainStress).toBe(false);
    expect(classifyFormatRisk(ctx({ refChainDepth: 1 })).requiresRefChainStress).toBe(false);
    expect(classifyFormatRisk(ctx({ refChainDepth: 2 })).requiresRefChainStress).toBe(true);
  });

  it('requiresCombinatorStress is true when under combinator with depth > 0', () => {
    expect(classifyFormatRisk(ctx()).requiresCombinatorStress).toBe(false);
    expect(classifyFormatRisk(ctx({
      underCombinator: true,
      combinatorDepth: 1,
    })).requiresCombinatorStress).toBe(true);
  });
});

describe('classifyAllFormatRisks', () => {
  it('returns empty array for empty input', () => {
    expect(classifyAllFormatRisks([])).toEqual([]);
  });

  it('classifies multiple contexts', () => {
    const contexts = [
      ctx({ pointer: '#/b', format: 'uri' }),
      ctx({ pointer: '#/a', format: 'email' }),
    ];
    const result = classifyAllFormatRisks(contexts);
    expect(result).toHaveLength(2);
    expect(result[0].pointer).toBe('#/a');
    expect(result[1].pointer).toBe('#/b');
  });

  it('passes custom weights to each classification', () => {
    const customWeights: FormatRiskWeightConfig = {
      ...DEFAULT_RISK_WEIGHTS,
      recursiveCycle: 99,
    };
    const contexts = [ctx({ insideRecursiveCycle: true })];
    const result = classifyAllFormatRisks(contexts, customWeights);
    expect(result[0].riskScore).toBe(99);
  });
});

describe('format-risk constants', () => {
  it('HIGH_RISK_THRESHOLD is 40', () => {
    expect(HIGH_RISK_THRESHOLD).toBe(40);
  });

  it('DEFAULT_RISK_WEIGHTS has expected structure', () => {
    expect(DEFAULT_RISK_WEIGHTS.recursiveCycle).toBe(20);
    expect(DEFAULT_RISK_WEIGHTS.refChainDeep).toBe(15);
    expect(DEFAULT_RISK_WEIGHTS.combinatorDeep).toBe(15);
    expect(DEFAULT_RISK_WEIGHTS.underConditional).toBe(10);
    expect(DEFAULT_RISK_WEIGHTS.underDynamicRef).toBe(25);
    expect(DEFAULT_RISK_WEIGHTS.underUnevaluatedProperties).toBe(20);
    expect(DEFAULT_RISK_WEIGHTS.underPatternProperties).toBe(5);
    expect(DEFAULT_RISK_WEIGHTS.unionType).toBe(5);
    expect(DEFAULT_RISK_WEIGHTS.requiredProperty).toBe(3);
    expect(DEFAULT_RISK_WEIGHTS.depthPenalty).toBe(1);
    expect(DEFAULT_RISK_WEIGHTS.refChainThreshold).toBe(3);
    expect(DEFAULT_RISK_WEIGHTS.combinatorThreshold).toBe(3);
  });
});

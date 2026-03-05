import { describe, it, expect } from 'vitest';
import {
  analyzeFormatInteractions,
} from './analyzeFormatInteractions';
import {
  DEFAULT_INTERACTION_RISK_WEIGHTS,
  INTERACTION_TYPES,
} from './types';
import type { FormatContext, InteractionRiskWeights } from './types';

function ctx(overrides: Partial<FormatContext> = {}): FormatContext {
  return {
    pointer: '#/properties/email',
    format: 'email',
    depth: 1,
    refDepth: 0,
    combinatorDepth: 0,
    combinatorTypes: [],
    conditionalContext: false,
    recursiveContext: false,
    dynamicContext: false,
    unionType: false,
    required: false,
    patternPropertyContext: false,
    ...overrides,
  };
}

describe('analyzeFormatInteractions', () => {
  it('returns empty array for empty contexts', () => {
    expect(analyzeFormatInteractions([])).toEqual([]);
  });

  it('detects combinator-branching interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ combinatorDepth: 1, combinatorTypes: ['oneOf'] }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.COMBINATOR_BRANCHING);
  });

  it('detects conditional-gating interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ conditionalContext: true }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.CONDITIONAL_GATING);
  });

  it('detects recursive-ref interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ recursiveContext: true }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.RECURSIVE_REF);
  });

  it('detects multi-ref-chain interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ refDepth: 2 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.MULTI_REF_CHAIN);
  });

  it('does not detect multi-ref-chain for refDepth 0', () => {
    const result = analyzeFormatInteractions([
      ctx({ refDepth: 0 }),
    ]);
    expect(result[0].interactionTypes).not.toContain(INTERACTION_TYPES.MULTI_REF_CHAIN);
  });

  it('detects union-type interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ unionType: true }),
    ]);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.UNION_TYPE);
  });

  it('detects required-property interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ required: true }),
    ]);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.REQUIRED_PROPERTY);
  });

  it('detects pattern-overlap interaction', () => {
    const result = analyzeFormatInteractions([
      ctx({ patternPropertyContext: true }),
    ]);
    expect(result[0].interactionTypes).toContain(INTERACTION_TYPES.PATTERN_OVERLAP);
  });

  it('detects multiple interaction types simultaneously', () => {
    const result = analyzeFormatInteractions([
      ctx({
        combinatorDepth: 2,
        combinatorTypes: ['oneOf', 'allOf'],
        conditionalContext: true,
        recursiveContext: true,
      }),
    ]);
    const types = result[0].interactionTypes;
    expect(types).toContain(INTERACTION_TYPES.COMBINATOR_BRANCHING);
    expect(types).toContain(INTERACTION_TYPES.CONDITIONAL_GATING);
    expect(types).toContain(INTERACTION_TYPES.RECURSIVE_REF);
  });

  it('computes risk from combinator branching weight', () => {
    const result = analyzeFormatInteractions([
      ctx({ combinatorDepth: 1, combinatorTypes: ['oneOf'] }),
    ]);
    // Expected: combinatorBranchingWeight * branches + depthWeight * depth
    // Default: 3 * 2 (oneOf=2 branches) + 0.5 * 1 = 6.5
    expect(result[0].structuralRisk).toBeGreaterThan(0);
  });

  it('computes risk from conditional gating weight', () => {
    const result = analyzeFormatInteractions([
      ctx({ conditionalContext: true }),
    ]);
    // conditionalGatingWeight = 4
    expect(result[0].structuralRisk).toBeGreaterThanOrEqual(4);
  });

  it('computes risk from recursive ref weight', () => {
    const result = analyzeFormatInteractions([
      ctx({ recursiveContext: true }),
    ]);
    // recursiveRefWeight = 5
    expect(result[0].structuralRisk).toBeGreaterThanOrEqual(5);
  });

  it('computes cumulative risk for all interactions', () => {
    const result = analyzeFormatInteractions([
      ctx({
        combinatorDepth: 2,
        combinatorTypes: ['oneOf', 'anyOf'],
        conditionalContext: true,
        recursiveContext: true,
        refDepth: 3,
        unionType: true,
        required: true,
        patternPropertyContext: true,
      }),
    ]);
    // With all interactions active, risk should be high
    expect(result[0].structuralRisk).toBeGreaterThan(20);
  });

  it('caps risk at 100', () => {
    // Use extreme weights to force over 100
    const bigWeights: InteractionRiskWeights = {
      combinatorBranchingWeight: 100,
      conditionalGatingWeight: 100,
      recursiveRefWeight: 100,
      multiRefChainWeight: 100,
      unionTypeWeight: 100,
      requiredPropertyWeight: 100,
      patternOverlapWeight: 100,
      depthWeight: 100,
    };
    const result = analyzeFormatInteractions(
      [ctx({
        combinatorDepth: 5,
        combinatorTypes: ['oneOf', 'anyOf'],
        conditionalContext: true,
        recursiveContext: true,
        refDepth: 10,
        unionType: true,
        required: true,
        patternPropertyContext: true,
        depth: 10,
      })],
      bigWeights,
    );
    expect(result[0].structuralRisk).toBeLessThanOrEqual(100);
  });

  it('accepts custom weights', () => {
    const custom: InteractionRiskWeights = {
      ...DEFAULT_INTERACTION_RISK_WEIGHTS,
      combinatorBranchingWeight: 10, // default is 3
    };
    const defaultResult = analyzeFormatInteractions([
      ctx({ combinatorDepth: 1, combinatorTypes: ['oneOf'] }),
    ]);
    const customResult = analyzeFormatInteractions([
      ctx({ combinatorDepth: 1, combinatorTypes: ['oneOf'] }),
    ], custom);
    // custom should produce higher risk
    expect(customResult[0].structuralRisk).toBeGreaterThan(defaultResult[0].structuralRisk);
  });

  it('counts requiredBranches from combinator types', () => {
    const result = analyzeFormatInteractions([
      ctx({ combinatorDepth: 2, combinatorTypes: ['oneOf', 'anyOf'] }),
    ]);
    // oneOf → 2 branches, anyOf → 2 branches = 4
    expect(result[0].requiredBranches).toBe(4);
  });

  it('counts requiredBranches for allOf and not', () => {
    const result = analyzeFormatInteractions([
      ctx({ combinatorDepth: 2, combinatorTypes: ['allOf', 'not'] }),
    ]);
    // allOf → 1, not → 1 = 2
    expect(result[0].requiredBranches).toBe(2);
  });

  it('sets requiresDynamicScopeTests when dynamic context', () => {
    const result = analyzeFormatInteractions([
      ctx({ dynamicContext: true }),
    ]);
    expect(result[0].requiresDynamicScopeTests).toBe(true);
  });

  it('clears requiresDynamicScopeTests when no dynamic context', () => {
    const result = analyzeFormatInteractions([ctx()]);
    expect(result[0].requiresDynamicScopeTests).toBe(false);
  });

  it('sets requiresRecursionTests when recursive context', () => {
    const result = analyzeFormatInteractions([
      ctx({ recursiveContext: true }),
    ]);
    expect(result[0].requiresRecursionTests).toBe(true);
  });

  it('sets requiresConditionalTests when conditional context', () => {
    const result = analyzeFormatInteractions([
      ctx({ conditionalContext: true }),
    ]);
    expect(result[0].requiresConditionalTests).toBe(true);
  });

  it('sorts profiles by pointer', () => {
    const result = analyzeFormatInteractions([
      ctx({ pointer: '#/properties/z', format: 'email' }),
      ctx({ pointer: '#/properties/a', format: 'uri' }),
      ctx({ pointer: '#/properties/m', format: 'date' }),
    ]);
    expect(result[0].pointer).toBe('#/properties/a');
    expect(result[1].pointer).toBe('#/properties/m');
    expect(result[2].pointer).toBe('#/properties/z');
  });

  it('preserves format on profile', () => {
    const result = analyzeFormatInteractions([
      ctx({ format: 'date-time' }),
    ]);
    expect(result[0].format).toBe('date-time');
  });

  it('handles depth contribution to risk', () => {
    const shallow = analyzeFormatInteractions([ctx({ depth: 1 })]);
    const deep = analyzeFormatInteractions([ctx({ depth: 10 })]);
    // deep should have higher risk due to depthWeight
    expect(deep[0].structuralRisk).toBeGreaterThan(shallow[0].structuralRisk);
  });
});

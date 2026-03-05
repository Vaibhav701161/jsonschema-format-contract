import { describe, it, expect } from 'vitest';
import { detectFormatCoverageGaps } from './detectFormatCoverageGaps';
import type { FormatStructuralContext } from '../context/types';
import type { FormatRiskProfile } from '../risk/types';
import type { ExistingFormatTestMetadata } from './types';

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

function risk(overrides: Partial<FormatRiskProfile> = {}): FormatRiskProfile {
  return {
    pointer: '#/properties/test',
    format: 'email',
    riskScore: 0,
    riskFactors: [],
    requiresRecursionStress: false,
    requiresCombinatorStress: false,
    requiresConditionalStress: false,
    requiresDynamicScopeStress: false,
    requiresRefChainStress: false,
    requiresAnnotationStress: false,
    ...overrides,
  };
}

function noTests(): ExistingFormatTestMetadata {
  return {
    coveredCategories: new Set<string>(),
    coveredFormats: new Set<string>(),
  };
}

function withCoverage(categories: string[], formats: string[] = []): ExistingFormatTestMetadata {
  return {
    coveredCategories: new Set(categories),
    coveredFormats: new Set(formats),
  };
}

describe('detectFormatCoverageGaps', () => {
  it('returns empty report for empty contexts', () => {
    const report = detectFormatCoverageGaps([], [], noTests());
    expect(report.totalFormats).toBe(0);
    expect(report.interactionTypesDetected).toEqual([]);
    expect(report.highRiskContexts).toEqual([]);
    expect(report.missingRecursionCoverage).toBe(false);
    expect(report.missingDynamicCoverage).toBe(false);
    expect(report.missingConditionalCoverage).toBe(false);
    expect(report.missingCombinatorCoverage).toBe(false);
    expect(report.missingAnnotationCoverage).toBe(false);
    expect(report.suggestedStressScenarios).toEqual([]);
  });

  it('detects recursion category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ insideRecursiveCycle: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('recursion');
    expect(report.missingRecursionCoverage).toBe(true);
  });

  it('detects dynamic-ref category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underDynamicRef: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('dynamic-ref');
    expect(report.missingDynamicCoverage).toBe(true);
  });

  it('detects conditional category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underConditional: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('conditional');
    expect(report.missingConditionalCoverage).toBe(true);
  });

  it('detects combinator category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underCombinator: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('combinator');
    expect(report.missingCombinatorCoverage).toBe(true);
  });

  it('detects annotation category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underUnevaluatedProperties: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('annotation');
    expect(report.missingAnnotationCoverage).toBe(true);
  });

  it('detects ref-chain category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ refChainDepth: 3 })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('ref-chain');
  });

  it('detects union-type category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underUnionType: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('union-type');
  });

  it('detects pattern-properties category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underPatternProperties: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('pattern-properties');
  });

  it('detects required-property category', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ requiredProperty: true })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('required-property');
  });

  it('recursion covered = no missing flag', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ insideRecursiveCycle: true })],
      [risk()],
      withCoverage(['recursion']),
    );
    expect(report.missingRecursionCoverage).toBe(false);
  });

  it('combinator covered = no missing flag', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underCombinator: true })],
      [risk()],
      withCoverage(['combinator']),
    );
    expect(report.missingCombinatorCoverage).toBe(false);
  });

  it('dynamic-ref covered = no missing flag', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underDynamicRef: true })],
      [risk()],
      withCoverage(['dynamic-ref']),
    );
    expect(report.missingDynamicCoverage).toBe(false);
  });

  it('conditional covered = no missing flag', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underConditional: true })],
      [risk()],
      withCoverage(['conditional']),
    );
    expect(report.missingConditionalCoverage).toBe(false);
  });

  it('annotation covered = no missing flag', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underUnevaluatedProperties: true })],
      [risk()],
      withCoverage(['annotation']),
    );
    expect(report.missingAnnotationCoverage).toBe(false);
  });

  it('identifies high-risk contexts by threshold', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ pointer: '#/a' }), ctx({ pointer: '#/b' })],
      [risk({ pointer: '#/a', riskScore: 50 }), risk({ pointer: '#/b', riskScore: 10 })],
      noTests(),
    );
    expect(report.highRiskContexts).toEqual(['#/a']);
  });

  it('high-risk contexts are sorted', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ pointer: '#/z' }), ctx({ pointer: '#/a' })],
      [risk({ pointer: '#/z', riskScore: 50 }), risk({ pointer: '#/a', riskScore: 60 })],
      noTests(),
    );
    expect(report.highRiskContexts).toEqual(['#/a', '#/z']);
  });

  it('no high-risk when all scores below threshold', () => {
    const report = detectFormatCoverageGaps(
      [ctx()],
      [risk({ riskScore: 30 })],
      noTests(),
    );
    expect(report.highRiskContexts).toEqual([]);
  });

  it('suggests recursion scenarios when uncovered', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ insideRecursiveCycle: true })],
      [risk()],
      noTests(),
    );
    expect(report.suggestedStressScenarios).toContain('recursive_format_deep');
    expect(report.suggestedStressScenarios).toContain('mutual_recursive_format');
  });

  it('suggests combinator scenarios when uncovered', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underCombinator: true })],
      [risk()],
      noTests(),
    );
    expect(report.suggestedStressScenarios).toContain('combinator_format_explosion');
    expect(report.suggestedStressScenarios).toContain('anyOf_branch_multiplier');
    expect(report.suggestedStressScenarios).toContain('oneOf_conflict_format');
  });

  it('suggests conditional scenarios when uncovered', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underConditional: true })],
      [risk()],
      noTests(),
    );
    expect(report.suggestedStressScenarios).toContain('conditional_format_gate');
  });

  it('suggests dynamic scenarios when uncovered', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underDynamicRef: true })],
      [risk()],
      noTests(),
    );
    expect(report.suggestedStressScenarios).toContain('dynamic_format_override');
  });

  it('suggests annotation scenarios when uncovered', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ underUnevaluatedProperties: true })],
      [risk()],
      noTests(),
    );
    expect(report.suggestedStressScenarios).toContain('format_under_unevaluatedProperties');
  });

  it('no suggestions when all covered', () => {
    const report = detectFormatCoverageGaps(
      [ctx({
        insideRecursiveCycle: true,
        underCombinator: true,
        underConditional: true,
        underDynamicRef: true,
        underUnevaluatedProperties: true,
        underUnionType: true,
        refChainDepth: 5,
      })],
      [risk()],
      withCoverage([
        'recursion', 'combinator', 'conditional', 'dynamic-ref',
        'annotation', 'union-type', 'ref-chain',
      ]),
    );
    expect(report.suggestedStressScenarios).toEqual([]);
  });

  it('suggestedStressScenarios are sorted', () => {
    const report = detectFormatCoverageGaps(
      [ctx({ insideRecursiveCycle: true, underCombinator: true })],
      [risk()],
      noTests(),
    );
    const suggestions = report.suggestedStressScenarios;
    const sorted = [...suggestions].sort();
    expect(suggestions).toEqual(sorted);
  });

  it('totalFormats matches input count', () => {
    const contexts = [ctx({ pointer: '#/a' }), ctx({ pointer: '#/b' }), ctx({ pointer: '#/c' })];
    const report = detectFormatCoverageGaps(contexts, [], noTests());
    expect(report.totalFormats).toBe(3);
  });

  it('detects multiple categories simultaneously', () => {
    const report = detectFormatCoverageGaps(
      [ctx({
        insideRecursiveCycle: true,
        underCombinator: true,
        underConditional: true,
      })],
      [risk()],
      noTests(),
    );
    expect(report.interactionTypesDetected).toContain('recursion');
    expect(report.interactionTypesDetected).toContain('combinator');
    expect(report.interactionTypesDetected).toContain('conditional');
  });

  it('interaction types are sorted', () => {
    const report = detectFormatCoverageGaps(
      [ctx({
        underCombinator: true,
        insideRecursiveCycle: true,
        underDynamicRef: true,
      })],
      [risk()],
      noTests(),
    );
    const types = report.interactionTypesDetected;
    const sorted = [...types].sort();
    expect(types).toEqual(sorted);
  });
});

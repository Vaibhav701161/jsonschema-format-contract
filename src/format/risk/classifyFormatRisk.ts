import type { FormatStructuralContext } from '../context/types';
import type { FormatRiskProfile, FormatRiskWeightConfig } from './types';
import { DEFAULT_RISK_WEIGHTS } from './types';

/**
 * Classify a format structural context into a risk profile.
 * Returns a deterministic FormatRiskProfile with bounded score.
 */
export function classifyFormatRisk(
  context: FormatStructuralContext,
  weights: FormatRiskWeightConfig = DEFAULT_RISK_WEIGHTS,
): FormatRiskProfile {
  let score = 0;
  const factors: string[] = [];

  if (context.insideRecursiveCycle) {
    score += weights.recursiveCycle;
    factors.push('recursive-cycle');
  }

  if (context.refChainDepth > weights.refChainThreshold) {
    score += weights.refChainDeep;
    factors.push(`ref-chain-depth-${context.refChainDepth}`);
  }

  if (context.combinatorDepth > weights.combinatorThreshold) {
    score += weights.combinatorDeep;
    factors.push(`combinator-depth-${context.combinatorDepth}`);
  }

  if (context.underConditional) {
    score += weights.underConditional;
    factors.push('under-conditional');
  }

  if (context.underDynamicRef) {
    score += weights.underDynamicRef;
    factors.push('under-dynamic-ref');
  }

  if (context.underUnevaluatedProperties) {
    score += weights.underUnevaluatedProperties;
    factors.push('under-unevaluated-properties');
  }

  if (context.underPatternProperties) {
    score += weights.underPatternProperties;
    factors.push('under-pattern-properties');
  }

  if (context.underUnionType) {
    score += weights.unionType;
    factors.push('union-type');
  }

  if (context.requiredProperty) {
    score += weights.requiredProperty;
    factors.push('required-property');
  }

  if (context.maxAncestorDepth > 5) {
    const depthPenalty = Math.min(10, (context.maxAncestorDepth - 5) * weights.depthPenalty);
    score += depthPenalty;
    factors.push(`depth-penalty-${context.maxAncestorDepth}`);
  }

  // Bound score
  score = Math.min(100, Math.max(0, Math.round(score * 100) / 100));

  // Sort factors deterministically
  factors.sort();

  return {
    pointer: context.pointer,
    format: context.format,
    riskScore: score,
    riskFactors: factors,
    requiresRecursionStress: context.insideRecursiveCycle,
    requiresCombinatorStress: context.underCombinator && context.combinatorDepth > 0,
    requiresConditionalStress: context.underConditional,
    requiresDynamicScopeStress: context.underDynamicRef,
    requiresRefChainStress: context.refChainDepth > 1,
    requiresAnnotationStress: context.underUnevaluatedProperties,
  };
}

/**
 * Classify multiple contexts. Returns sorted by pointer.
 */
export function classifyAllFormatRisks(
  contexts: FormatStructuralContext[],
  weights?: FormatRiskWeightConfig,
): FormatRiskProfile[] {
  const results: FormatRiskProfile[] = [];
  for (let i = 0; i < contexts.length; i++) {
    results.push(classifyFormatRisk(contexts[i], weights));
  }
  results.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));
  return results;
}

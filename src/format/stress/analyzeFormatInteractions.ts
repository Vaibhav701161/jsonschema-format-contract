import type { FormatContext, FormatInteractionProfile, InteractionRiskWeights } from './types';
import {
  INTERACTION_TYPES,
  DEFAULT_INTERACTION_RISK_WEIGHTS,
} from './types';

/**
 * Analyze format interactions from extracted contexts.
 * Returns sorted, deterministic profiles.
 */
export function analyzeFormatInteractions(
  contexts: FormatContext[],
  weights: InteractionRiskWeights = DEFAULT_INTERACTION_RISK_WEIGHTS,
): FormatInteractionProfile[] {
  const result: FormatInteractionProfile[] = [];

  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i];
    const profile = buildProfile(ctx, weights);
    result.push(profile);
  }

  // Sort by pointer for deterministic output
  result.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));

  return result;
}

function buildProfile(
  ctx: FormatContext,
  weights: InteractionRiskWeights,
): FormatInteractionProfile {
  const interactionTypes: string[] = [];
  let riskScore = 0;
  let requiredBranches = 0;

  // 1. Combinator branching
  if (ctx.combinatorTypes.length > 0) {
    interactionTypes.push(INTERACTION_TYPES.COMBINATOR_BRANCHING);
    riskScore += ctx.combinatorDepth * weights.combinatorBranchingWeight;
    requiredBranches += countCombinatorBranches(ctx.combinatorTypes);
  }

  // 2. Conditional gating
  if (ctx.conditionalContext) {
    interactionTypes.push(INTERACTION_TYPES.CONDITIONAL_GATING);
    riskScore += weights.conditionalGatingWeight;
    requiredBranches += 2; // true path + false path
  }

  // 3. Recursive ref
  if (ctx.recursiveContext) {
    interactionTypes.push(INTERACTION_TYPES.RECURSIVE_REF);
    riskScore += weights.recursiveRefWeight;
  }

  // 4. Multi-ref chain
  if (ctx.refDepth > 1) {
    interactionTypes.push(INTERACTION_TYPES.MULTI_REF_CHAIN);
    riskScore += ctx.refDepth * weights.multiRefChainWeight;
  }

  // 5. Union type
  if (ctx.unionType) {
    interactionTypes.push(INTERACTION_TYPES.UNION_TYPE);
    riskScore += weights.unionTypeWeight;
  }

  // 6. Required property
  if (ctx.required) {
    interactionTypes.push(INTERACTION_TYPES.REQUIRED_PROPERTY);
    riskScore += weights.requiredPropertyWeight;
  }

  // 7. Pattern overlap
  if (ctx.patternPropertyContext) {
    interactionTypes.push(INTERACTION_TYPES.PATTERN_OVERLAP);
    riskScore += weights.patternOverlapWeight;
  }

  // 8. Depth contribution
  riskScore += ctx.depth * weights.depthWeight;

  // Cap at 100
  riskScore = Math.min(100, Math.round(riskScore * 100) / 100);

  return {
    pointer: ctx.pointer,
    format: ctx.format,
    interactionTypes,
    structuralRisk: riskScore,
    requiredBranches,
    requiresDynamicScopeTests: ctx.dynamicContext,
    requiresRecursionTests: ctx.recursiveContext,
    requiresConditionalTests: ctx.conditionalContext,
  };
}

/**
 * Count required test branches from combinator types.
 */
function countCombinatorBranches(types: string[]): number {
  let count = 0;
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (t === 'oneOf' || t === 'anyOf') count += 2;
    else if (t === 'allOf') count += 1;
    else if (t === 'not') count += 1;
  }
  return count;
}

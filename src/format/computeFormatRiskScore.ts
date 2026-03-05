import type { FormatConstraint, FormatRisk } from './contractTypes';

export interface ContractRiskWeights {
  recursiveCycle: number;
  refChainDeep: number;
  combinatorDeep: number;
  underConditional: number;
  underDynamicRef: number;
  underUnevaluatedProperties: number;
  underPatternProperties: number;
  unionType: number;
  requiredProperty: number;
  depthPenalty: number;
  refChainThreshold: number;
  combinatorThreshold: number;
}

export const DEFAULT_CONTRACT_RISK_WEIGHTS: ContractRiskWeights = {
  recursiveCycle: 20,
  refChainDeep: 15,
  combinatorDeep: 15,
  underConditional: 10,
  underDynamicRef: 25,
  underUnevaluatedProperties: 20,
  underPatternProperties: 5,
  unionType: 5,
  requiredProperty: 3,
  depthPenalty: 1,
  refChainThreshold: 3,
  combinatorThreshold: 3,
};

export const RISK_THRESHOLDS = {
  LOW_MAX: 24,
  MEDIUM_MAX: 49,
} as const;

/**
 * Score a single format constraint for contract risk.
 * Returns a FormatRisk with deterministic, explainable score.
 */
export function scoreFormatRisk(
  constraint: FormatConstraint,
  weights: ContractRiskWeights = DEFAULT_CONTRACT_RISK_WEIGHTS,
): FormatRisk {
  let score = 0;
  const factors: string[] = [];

  if (constraint.insideRecursiveCycle) {
    score += weights.recursiveCycle;
    factors.push('recursive-cycle');
  }

  if (constraint.refChainDepth > weights.refChainThreshold) {
    score += weights.refChainDeep;
    factors.push(`ref-chain-depth-${constraint.refChainDepth}`);
  }

  if (constraint.combinatorDepth > weights.combinatorThreshold) {
    score += weights.combinatorDeep;
    factors.push(`combinator-depth-${constraint.combinatorDepth}`);
  }

  if (constraint.underConditional) {
    score += weights.underConditional;
    factors.push('under-conditional');
  }

  if (constraint.underDynamicRef) {
    score += weights.underDynamicRef;
    factors.push('under-dynamic-ref');
  }

  if (constraint.underUnevaluatedProperties) {
    score += weights.underUnevaluatedProperties;
    factors.push('under-unevaluated-properties');
  }

  if (constraint.underPatternProperties) {
    score += weights.underPatternProperties;
    factors.push('under-pattern-properties');
  }

  if (constraint.underUnionType) {
    score += weights.unionType;
    factors.push('union-type');
  }

  if (constraint.requiredProperty) {
    score += weights.requiredProperty;
    factors.push('required-property');
  }

  if (constraint.depth > 5) {
    const penalty = Math.min(10, (constraint.depth - 5) * weights.depthPenalty);
    score += penalty;
    factors.push(`depth-penalty-${constraint.depth}`);
  }

  // Bound
  score = Math.min(100, Math.max(0, Math.round(score * 100) / 100));

  // Classify
  const riskLevel: 'low' | 'medium' | 'high' =
    score > RISK_THRESHOLDS.MEDIUM_MAX ? 'high' :
    score > RISK_THRESHOLDS.LOW_MAX ? 'medium' : 'low';

  // Estimate test obligation
  const testObligation = estimateObligation(constraint, score);

  // Sort factors
  factors.sort();

  return {
    pointer: constraint.pointer,
    format: constraint.format,
    riskLevel,
    riskScore: score,
    riskFactors: factors,
    testObligationEstimate: testObligation,
  };
}

/**
 * Score all constraints. Returns sorted by pointer.
 */
export function scoreAllFormatRisks(
  constraints: FormatConstraint[],
  weights?: ContractRiskWeights,
): FormatRisk[] {
  const results: FormatRisk[] = [];
  for (let i = 0; i < constraints.length; i++) {
    results.push(scoreFormatRisk(constraints[i], weights));
  }
  results.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));
  return results;
}

function estimateObligation(
  constraint: FormatConstraint,
  riskScore: number,
): number {
  const base = 5;
  let multiplier = 1;

  // Combinator branches multiply
  if (constraint.combinatorDepth > 0) {
    multiplier *= Math.max(1, constraint.combinatorDepth);
  }

  // Union types multiply
  if (constraint.unionTypes && constraint.unionTypes.length > 1) {
    multiplier *= constraint.unionTypes.length;
  }

  // Conditional doubles
  if (constraint.underConditional) {
    multiplier *= 2;
  }

  // Risk adds linear test cases
  const riskExtra = riskScore > 25 ? Math.ceil(riskScore / 10) : 0;

  return Math.min(100000, base * multiplier + riskExtra);
}

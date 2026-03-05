export interface FormatRiskProfile {
  /** JSON Pointer */
  pointer: string;
  /** Format value */
  format: string;

  /** Numeric risk score (0–100, bounded) */
  riskScore: number;
  /** Human-readable labels for each risk factor */
  riskFactors: string[];

  /** Whether recursion stress testing is needed */
  requiresRecursionStress: boolean;
  /** Whether combinator stress testing is needed */
  requiresCombinatorStress: boolean;
  /** Whether conditional stress testing is needed */
  requiresConditionalStress: boolean;
  /** Whether dynamic scope stress testing is needed */
  requiresDynamicScopeStress: boolean;
  /** Whether ref chain stress testing is needed */
  requiresRefChainStress: boolean;
  /** Whether annotation stress testing is needed */
  requiresAnnotationStress: boolean;
}

export interface FormatRiskWeightConfig {
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
  /** Ref chain depth threshold for penalty */
  refChainThreshold: number;
  /** Combinator depth threshold for penalty */
  combinatorThreshold: number;
}

export const DEFAULT_RISK_WEIGHTS: FormatRiskWeightConfig = {
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

export const HIGH_RISK_THRESHOLD = 40;

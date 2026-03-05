export type ChangeCategory = 'breaking' | 'risk';

export type BreakingRuleId =
  | 'required-property-removed'
  | 'required-property-added'
  | 'type-narrowed'
  | 'enum-value-removed'
  | 'definition-removed-referenced'
  | 'ref-target-removed'
  | 'oneOf-branch-removed'
  | 'anyOf-branch-reduced'
  | 'cycle-introduced'
  | 'ref-chain-depth-increased';

export type RiskRuleId =
  | 'depth-increased'
  | 'branch-multiplier-increased'
  | 'ref-fan-out-increased'
  | 'combinator-nesting-increased'
  | 'pattern-overlap-introduced';

export interface DiffChange {
  category: ChangeCategory;
  ruleId: BreakingRuleId | RiskRuleId;
  pointer: string;
  message: string;
  oldValue?: string;
  newValue?: string;
}

export interface FormatNode {
  /** JSON Pointer to the node containing `format` */
  pointer: string;
  /** The format value (e.g. "email", "uri", "date-time") */
  format: string;
  /** JSON Schema type(s) at this node */
  type?: string | string[];
  /** Nesting depth from root */
  depth: number;
  /** Ref chain depth (how deep through $ref chains) */
  refDepth: number;
  /** List of ancestor combinator keywords affecting this node */
  combinatorContext: string[];
  /** Whether this property is in its parent's `required` list */
  required: boolean;
}

export interface FormatSurfaceReport {
  /** The format value */
  format: string;
  /** JSON Pointer */
  pointer: string;
  /** Count of combinator branching affecting this node */
  branchDepth: number;
  /** Ref chain depth */
  refDepth: number;
  /** Max combinator nesting depth above this node */
  combinatorDepth: number;
  /** Number of incoming ref edges to the parent definition */
  fanOut: number;
  /** Weighted risk score (0–100) */
  riskScore: number;
}

export interface FormatRiskWeights {
  branchDepthWeight: number;
  refDepthWeight: number;
  combinatorDepthWeight: number;
  fanOutWeight: number;
}

export const DEFAULT_FORMAT_RISK_WEIGHTS: FormatRiskWeights = {
  branchDepthWeight: 2,
  refDepthWeight: 3,
  combinatorDepthWeight: 2,
  fanOutWeight: 1,
};

export interface FormatTestMatrix {
  /** The format value */
  format: string;
  /** JSON Pointer */
  pointer: string;
  /** List of required test case labels */
  requiredTests: string[];
  /** Estimated total test count */
  estimatedTestCount: number;
  /** Complexity multiplier applied */
  complexityMultiplier: number;
}

export interface FormatChange {
  /** JSON Pointer of the changed node */
  pointer: string;
  /** Old format value */
  oldFormat: string;
  /** New format value */
  newFormat: string;
}

export interface FormatEvolutionResult {
  /** Format nodes present in new but not old */
  addedFormats: FormatNode[];
  /** Format nodes present in old but not new */
  removedFormats: FormatNode[];
  /** Format nodes where the format value changed */
  modifiedFormats: FormatChange[];
  /** Breaking changes detected */
  breakingChanges: DiffChange[];
  /** Risk changes detected */
  riskChanges: DiffChange[];
}

export interface FormatRiskSummary {
  /** Total number of format nodes in the schema */
  totalFormats: number;
  /** Number of format nodes with riskScore > threshold */
  highRiskFormats: number;
  /** Average risk score across all format nodes */
  averageRiskScore: number;
  /** Maximum risk score across all format nodes */
  maxRiskScore: number;
}

/** Default threshold for high-risk classification */
export const DEFAULT_HIGH_RISK_THRESHOLD = 50;

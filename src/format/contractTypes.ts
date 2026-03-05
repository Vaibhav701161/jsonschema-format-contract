/**
 * Complete structural classification of a single format occurrence.
 * Used by `analyzeFormatConstraints()` to produce a full picture
 * of where a format keyword sits in the schema structure and why
 * it matters for contract testing.
 */
export interface FormatConstraint {
  /** JSON Pointer to the node containing `format` */
  pointer: string;
  /** The format value (e.g. "email", "uri", "date-time") */
  format: string;
  /** Nesting depth from root */
  depth: number;

  /** Whether reachable via at least one $ref */
  underRef: boolean;
  /** Number of $ref hops from root */
  refChainDepth: number;
  /** Whether a $dynamicRef or $recursiveRef is in scope */
  underDynamicRef: boolean;
  /** Whether this node participates in a ref cycle */
  insideRecursiveCycle: boolean;

  /** Whether any ancestor is a combinator (allOf/anyOf/oneOf/not) */
  underCombinator: boolean;
  /** List of combinator types in ancestor chain */
  combinatorTypes: string[];
  /** Max nesting depth of combinators above this node */
  combinatorDepth: number;

  /** Whether under any if/then/else context */
  underConditional: boolean;
  /** Whether specifically under an if branch */
  underIf: boolean;
  /** Whether specifically under a then branch */
  underThen: boolean;
  /** Whether specifically under an else branch */
  underElse: boolean;

  /** Whether the node has a union type (type is array) */
  underUnionType: boolean;
  /** The union types if type is an array */
  unionTypes?: string[];

  /** Whether under patternProperties */
  underPatternProperties: boolean;
  /** Whether under unevaluatedProperties */
  underUnevaluatedProperties: boolean;
  /** Whether this property appears in parent's required list */
  requiredProperty: boolean;

  /** Whether sibling minLength constraint exists */
  hasMinLength: boolean;
  /** Whether sibling maxLength constraint exists */
  hasMaxLength: boolean;
  /** Whether sibling pattern constraint exists */
  hasPattern: boolean;

  /** Maximum ancestor depth from root */
  maxAncestorDepth: number;
}

/**
 * Risk classification for a single format occurrence.
 * Deterministic. Explainable.
 */
export interface FormatRisk {
  /** JSON Pointer */
  pointer: string;
  /** Format value */
  format: string;
  /** Risk level classification */
  riskLevel: 'low' | 'medium' | 'high';
  /** Numeric risk score (0–100, bounded) */
  riskScore: number;
  /** Human-readable labels for each contributing risk factor */
  riskFactors: string[];
  /** Test obligation estimate for this format occurrence */
  testObligationEstimate: number;
}

/**
 * Per-format-value summary for maintainer-facing output.
 * Answers: "What does this format mean for my test suite?"
 */
export interface FormatContractSummary {
  /** The format value (e.g. "email", "uri") */
  formatName: string;
  /** Number of occurrences in the schema */
  occurrenceCount: number;
  /** Highest risk level across all occurrences */
  riskLevel: 'low' | 'medium' | 'high';
  /** Strictness profile - are additional constraints co-located? */
  strictnessProfile: {
    hasMinLength?: boolean;
    hasMaxLength?: boolean;
    hasPattern?: boolean;
  };
  /** Estimated total test cases required across all occurrences */
  testObligationEstimate: number;
}

/**
 * A single change to a format contract between schema versions.
 */
export interface FormatContractChange {
  /** Change classification */
  category: 'breaking' | 'risk';
  /** Specific rule ID */
  ruleId: FormatChangeRuleId;
  /** JSON Pointer of the affected node */
  pointer: string;
  /** Human-readable description */
  message: string;
  /** Value in old schema */
  oldValue?: string;
  /** Value in new schema */
  newValue?: string;
}

export type FormatChangeRuleId =
  | 'format-removed'
  | 'format-added'
  | 'format-changed'
  | 'format-type-narrowed'
  | 'constraint-tightened'
  | 'constraint-loosened'
  | 'combinator-context-changed';

/**
 * Full diff result comparing format contracts between two schema versions.
 */
export interface FormatContractDiff {
  /** Formats added in the new schema */
  addedFormats: Array<{ pointer: string; format: string }>;
  /** Formats removed from the old schema */
  removedFormats: Array<{ pointer: string; format: string }>;
  /** Formats whose value changed */
  modifiedFormats: Array<{ pointer: string; oldFormat: string; newFormat: string }>;
  /** Breaking contract changes */
  breakingChanges: FormatContractChange[];
  /** Risk-level changes */
  riskChanges: FormatContractChange[];
}

/**
 * A generated adversarial schema for testing a format interaction.
 */
export interface FormatStressCase {
  /** Descriptive name */
  name: string;
  /** The generated JSON Schema object */
  schema: Record<string, unknown>;
  /** What this stress case tests */
  description: string;
  /** Expected failure modes for test writers */
  expectedFailureModes: string[];
}

/**
 * Gap analysis: what format interactions are NOT covered by existing tests?
 */
export interface FormatCoverageReport {
  /** Total format occurrences */
  totalFormats: number;
  /** Interaction categories detected */
  interactionTypesDetected: string[];
  /** Pointers of high-risk contexts */
  highRiskPointers: string[];
  /** Missing coverage flags */
  missingRecursionCoverage: boolean;
  missingDynamicCoverage: boolean;
  missingConditionalCoverage: boolean;
  missingCombinatorCoverage: boolean;
  missingAnnotationCoverage: boolean;
  /** Suggested stress cases to add */
  suggestedStressCases: string[];
}

/**
 * Minimal schema that reproduces a specific format context.
 * Used for bug reports and targeted testing.
 */
export interface FormatReproducer {
  /** The pointer that was targeted */
  targetPointer: string;
  /** The format value at the target */
  format: string;
  /** The minimal schema */
  schema: Record<string, unknown>;
  /** Pointers included in the minimal schema */
  includedPointers: string[];
}

/**
 * What format tests already exist?
 * Used by coverage gap detection.
 */
export interface ExistingTestCoverage {
  /** Interaction categories already covered by tests */
  coveredCategories: Set<string>;
  /** Format values already tested */
  coveredFormats: Set<string>;
}

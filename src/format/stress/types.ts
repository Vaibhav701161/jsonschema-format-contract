import type { DiffChange } from '../types';

/**
 * Enriched structural context for a single format occurrence.
 * Extends beyond FormatNode with conditional, recursive, and dynamic flags.
 */
export interface FormatContext {
  /** JSON Pointer to the node containing `format` */
  pointer: string;
  /** The format value (e.g. "email", "uri", "date-time") */
  format: string;
  /** Nesting depth from root */
  depth: number;
  /** Ref chain depth (hops through $ref) */
  refDepth: number;
  /** Max combinator nesting depth above this node */
  combinatorDepth: number;
  /** List of combinator types affecting this node (e.g. ["oneOf", "if"]) */
  combinatorTypes: string[];
  /** Whether inside if/then/else context */
  conditionalContext: boolean;
  /** Whether reachable via a ref cycle */
  recursiveContext: boolean;
  /** Whether the schema uses unsupported dynamic references ($dynamicRef) */
  dynamicContext: boolean;
  /** Whether the node has a union type (type is an array) */
  unionType: boolean;
  /** Whether this property is in its parent's `required` list */
  required: boolean;
  /** Whether the node has or is under patternProperties */
  patternPropertyContext: boolean;
}

/**
 * Interaction analysis result for a single format occurrence.
 * Classifies structural interactions and computes risk.
 */
export interface FormatInteractionProfile {
  /** JSON Pointer */
  pointer: string;
  /** Format value */
  format: string;
  /** List of interaction type labels */
  interactionTypes: string[];
  /** Weighted structural risk score (0–100) */
  structuralRisk: number;
  /** Number of required combinator branches */
  requiredBranches: number;
  /** Whether dynamic scope tests are required */
  requiresDynamicScopeTests: boolean;
  /** Whether recursion tests are required */
  requiresRecursionTests: boolean;
  /** Whether conditional tests are required */
  requiresConditionalTests: boolean;
}

/**
 * Configurable risk weight factors for interaction scoring.
 */
export interface InteractionRiskWeights {
  combinatorBranchingWeight: number;
  conditionalGatingWeight: number;
  recursiveRefWeight: number;
  multiRefChainWeight: number;
  unionTypeWeight: number;
  requiredPropertyWeight: number;
  patternOverlapWeight: number;
  depthWeight: number;
}

export const DEFAULT_INTERACTION_RISK_WEIGHTS: InteractionRiskWeights = {
  combinatorBranchingWeight: 3,
  conditionalGatingWeight: 4,
  recursiveRefWeight: 5,
  multiRefChainWeight: 3,
  unionTypeWeight: 2,
  requiredPropertyWeight: 1,
  patternOverlapWeight: 2,
  depthWeight: 0.5,
};

export const INTERACTION_TYPES = {
  COMBINATOR_BRANCHING: 'combinator-branching',
  CONDITIONAL_GATING: 'conditional-gating',
  RECURSIVE_REF: 'recursive-ref',
  MULTI_REF_CHAIN: 'multi-ref-chain',
  UNION_TYPE: 'union-type',
  REQUIRED_PROPERTY: 'required-property',
  PATTERN_OVERLAP: 'pattern-overlap',
} as const;

export type InteractionType = (typeof INTERACTION_TYPES)[keyof typeof INTERACTION_TYPES];

/**
 * A generated minimal adversarial schema for testing a format interaction.
 */
export interface StressSchema {
  /** Descriptive name for the stress test */
  name: string;
  /** The generated JSON Schema object */
  schema: Record<string, unknown>;
  /** Human-readable description of what this tests */
  description: string;
  /** Estimated number of test cases this schema requires */
  expectedTestCases: number;
}

/**
 * Metadata about existing test coverage.
 */
export interface ExistingTestMetadata {
  /** Interaction type labels already covered */
  coveredInteractions: string[];
  /** Format values already tested */
  coveredFormats: string[];
}

/**
 * Report on gaps in format test coverage.
 */
export interface CoverageGapReport {
  /** Interaction types that exist in schema but are not covered */
  missingInteractionTypes: string[];
  /** Format × structural context combos not covered */
  missingFormatContexts: string[];
  /** Stress scenarios not covered */
  missingStressScenarios: string[];
  /** Total number of discovered interactions */
  totalInteractions: number;
  /** Total number of covered interactions */
  coveredCount: number;
  /** Coverage percentage (0–100) */
  coveragePercentage: number;
}

/**
 * Combined result from the format-stress command.
 */
export interface FormatStressResult {
  /** All interaction profiles discovered */
  profiles: FormatInteractionProfile[];
  /** Generated stress schemas */
  stressSchemas: StressSchema[];
  /** Risk summary across all profiles */
  riskSummary: StressRiskSummary;
}

/**
 * Aggregate risk summary for format stress analysis.
 */
export interface StressRiskSummary {
  totalProfiles: number;
  highRiskCount: number;
  maxRisk: number;
  averageRisk: number;
  interactionBreakdown: Record<string, number>;
}

/** Default threshold for high-risk stress classification */
export const DEFAULT_STRESS_HIGH_RISK_THRESHOLD = 40;

export type { DiffChange };

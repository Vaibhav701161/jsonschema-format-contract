export interface FormatCoverageReport {
  /** Total number of format occurrences found */
  totalFormats: number;
  /** Unique interaction types detected across all contexts */
  interactionTypesDetected: string[];
  /** Pointers of high-risk contexts (score > threshold) */
  highRiskContexts: string[];

  /** Whether recursive format coverage is missing */
  missingRecursionCoverage: boolean;
  /** Whether dynamic ref format coverage is missing */
  missingDynamicCoverage: boolean;
  /** Whether conditional format coverage is missing */
  missingConditionalCoverage: boolean;
  /** Whether combinator format coverage is missing */
  missingCombinatorCoverage: boolean;
  /** Whether annotation/unevaluatedProperties format coverage is missing */
  missingAnnotationCoverage: boolean;

  /** Suggested stress scenario names to add */
  suggestedStressScenarios: string[];
}

export interface ExistingFormatTestMetadata {
  /** Interaction categories already covered by tests */
  coveredCategories: Set<string>;
  /** Format values already tested */
  coveredFormats: Set<string>;
}

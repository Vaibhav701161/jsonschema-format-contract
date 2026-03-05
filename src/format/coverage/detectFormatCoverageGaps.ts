import type { FormatStructuralContext } from '../context/types';
import type { FormatRiskProfile } from '../risk/types';
import { HIGH_RISK_THRESHOLD } from '../risk/types';
import type { FormatCoverageReport, ExistingFormatTestMetadata } from './types';

const CATEGORY = {
  RECURSION: 'recursion',
  DYNAMIC_REF: 'dynamic-ref',
  CONDITIONAL: 'conditional',
  COMBINATOR: 'combinator',
  ANNOTATION: 'annotation',
  REF_CHAIN: 'ref-chain',
  UNION_TYPE: 'union-type',
  PATTERN_PROPERTIES: 'pattern-properties',
  REQUIRED_PROPERTY: 'required-property',
} as const;

export function detectFormatCoverageGaps(
  contexts: FormatStructuralContext[],
  riskProfiles: FormatRiskProfile[],
  existingTests: ExistingFormatTestMetadata,
): FormatCoverageReport {
  // Detect which interaction types are present
  const detectedCategories = detectInteractionCategories(contexts);

  // Get covered set
  const covered = existingTests.coveredCategories;

  // Build missing flags
  const missingRecursionCoverage = detectedCategories.has(CATEGORY.RECURSION) && !covered.has(CATEGORY.RECURSION);
  const missingDynamicCoverage = detectedCategories.has(CATEGORY.DYNAMIC_REF) && !covered.has(CATEGORY.DYNAMIC_REF);
  const missingConditionalCoverage = detectedCategories.has(CATEGORY.CONDITIONAL) && !covered.has(CATEGORY.CONDITIONAL);
  const missingCombinatorCoverage = detectedCategories.has(CATEGORY.COMBINATOR) && !covered.has(CATEGORY.COMBINATOR);
  const missingAnnotationCoverage = detectedCategories.has(CATEGORY.ANNOTATION) && !covered.has(CATEGORY.ANNOTATION);

  // High-risk contexts
  const highRiskContexts: string[] = [];
  for (let i = 0; i < riskProfiles.length; i++) {
    if (riskProfiles[i].riskScore > HIGH_RISK_THRESHOLD) {
      highRiskContexts.push(riskProfiles[i].pointer);
    }
  }
  highRiskContexts.sort();

  // Suggested stress scenarios
  const suggestions = buildSuggestions(
    detectedCategories,
    covered,
    contexts,
  );

  return {
    totalFormats: contexts.length,
    interactionTypesDetected: Array.from(detectedCategories).sort(),
    highRiskContexts,
    missingRecursionCoverage,
    missingDynamicCoverage,
    missingConditionalCoverage,
    missingCombinatorCoverage,
    missingAnnotationCoverage,
    suggestedStressScenarios: suggestions.sort(),
  };
}

function detectInteractionCategories(
  contexts: FormatStructuralContext[],
): Set<string> {
  const categories = new Set<string>();

  for (let i = 0; i < contexts.length; i++) {
    const c = contexts[i];
    if (c.insideRecursiveCycle) categories.add(CATEGORY.RECURSION);
    if (c.underDynamicRef) categories.add(CATEGORY.DYNAMIC_REF);
    if (c.underConditional) categories.add(CATEGORY.CONDITIONAL);
    if (c.underCombinator) categories.add(CATEGORY.COMBINATOR);
    if (c.underUnevaluatedProperties) categories.add(CATEGORY.ANNOTATION);
    if (c.refChainDepth > 1) categories.add(CATEGORY.REF_CHAIN);
    if (c.underUnionType) categories.add(CATEGORY.UNION_TYPE);
    if (c.underPatternProperties) categories.add(CATEGORY.PATTERN_PROPERTIES);
    if (c.requiredProperty) categories.add(CATEGORY.REQUIRED_PROPERTY);
  }

  return categories;
}

function buildSuggestions(
  detected: Set<string>,
  covered: Set<string>,
  contexts: FormatStructuralContext[],
): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();

  // For each detected but uncovered category, suggest named scenarios
  if (detected.has(CATEGORY.RECURSION) && !covered.has(CATEGORY.RECURSION)) {
    suggestions.push('recursive_format_deep');
    suggestions.push('mutual_recursive_format');
  }

  if (detected.has(CATEGORY.COMBINATOR) && !covered.has(CATEGORY.COMBINATOR)) {
    suggestions.push('combinator_format_explosion');
    suggestions.push('anyOf_branch_multiplier');
    suggestions.push('oneOf_conflict_format');
  }

  if (detected.has(CATEGORY.CONDITIONAL) && !covered.has(CATEGORY.CONDITIONAL)) {
    suggestions.push('conditional_format_gate');
  }

  if (detected.has(CATEGORY.DYNAMIC_REF) && !covered.has(CATEGORY.DYNAMIC_REF)) {
    suggestions.push('dynamic_format_override');
  }

  if (detected.has(CATEGORY.ANNOTATION) && !covered.has(CATEGORY.ANNOTATION)) {
    suggestions.push('format_under_unevaluatedProperties');
  }

  if (detected.has(CATEGORY.UNION_TYPE) && !covered.has(CATEGORY.UNION_TYPE)) {
    suggestions.push('format_union_type_mismatch');
  }

  if (detected.has(CATEGORY.REF_CHAIN) && !covered.has(CATEGORY.REF_CHAIN)) {
    suggestions.push('format_under_ref_indirection');
  }

  // Per-format suggestions for uncovered formats
  for (let i = 0; i < contexts.length; i++) {
    const fmt = contexts[i].format;
    const key = `format-specific:${fmt}`;
    if (!seen.has(key) && !covered.has(fmt)) {
      seen.add(key);
      // No duplicate: only if format itself is uncovered
    }
  }

  return suggestions;
}

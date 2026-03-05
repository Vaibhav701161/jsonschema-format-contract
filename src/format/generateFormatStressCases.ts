import type { FormatStressCase, FormatCoverageReport, ExistingTestCoverage } from './contractTypes';
import type { StructuralModel } from '../types';
import { generateAllStressScenarios } from './stress/stressScenarioGenerator';
import { extractFormatStructuralContexts } from './context/extractFormatStructuralContexts';
import { classifyAllFormatRisks } from './risk/classifyFormatRisk';
import { detectFormatCoverageGaps } from './coverage/detectFormatCoverageGaps';
import { HIGH_RISK_THRESHOLD } from './risk/types';

/**
 * Generate all stress cases for a given format value.
 * Returns 10 named adversarial schemas targeting:
 *   - Recursive depth
 *   - Mutual recursion
 *   - Combinator explosion
 *   - anyOf branch multiplication
 *   - oneOf conflict
 *   - Conditional gating
 *   - Dynamic ref override
 *   - Unevaluated properties
 *   - Union type mismatch
 *   - Ref chain indirection
 */
export function generateFormatStressCases(format: string): FormatStressCase[] {
  const raw = generateAllStressScenarios(format);
  return raw.map(s => ({
    name: s.name,
    schema: s.schema,
    description: s.description,
    expectedFailureModes: s.expectedFailureModes,
  }));
}

/**
 * Detect format coverage gaps in a schema.
 * Compares detected structural patterns against declared test coverage
 * and returns a gap report with suggested stress cases.
 */
export function detectFormatCoverageGapsUnified(
  model: StructuralModel,
  existingTests: ExistingTestCoverage,
): FormatCoverageReport {
  const contexts = extractFormatStructuralContexts(model);
  const riskProfiles = classifyAllFormatRisks(contexts);
  const raw = detectFormatCoverageGaps(contexts, riskProfiles, {
    coveredCategories: existingTests.coveredCategories,
    coveredFormats: existingTests.coveredFormats,
  });

  // Map to unified type
  const highRiskPointers: string[] = [];
  for (let i = 0; i < riskProfiles.length; i++) {
    if (riskProfiles[i].riskScore > HIGH_RISK_THRESHOLD) {
      highRiskPointers.push(riskProfiles[i].pointer);
    }
  }
  highRiskPointers.sort();

  return {
    totalFormats: raw.totalFormats,
    interactionTypesDetected: raw.interactionTypesDetected,
    highRiskPointers,
    missingRecursionCoverage: raw.missingRecursionCoverage,
    missingDynamicCoverage: raw.missingDynamicCoverage,
    missingConditionalCoverage: raw.missingConditionalCoverage,
    missingCombinatorCoverage: raw.missingCombinatorCoverage,
    missingAnnotationCoverage: raw.missingAnnotationCoverage,
    suggestedStressCases: raw.suggestedStressScenarios,
  };
}

/**
 * Build minimal reproducer schema for a format-bearing node.
 * Re-exports from the reproducer module for convenience.
 */
export { buildMinimalFormatReproducer } from './reproducer/buildMinimalFormatReproducer';

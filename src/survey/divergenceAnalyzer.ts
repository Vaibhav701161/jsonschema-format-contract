/**
 * Ecosystem divergence analyzer: identifies where validators
 * disagree and classifies divergences by severity, root cause,
 * and RFC interpretation differences.
 */

import type { SurveyReport } from './surveyRunner';
import { buildDivergenceMatrix, type DivergenceMatrixEntry } from './resultAggregator';
import { classifyFormat, type RequirementLevel } from '../rfc/requirementClassifier';

export type DivergenceSeverity = 'critical' | 'significant' | 'minor' | 'informational';

export type DivergenceCause =
  | 'rfc_ambiguity'
  | 'missing_feature'
  | 'incorrect_implementation'
  | 'extension_behavior'
  | 'unknown';

export interface DivergenceEntry {
  format: string;
  input: string;
  description: string;
  expected: boolean;
  adapterResults: Record<string, boolean | null>;
  severity: DivergenceSeverity;
  cause: DivergenceCause;
  rfcLevel: RequirementLevel;
  recommendation: string;
}

export interface DivergenceReport {
  totalDivergences: number;
  bySeverity: Record<DivergenceSeverity, number>;
  byCause: Record<DivergenceCause, number>;
  byFormat: Record<string, number>;
  entries: DivergenceEntry[];
  timestamp: string;
}

/**
 * Analyze divergences from a survey report.
 */
export function analyzeDivergences(report: SurveyReport): DivergenceReport {
  const matrix = buildDivergenceMatrix(report);
  const divergentEntries = matrix.filter((e) => !e.unanimous);
  const entries: DivergenceEntry[] = [];

  for (const entry of divergentEntries) {
    entries.push(classifyDivergence(entry));
  }

  // Sort by severity (critical first)
  const severityOrder: Record<DivergenceSeverity, number> = {
    critical: 0,
    significant: 1,
    minor: 2,
    informational: 3,
  };
  entries.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const bySeverity: Record<DivergenceSeverity, number> = {
    critical: 0,
    significant: 0,
    minor: 0,
    informational: 0,
  };
  const byCause: Record<DivergenceCause, number> = {
    rfc_ambiguity: 0,
    missing_feature: 0,
    incorrect_implementation: 0,
    extension_behavior: 0,
    unknown: 0,
  };
  const byFormat: Record<string, number> = {};

  for (const entry of entries) {
    bySeverity[entry.severity]++;
    byCause[entry.cause]++;
    byFormat[entry.format] = (byFormat[entry.format] ?? 0) + 1;
  }

  return {
    totalDivergences: entries.length,
    bySeverity,
    byCause,
    byFormat,
    entries,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Classify a single divergence entry.
 */
function classifyDivergence(entry: DivergenceMatrixEntry): DivergenceEntry {
  const rfcLevel = getRfcLevel(entry.format, entry.description);
  const severity = computeSeverity(entry, rfcLevel);
  const cause = guessCause(entry, rfcLevel);
  const recommendation = generateRecommendation(entry, severity, cause);

  return {
    format: entry.format,
    input: entry.input,
    description: entry.description,
    expected: entry.expected,
    adapterResults: entry.results,
    severity,
    cause,
    rfcLevel,
    recommendation,
  };
}

/**
 * Get the RFC classification level for a divergence.
 */
function getRfcLevel(format: string, _description: string): RequirementLevel {
  const classification = classifyFormat(format);
  if (!classification) return 'MUST_SYNTAX';

  // Heuristic: ambiguous rules in the classification mean this
  // divergence likely stems from RFC ambiguity
  const hasAmbiguous = classification.rules.some((r) => r.level === 'AMBIGUOUS');
  if (hasAmbiguous) return 'AMBIGUOUS';

  const hasSemantic = classification.rules.some((r) => r.level === 'SEMANTIC');
  if (hasSemantic) return 'SEMANTIC';

  return 'MUST_SYNTAX';
}

/**
 * Compute divergence severity based on RFC level and adapter agreement.
 */
function computeSeverity(
  entry: DivergenceMatrixEntry,
  rfcLevel: RequirementLevel,
): DivergenceSeverity {
  const adapterCount = Object.keys(entry.results).length;
  const nullCount = Object.values(entry.results).filter((v) => v === null).length;
  const respondingCount = adapterCount - nullCount;

  // If most adapters couldn't even run the test, it's informational
  if (respondingCount < 2) return 'informational';

  // MUST_SYNTAX divergences are critical
  if (rfcLevel === 'MUST_SYNTAX') return 'critical';

  // AMBIGUOUS divergences are significant but expected
  if (rfcLevel === 'AMBIGUOUS') return 'significant';

  // SEMANTIC divergences are minor
  if (rfcLevel === 'SEMANTIC') return 'minor';

  return 'informational';
}

/**
 * Guess the root cause of a divergence.
 */
function guessCause(
  entry: DivergenceMatrixEntry,
  rfcLevel: RequirementLevel,
): DivergenceCause {
  if (rfcLevel === 'AMBIGUOUS') return 'rfc_ambiguity';

  // If one adapter returns null (error), it's likely missing feature
  const hasNull = Object.values(entry.results).some((v) => v === null);
  if (hasNull) return 'missing_feature';

  // If the expected value disagrees with majority of adapters
  const values = Object.values(entry.results).filter((v) => v !== null) as boolean[];
  const trueCount = values.filter((v) => v).length;
  const falseCount = values.filter((v) => !v).length;
  const majorityAnswer = trueCount > falseCount;

  if (majorityAnswer !== entry.expected) return 'extension_behavior';

  return 'incorrect_implementation';
}

/**
 * Generate a human-readable recommendation for addressing a divergence.
 */
function generateRecommendation(
  entry: DivergenceMatrixEntry,
  severity: DivergenceSeverity,
  cause: DivergenceCause,
): string {
  switch (cause) {
    case 'rfc_ambiguity':
      return `Document ambiguity for "${entry.description}" — test both interpretations`;
    case 'missing_feature':
      return `Some adapters lack support for "${entry.description}" — include as optional test`;
    case 'incorrect_implementation':
      return `Likely implementation bug for "${entry.description}" — verify against RFC`;
    case 'extension_behavior':
      return `Majority deviates from RFC for "${entry.description}" — consider pragmatic acceptance`;
    default:
      return `Investigate divergence for "${entry.description}" (${severity})`;
  }
}

/**
 * Generate a divergence summary suitable for the decision framework.
 */
export function summarizeDivergences(report: DivergenceReport): string {
  const lines: string[] = [];
  lines.push(`## Ecosystem Divergence Summary`);
  lines.push('');
  lines.push(`Total divergences: ${report.totalDivergences}`);
  lines.push('');

  if (report.totalDivergences === 0) {
    lines.push('No divergences detected — all adapters agree on all test cases.');
    return lines.join('\n');
  }

  lines.push('### By Severity');
  for (const [severity, count] of Object.entries(report.bySeverity)) {
    if (count > 0) {
      lines.push(`- **${severity}**: ${count}`);
    }
  }
  lines.push('');

  lines.push('### By Root Cause');
  for (const [cause, count] of Object.entries(report.byCause)) {
    if (count > 0) {
      lines.push(`- **${cause.replace(/_/g, ' ')}**: ${count}`);
    }
  }
  lines.push('');

  lines.push('### By Format');
  for (const [format, count] of Object.entries(report.byFormat)) {
    lines.push(`- **${format}**: ${count} divergence(s)`);
  }
  lines.push('');

  // Top critical/significant entries
  const important = report.entries.filter(
    (e) => e.severity === 'critical' || e.severity === 'significant',
  );
  if (important.length > 0) {
    lines.push('### Key Divergences');
    for (const entry of important.slice(0, 10)) {
      lines.push(`- **${entry.format}** \`${entry.input}\`: ${entry.recommendation}`);
    }
  }

  return lines.join('\n');
}

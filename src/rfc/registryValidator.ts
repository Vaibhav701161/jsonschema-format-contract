/**
 * RFC validation layer: validates format registry entries for
 * completeness, ensuring every format has required metadata
 * for the methodology to work correctly.
 *
 * Rejects entries that lack:
 * - Valid RFC reference
 * - Non-empty ABNF grammar
 * - At least one valid and one invalid edge case
 * - Description and category
 */

import { FORMAT_REGISTRY, type FormatSpec } from './formatRegistry';

export type ValidationIssueType =
  | 'missing_rfc'
  | 'empty_grammar'
  | 'no_valid_cases'
  | 'no_invalid_cases'
  | 'missing_description'
  | 'missing_category'
  | 'suspect_grammar'
  | 'few_edge_cases';

export interface RegistryValidationIssue {
  format: string;
  type: ValidationIssueType;
  message: string;
  severity: 'error' | 'warning';
}

export interface RegistryValidationReport {
  totalFormats: number;
  validFormats: number;
  invalidFormats: number;
  issues: RegistryValidationIssue[];
  clean: boolean;
}

/** Minimum edge cases per format for adequate coverage */
const MIN_EDGE_CASES = 3;

/**
 * Validate all entries in the format registry.
 */
export function validateRegistry(): RegistryValidationReport {
  const formats = Object.keys(FORMAT_REGISTRY).sort();
  const issues: RegistryValidationIssue[] = [];
  const invalidFormats = new Set<string>();

  for (const format of formats) {
    const spec = FORMAT_REGISTRY[format];
    const formatIssues = validateFormatSpec(format, spec);
    issues.push(...formatIssues);

    if (formatIssues.some((i) => i.severity === 'error')) {
      invalidFormats.add(format);
    }
  }

  return {
    totalFormats: formats.length,
    validFormats: formats.length - invalidFormats.size,
    invalidFormats: invalidFormats.size,
    issues: issues.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return a.format.localeCompare(b.format);
    }),
    clean: issues.filter((i) => i.severity === 'error').length === 0,
  };
}

/**
 * Validate a single format spec.
 */
function validateFormatSpec(format: string, spec: FormatSpec): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  // RFC reference
  if (!spec.rfc || spec.rfc.trim() === '') {
    issues.push({
      format,
      type: 'missing_rfc',
      message: 'Missing RFC reference',
      severity: 'error',
    });
  }

  // Grammar
  if (!spec.grammar || spec.grammar.trim() === '') {
    issues.push({
      format,
      type: 'empty_grammar',
      message: 'Empty ABNF grammar — cannot extract production rules',
      severity: 'error',
    });
  } else if (!spec.grammar.includes('=')) {
    issues.push({
      format,
      type: 'suspect_grammar',
      message: 'Grammar does not contain any rule definitions (no "=" found)',
      severity: 'warning',
    });
  }

  // Edge cases — must have both valid and invalid
  const validCases = spec.edgeCases.filter((e) => e.valid);
  const invalidCases = spec.edgeCases.filter((e) => !e.valid);

  if (validCases.length === 0) {
    issues.push({
      format,
      type: 'no_valid_cases',
      message: 'No valid edge cases — cannot generate acceptance tests',
      severity: 'error',
    });
  }

  if (invalidCases.length === 0) {
    issues.push({
      format,
      type: 'no_invalid_cases',
      message: 'No invalid edge cases — cannot generate rejection tests',
      severity: 'error',
    });
  }

  if (spec.edgeCases.length < MIN_EDGE_CASES) {
    issues.push({
      format,
      type: 'few_edge_cases',
      message: `Only ${spec.edgeCases.length} edge cases (minimum: ${MIN_EDGE_CASES})`,
      severity: 'warning',
    });
  }

  // Description
  if (!spec.description || spec.description.trim() === '') {
    issues.push({
      format,
      type: 'missing_description',
      message: 'Missing description',
      severity: 'warning',
    });
  }

  // Category
  if (!spec.category) {
    issues.push({
      format,
      type: 'missing_category',
      message: 'Missing category',
      severity: 'warning',
    });
  }

  return issues;
}

/**
 * Validate a single format by name.
 */
export function validateFormat(format: string): RegistryValidationIssue[] {
  const spec = FORMAT_REGISTRY[format];
  if (!spec) {
    return [{
      format,
      type: 'missing_rfc',
      message: `Format "${format}" not found in registry`,
      severity: 'error',
    }];
  }
  return validateFormatSpec(format, spec);
}

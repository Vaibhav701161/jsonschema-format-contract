/**
 * Test consistency validation: checks generated test suites for
 * duplicates, invalid RFC references, missing citations, and
 * other quality issues.
 */

import { generateCitedTests, type CitedTestCase } from './testCitation';
import { getSupportedFormats, getFormatSpec } from '../rfc/formatRegistry';

export type ConsistencyIssueType =
  | 'duplicate_test'
  | 'invalid_rfc_ref'
  | 'missing_citation'
  | 'missing_production'
  | 'orphan_test'
  | 'empty_data';

export interface ConsistencyIssue {
  type: ConsistencyIssueType;
  format: string;
  description: string;
  details: string;
  severity: 'error' | 'warning';
}

export interface ConsistencyReport {
  totalFormats: number;
  totalTests: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  issues: ConsistencyIssue[];
  clean: boolean;
}

/** Known valid RFC patterns */
const VALID_RFC_PATTERN = /^rfc\d+$|^ecma\d+$/;

/**
 * Validate test consistency across all formats.
 */
export function validateTestConsistency(): ConsistencyReport {
  const formats = getSupportedFormats();
  const issues: ConsistencyIssue[] = [];
  let totalTests = 0;

  for (const format of formats) {
    const tests = generateCitedTests(format);
    totalTests += tests.length;

    // Check for duplicates
    const seen = new Map<string, CitedTestCase>();
    for (const test of tests) {
      const key = `${test.data}:${test.valid}`;
      const existing = seen.get(key);
      if (existing) {
        issues.push({
          type: 'duplicate_test',
          format,
          description: `Duplicate test data`,
          details: `"${test.data}" appears in both "${existing.description}" and "${test.description}"`,
          severity: 'warning',
        });
      } else {
        seen.set(key, test);
      }
    }

    // Check for empty data
    for (const test of tests) {
      if (test.data === '' && test.valid) {
        // Empty string valid is allowed for some formats like uri-reference
        const spec = getFormatSpec(format);
        if (spec && !['uri-reference', 'iri-reference', 'uri-template', 'json-pointer', 'regex'].includes(format)) {
          issues.push({
            type: 'empty_data',
            format,
            description: `Empty string marked as valid`,
            details: `Test "${test.description}" has empty data marked valid for format "${format}"`,
            severity: 'warning',
          });
        }
      }
    }

    // Check RFC citations
    for (const test of tests) {
      const citationKeys = Object.keys(test.specification.citation);
      if (citationKeys.length === 0) {
        issues.push({
          type: 'missing_citation',
          format,
          description: `Missing RFC citation`,
          details: `Test "${test.description}" has no RFC reference`,
          severity: 'error',
        });
        continue;
      }

      for (const key of citationKeys) {
        if (!VALID_RFC_PATTERN.test(key)) {
          issues.push({
            type: 'invalid_rfc_ref',
            format,
            description: `Invalid RFC reference key`,
            details: `Key "${key}" in test "${test.description}" does not match expected pattern`,
            severity: 'error',
          });
        }
      }
    }

    // Check production references
    for (const test of tests) {
      if (!test.specification.production || test.specification.production === '') {
        issues.push({
          type: 'missing_production',
          format,
          description: `Missing production reference`,
          details: `Test "${test.description}" has no production rule reference`,
          severity: 'error',
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;

  return {
    totalFormats: formats.length,
    totalTests,
    totalIssues: issues.length,
    errors,
    warnings,
    issues: issues.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return a.format.localeCompare(b.format);
    }),
    clean: errors === 0,
  };
}

/**
 * Validate consistency for a single format.
 */
export function validateFormatConsistency(format: string): ConsistencyIssue[] {
  const report = validateTestConsistency();
  return report.issues.filter((i) => i.format === format);
}

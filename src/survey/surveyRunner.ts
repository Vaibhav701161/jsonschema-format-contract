/**
 * Survey runner: executes format validation tests against
 * multiple validator implementations and collects raw results.
 *
 * This module orchestrates the execution of edge-case tests
 * against available adapters, producing a structured result
 * matrix for downstream divergence analysis.
 */

import { getFormatSpec, getSupportedFormats } from '../rfc/formatRegistry';
import type { FormatEdgeCase } from '../rfc/formatRegistry';

export interface SurveyTestResult {
  format: string;
  adapter: string;
  input: string;
  expected: boolean;
  actual: boolean | null;
  match: boolean;
  error?: string;
  description: string;
}

export interface FormatSurveyResult {
  format: string;
  rfc: string;
  adapterResults: Map<string, SurveyTestResult[]>;
  totalTests: number;
  timestamp: string;
}

export interface SurveyReport {
  formats: FormatSurveyResult[];
  adapters: string[];
  timestamp: string;
  totalFormats: number;
  totalTests: number;
}

export type AdapterTestFn = (format: string, input: string) => { valid: boolean | null; error?: string };

/**
 * Run a survey for a single format against all provided adapters.
 */
export function surveyFormat(
  format: string,
  adapters: Map<string, AdapterTestFn>,
): FormatSurveyResult | undefined {
  const spec = getFormatSpec(format);
  if (!spec) return undefined;

  const adapterResults = new Map<string, SurveyTestResult[]>();

  for (const [adapterName, testFn] of adapters) {
    const results: SurveyTestResult[] = [];

    for (const edgeCase of spec.edgeCases) {
      const result = runSingleSurveyTest(format, edgeCase, adapterName, testFn);
      results.push(result);
    }

    adapterResults.set(adapterName, results);
  }

  return {
    format,
    rfc: spec.rfc,
    adapterResults,
    totalTests: spec.edgeCases.length * adapters.size,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run a survey across all supported formats.
 */
export function surveyAll(
  adapters: Map<string, AdapterTestFn>,
): SurveyReport {
  const formats = getSupportedFormats();
  const results: FormatSurveyResult[] = [];
  let totalTests = 0;

  for (const format of formats) {
    const result = surveyFormat(format, adapters);
    if (result) {
      results.push(result);
      totalTests += result.totalTests;
    }
  }

  return {
    formats: results,
    adapters: Array.from(adapters.keys()),
    timestamp: new Date().toISOString(),
    totalFormats: results.length,
    totalTests,
  };
}

/**
 * Run a single test case against a single adapter.
 */
function runSingleSurveyTest(
  format: string,
  edgeCase: FormatEdgeCase,
  adapterName: string,
  testFn: AdapterTestFn,
): SurveyTestResult {
  try {
    const { valid, error } = testFn(format, edgeCase.input);
    return {
      format,
      adapter: adapterName,
      input: edgeCase.input,
      expected: edgeCase.valid,
      actual: valid,
      match: valid === edgeCase.valid,
      error,
      description: edgeCase.description,
    };
  } catch (err) {
    return {
      format,
      adapter: adapterName,
      input: edgeCase.input,
      expected: edgeCase.valid,
      actual: null,
      match: false,
      error: err instanceof Error ? err.message : String(err),
      description: edgeCase.description,
    };
  }
}

/**
 * Convert survey results to a flat array for export.
 */
export function flattenSurveyResults(report: SurveyReport): SurveyTestResult[] {
  const results: SurveyTestResult[] = [];
  for (const formatResult of report.formats) {
    for (const [, adapterResults] of formatResult.adapterResults) {
      results.push(...adapterResults);
    }
  }
  return results;
}

/**
 * Export survey results as CSV string.
 */
export function surveyToCsv(report: SurveyReport): string {
  const rows: string[] = [];
  rows.push('format,adapter,input,expected,actual,match,description,error');

  const flat = flattenSurveyResults(report);
  for (const r of flat) {
    const escapedInput = `"${r.input.replace(/"/g, '""')}"`;
    const escapedDesc = `"${r.description.replace(/"/g, '""')}"`;
    const escapedError = r.error ? `"${r.error.replace(/"/g, '""')}"` : '';
    rows.push(
      `${r.format},${r.adapter},${escapedInput},${r.expected},${r.actual ?? 'null'},${r.match},${escapedDesc},${escapedError}`,
    );
  }

  return rows.join('\n');
}

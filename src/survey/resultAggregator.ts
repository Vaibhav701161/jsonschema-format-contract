/**
 * Result aggregator: processes raw survey results into
 * summary statistics and comparison matrices.
 */

import type { SurveyReport, SurveyTestResult } from './surveyRunner';
import { flattenSurveyResults } from './surveyRunner';

export interface AggregatedFormatResult {
  format: string;
  rfc: string;
  totalTests: number;
  byAdapter: AdapterAggregation[];
  agreementRate: number;
}

export interface AdapterAggregation {
  adapter: string;
  total: number;
  matches: number;
  mismatches: number;
  errors: number;
  accuracy: number;
}

export interface AggregatedReport {
  totalFormats: number;
  totalTests: number;
  adapters: string[];
  formatResults: AggregatedFormatResult[];
  overallAgreement: number;
  adapterSummaries: AdapterAggregation[];
}

/**
 * Aggregate survey results into summary statistics.
 */
export function aggregateResults(report: SurveyReport): AggregatedReport {
  const flat = flattenSurveyResults(report);
  const formatResults: AggregatedFormatResult[] = [];

  for (const formatReport of report.formats) {
    const formatTests: SurveyTestResult[] = [];
    for (const [, results] of formatReport.adapterResults) {
      formatTests.push(...results);
    }

    const byAdapter: AdapterAggregation[] = [];
    for (const [adapterName, results] of formatReport.adapterResults) {
      byAdapter.push(computeAdapterAggregation(adapterName, results));
    }

    const totalMatches = formatTests.filter((t) => t.match).length;
    const agreementRate = formatTests.length === 0
      ? 100
      : Math.round((totalMatches / formatTests.length) * 100);

    formatResults.push({
      format: formatReport.format,
      rfc: formatReport.rfc,
      totalTests: formatTests.length,
      byAdapter,
      agreementRate,
    });
  }

  // Overall adapter summaries
  const adapterSummaries: AdapterAggregation[] = [];
  for (const adapter of report.adapters) {
    const adapterTests = flat.filter((t) => t.adapter === adapter);
    adapterSummaries.push(computeAdapterAggregation(adapter, adapterTests));
  }

  const totalMatches = flat.filter((t) => t.match).length;
  const overallAgreement = flat.length === 0
    ? 100
    : Math.round((totalMatches / flat.length) * 100);

  return {
    totalFormats: report.totalFormats,
    totalTests: flat.length,
    adapters: report.adapters,
    formatResults: formatResults.sort((a, b) => a.agreementRate - b.agreementRate),
    overallAgreement,
    adapterSummaries,
  };
}

function computeAdapterAggregation(adapter: string, results: SurveyTestResult[]): AdapterAggregation {
  const total = results.length;
  const matches = results.filter((r) => r.match).length;
  const mismatches = results.filter((r) => !r.match && r.actual !== null).length;
  const errors = results.filter((r) => r.actual === null).length;
  const accuracy = total === 0 ? 100 : Math.round((matches / total) * 100);

  return { adapter, total, matches, mismatches, errors, accuracy };
}

/**
 * Build a divergence matrix: for each test input, which adapters agree/disagree.
 */
export interface DivergenceMatrixEntry {
  format: string;
  input: string;
  description: string;
  expected: boolean;
  results: Record<string, boolean | null>;
  unanimous: boolean;
}

export function buildDivergenceMatrix(report: SurveyReport): DivergenceMatrixEntry[] {
  const matrix: DivergenceMatrixEntry[] = [];

  for (const formatReport of report.formats) {
    // Get all unique inputs from the first adapter
    const firstAdapter = formatReport.adapterResults.entries().next().value;
    if (!firstAdapter) continue;

    const [, firstResults] = firstAdapter;

    for (const test of firstResults) {
      const results: Record<string, boolean | null> = {};

      for (const [adapterName, adapterResults] of formatReport.adapterResults) {
        const matching = adapterResults.find((r) => r.input === test.input);
        results[adapterName] = matching?.actual ?? null;
      }

      const values = Object.values(results).filter((v) => v !== null);
      const unanimous = values.length > 0 && values.every((v) => v === values[0]);

      matrix.push({
        format: test.format,
        input: test.input,
        description: test.description,
        expected: test.expected,
        results,
        unanimous,
      });
    }
  }

  return matrix;
}

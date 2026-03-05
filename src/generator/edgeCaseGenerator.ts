/**
 * Edge case generator: produces boundary test data
 * by analysing grammar features and known format pitfalls.
 *
 * Complements the static edge cases in the format registry
 * with systematically-derived cases from ABNF analysis.
 */

import { analyzeFormatGrammar, type GrammarBranch } from '../rfc';
import { getFormatSpec } from '../rfc';
import type { TestCase } from './formatTestGenerator';

export interface EdgeCaseSet {
  format: string;
  cases: TestCase[];
  coveredBranches: string[];
  uncoveredBranches: string[];
}

/**
 * Generate edge cases for a format by analysing its grammar branches
 * and producing test values that target each branch.
 */
export function generateEdgeCases(format: string): EdgeCaseSet {
  const spec = getFormatSpec(format);
  const analysis = analyzeFormatGrammar(format);

  const cases: TestCase[] = [];
  const coveredBranches: string[] = [];
  const uncoveredBranches: string[] = [];

  if (!spec || !analysis) {
    return { format, cases, coveredBranches, uncoveredBranches };
  }

  // Generate cases from registry edge cases (these are curated)
  for (const ec of spec.edgeCases) {
    cases.push({
      description: `[registry] ${ec.description}`,
      data: ec.input,
      valid: ec.valid,
    });
  }

  // Map branches to coverage
  for (const branch of analysis.branches) {
    const branchLabel = branch.label;
    const matchingCase = spec.edgeCases.find((ec) =>
      ec.description.toLowerCase().includes(branchLabel.toLowerCase()),
    );
    if (matchingCase) {
      coveredBranches.push(branchLabel);
    } else {
      uncoveredBranches.push(branchLabel);
      // Generate synthetic boundary cases for uncovered branches
      const synthetic = generateSyntheticCase(format, branch);
      if (synthetic) {
        cases.push(synthetic);
        coveredBranches.push(branchLabel);
        // Remove from uncovered since we generated a case
        uncoveredBranches.pop();
      }
    }
  }

  return {
    format,
    cases,
    coveredBranches: coveredBranches.sort(),
    uncoveredBranches: uncoveredBranches.sort(),
  };
}

function generateSyntheticCase(format: string, branch: GrammarBranch): TestCase | undefined {
  switch (branch.category) {
    case 'optional':
      if (branch.label.includes('absent')) {
        return {
          description: `[synthetic] ${branch.label}`,
          data: generateMinimalValid(format),
          valid: true,
        };
      }
      return undefined;

    case 'repetition':
      if (branch.label.includes('zero')) {
        return {
          description: `[synthetic] ${branch.label} - empty repetition`,
          data: generateMinimalValid(format),
          valid: true,
        };
      }
      return undefined;

    case 'range':
      if (branch.label.includes('min')) {
        return {
          description: `[synthetic] ${branch.label} - boundary minimum`,
          data: generateMinimalValid(format),
          valid: true,
        };
      }
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Generate a minimal valid value for common formats.
 * Used as a base for synthetic edge case generation.
 */
function generateMinimalValid(format: string): string {
  const minimals: Record<string, string> = {
    email: 'a@b.c',
    'idn-email': 'a@b.c',
    uri: 'x:y',
    'uri-reference': '',
    'uri-template': '',
    iri: 'x:y',
    'iri-reference': '',
    hostname: 'a',
    'idn-hostname': 'a',
    ipv4: '0.0.0.0',
    ipv6: '::',
    'date-time': '2000-01-01T00:00:00Z',
    date: '2000-01-01',
    time: '00:00:00Z',
    duration: 'P1D',
    uuid: '00000000-0000-0000-0000-000000000000',
    'json-pointer': '',
    'relative-json-pointer': '0',
    regex: '',
  };
  return minimals[format] ?? '';
}

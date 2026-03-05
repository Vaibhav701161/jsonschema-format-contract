/**
 * Generates valid and invalid test cases for JSON Schema format values.
 *
 * Uses the RFC format registry to produce test data following
 * the JSON Schema Test Suite structure.
 */

import { getFormatSpec, getAllEdgeCases, getSupportedFormats, type FormatEdgeCase } from '../rfc';
import { analyzeFormatGrammar, type GrammarAnalysis } from '../rfc';

export interface TestCase {
  description: string;
  data: string;
  valid: boolean;
}

export interface TestGroup {
  description: string;
  schema: { format: string };
  tests: TestCase[];
}

export interface GeneratedSuite {
  format: string;
  rfc: string;
  validTests: TestGroup;
  invalidTests: TestGroup;
  grammarAnalysis: GrammarAnalysis | undefined;
  totalTests: number;
}

/**
 * Generate a full test suite for a given format.
 * Returns valid and invalid test groups in JSON Schema Test Suite structure.
 */
export function generateFormatTestSuite(format: string): GeneratedSuite | undefined {
  const spec = getFormatSpec(format);
  if (!spec) return undefined;

  const edgeCases = getAllEdgeCases(format);
  const grammar = analyzeFormatGrammar(format);

  const validCases = edgeCases.filter((e) => e.valid);
  const invalidCases = edgeCases.filter((e) => !e.valid);

  const validTests: TestGroup = {
    description: `valid ${format} strings (${spec.rfc})`,
    schema: { format },
    tests: validCases.map(toTestCase),
  };

  const invalidTests: TestGroup = {
    description: `invalid ${format} strings (${spec.rfc})`,
    schema: { format },
    tests: invalidCases.map(toTestCase),
  };

  return {
    format,
    rfc: spec.rfc,
    validTests,
    invalidTests,
    grammarAnalysis: grammar,
    totalTests: validCases.length + invalidCases.length,
  };
}

/**
 * Generate test suites for all supported formats.
 */
export function generateAllFormatTestSuites(): GeneratedSuite[] {
  return getSupportedFormats()
    .map(generateFormatTestSuite)
    .filter((s): s is GeneratedSuite => s !== undefined);
}

/**
 * Convert a suite to JSON Schema Test Suite file format.
 * Returns an array: [{ description, schema, tests }].
 */
export function toTestSuiteJson(suite: GeneratedSuite): object[] {
  const groups: object[] = [];

  if (suite.validTests.tests.length > 0) {
    groups.push({
      description: suite.validTests.description,
      schema: suite.validTests.schema,
      tests: suite.validTests.tests.map((t) => ({
        description: t.description,
        data: t.data,
        valid: t.valid,
      })),
    });
  }

  if (suite.invalidTests.tests.length > 0) {
    groups.push({
      description: suite.invalidTests.description,
      schema: suite.invalidTests.schema,
      tests: suite.invalidTests.tests.map((t) => ({
        description: t.description,
        data: t.data,
        valid: t.valid,
      })),
    });
  }

  return groups;
}

function toTestCase(edge: FormatEdgeCase): TestCase {
  return {
    description: edge.description,
    data: edge.input,
    valid: edge.valid,
  };
}

/**
 * RFC Citation engine: attaches specification metadata to
 * every generated test case, ensuring full traceability
 * from test → production rule → RFC section.
 *
 * Each test includes a `specification` object with:
 * - RFC reference and section
 * - Production rule name and ABNF definition
 * - Direct quote from the grammar
 * - Validation level (MUST_SYNTAX, SHOULD_SYNTAX, etc.)
 */

import { buildFormatProductionGraph, type ProductionRule } from '../rfc/productionModel';
import { classifyRule, type RequirementLevel } from '../rfc/requirementClassifier';
import { getFormatSpec } from '../rfc/formatRegistry';

export interface SpecificationCitation {
  /** RFC key, e.g. "rfc3339" */
  [rfcKey: string]: string;
}

export interface TestSpecification {
  /** RFC section references, keyed by lowercase rfc identifier */
  citation: SpecificationCitation;
  /** Production rule name */
  production: string;
  /** ABNF definition quote */
  quote: string;
  /** Validation/requirement level */
  validation: RequirementLevel;
}

export interface CitedTestCase {
  description: string;
  data: string;
  valid: boolean;
  /** Comment indicating MUST accept/reject and ABNF production */
  comment: string;
  /** Full specification traceability */
  specification: TestSpecification;
}

/**
 * Build a specification citation for a format and optional production rule.
 */
export function buildCitation(
  format: string,
  productionName?: string,
): TestSpecification | undefined {
  const spec = getFormatSpec(format);
  if (!spec) return undefined;

  const graph = buildFormatProductionGraph(format);
  const rfcKey = normalizeRfcKey(spec.rfc);

  // Find the specific production rule
  let production: ProductionRule | undefined;
  if (graph && productionName) {
    production = graph.rules.get(productionName);
  }

  // Fall back to the root rule
  if (!production && graph && graph.roots.length > 0) {
    production = graph.rules.get(graph.roots[0]);
  }

  if (!production) {
    // Minimal citation without production details
    return {
      citation: { [rfcKey]: spec.rfc },
      production: format,
      quote: `format: "${format}"`,
      validation: 'MUST_SYNTAX',
    };
  }

  const classified = classifyRule(production);

  return {
    citation: { [rfcKey]: production.rfcSection },
    production: production.name,
    quote: `${production.name} = ${production.definition}`,
    validation: classified.level,
  };
}

/**
 * Attach specification metadata to a test case.
 */
export function citeTestCase(
  format: string,
  description: string,
  data: string,
  valid: boolean,
  productionName?: string,
): CitedTestCase {
  const spec = buildCitation(format, productionName);
  const action = valid ? 'accept' : 'reject';
  const prodName = spec?.production ?? format;

  return {
    description,
    data,
    valid,
    comment: `MUST ${action} per ABNF production: ${prodName}`,
    specification: spec ?? {
      citation: {},
      production: format,
      quote: `format: "${format}"`,
      validation: 'MUST_SYNTAX',
    },
  };
}

/**
 * Generate cited test cases for all edge cases of a format.
 */
export function generateCitedTests(format: string): CitedTestCase[] {
  const spec = getFormatSpec(format);
  if (!spec) return [];

  const graph = buildFormatProductionGraph(format);
  const rootProduction = graph?.roots[0];

  return spec.edgeCases.map((ec) => {
    return citeTestCase(
      format,
      ec.description,
      ec.input,
      ec.valid,
      rootProduction,
    );
  });
}

/**
 * Convert cited test cases to JSON Schema Test Suite format
 * with specification metadata embedded.
 */
export function toCitedTestSuiteJson(format: string): object[] {
  const spec = getFormatSpec(format);
  if (!spec) return [];

  const citedTests = generateCitedTests(format);
  const validTests = citedTests.filter((t) => t.valid);
  const invalidTests = citedTests.filter((t) => !t.valid);

  const groups: object[] = [];

  if (validTests.length > 0) {
    groups.push({
      description: `valid ${format} strings (${spec.rfc})`,
      schema: { format },
      tests: validTests.map(formatCitedTest),
    });
  }

  if (invalidTests.length > 0) {
    groups.push({
      description: `invalid ${format} strings (${spec.rfc})`,
      schema: { format },
      tests: invalidTests.map(formatCitedTest),
    });
  }

  return groups;
}

function formatCitedTest(test: CitedTestCase): object {
  return {
    description: test.description,
    data: test.data,
    valid: test.valid,
    comment: test.comment,
    specification: {
      ...test.specification.citation,
      production: test.specification.production,
      quote: test.specification.quote,
      validation: test.specification.validation,
    },
  };
}

/**
 * Normalize RFC name to a key like "rfc3339".
 */
function normalizeRfcKey(rfc: string): string {
  // Handle "RFC 3339" → "rfc3339", "RFC 5321/5322" → "rfc5321"
  const match = /RFC\s*(\d+)/i.exec(rfc);
  if (match) return `rfc${match[1]}`;
  // Handle "ECMA-262" → "ecma262"
  return rfc.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generate production-rule-driven tests:
 * - 1 valid + 1 invalid per MUST_SYNTAX rule
 * - 1 test per alternation branch
 * - boundary tests for repetition/range rules
 */
export function generateProductionDrivenTests(format: string): CitedTestCase[] {
  const graph = buildFormatProductionGraph(format);
  const spec = getFormatSpec(format);
  if (!graph || !spec) return [];

  const tests: CitedTestCase[] = [];
  const rfcKey = normalizeRfcKey(spec.rfc);

  for (const [, rule] of graph.rules) {
    const classified = classifyRule(rule);
    if (!classified.testable) continue;

    const citation: SpecificationCitation = { [rfcKey]: rule.rfcSection };
    const quote = `${rule.name} = ${rule.definition}`;

    // MUST_SYNTAX: generate 1 valid + 1 invalid
    if (classified.level === 'MUST_SYNTAX') {
      tests.push({
        description: `[MUST] valid ${rule.name}`,
        data: `<valid ${rule.name}>`,
        valid: true,
        comment: `MUST accept per ABNF production: ${rule.name}`,
        specification: { citation, production: rule.name, quote, validation: 'MUST_SYNTAX' },
      });
      tests.push({
        description: `[MUST] invalid ${rule.name}`,
        data: `<invalid ${rule.name}>`,
        valid: false,
        comment: `MUST reject per ABNF production: ${rule.name}`,
        specification: { citation, production: rule.name, quote, validation: 'MUST_SYNTAX' },
      });
    }

    // Alternation branches: 1 test per branch
    if (rule.ruleType === 'alternation') {
      const branches = rule.definition.split('/').map((s) => s.trim()).filter(Boolean);
      for (let i = 0; i < branches.length; i++) {
        tests.push({
          description: `[branch] ${rule.name} alternation ${i + 1}: ${branches[i]}`,
          data: `<${rule.name} branch ${i + 1}>`,
          valid: true,
          comment: `MUST accept alternation branch: ${branches[i]}`,
          specification: {
            citation,
            production: rule.name,
            quote: `${rule.name} = ${rule.definition} (branch: ${branches[i]})`,
            validation: classified.level,
          },
        });
      }
    }

    // Repetition/range: boundary tests
    if (rule.allowedRanges.length > 0) {
      for (const range of rule.allowedRanges) {
        tests.push({
          description: `[boundary] ${rule.name} at min (${range.min})`,
          data: `<${rule.name} min=${range.min}>`,
          valid: true,
          comment: `Boundary test: minimum value ${range.min}`,
          specification: {
            citation,
            production: rule.name,
            quote: `${quote} (range: ${range.min}-${range.max})`,
            validation: classified.level,
          },
        });
        tests.push({
          description: `[boundary] ${rule.name} at max (${range.max})`,
          data: `<${rule.name} max=${range.max}>`,
          valid: true,
          comment: `Boundary test: maximum value ${range.max}`,
          specification: {
            citation,
            production: rule.name,
            quote: `${quote} (range: ${range.min}-${range.max})`,
            validation: classified.level,
          },
        });
        tests.push({
          description: `[boundary] ${rule.name} below min (${range.min - 1})`,
          data: `<${rule.name} below_min=${range.min - 1}>`,
          valid: false,
          comment: `Boundary test: below minimum value ${range.min}`,
          specification: {
            citation,
            production: rule.name,
            quote: `${quote} (range: ${range.min}-${range.max})`,
            validation: classified.level,
          },
        });
        tests.push({
          description: `[boundary] ${rule.name} above max (${range.max + 1})`,
          data: `<${rule.name} above_max=${range.max + 1}>`,
          valid: false,
          comment: `Boundary test: above maximum value ${range.max}`,
          specification: {
            citation,
            production: rule.name,
            quote: `${quote} (range: ${range.min}-${range.max})`,
            validation: classified.level,
          },
        });
      }
    }
  }

  return tests;
}

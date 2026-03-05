import type { FormatSurfaceReport, FormatTestMatrix } from './types';
import type { FormatNode } from './types';

const MAX_ESTIMATED_TESTS = 100_000;

const BASE_TESTS = [
  'valid-basic',
  'valid-edge',
  'invalid-basic',
  'invalid-edge',
  'invalid-type',
] as const;

/**
 * Build a test matrix from format surface reports and format nodes.
 *
 * For each format, determines the required tests and estimated count
 * based on structural context (combinators, unions, required status).
 */
export function buildFormatTestMatrix(
  reports: FormatSurfaceReport[],
  formatNodes: FormatNode[],
): FormatTestMatrix[] {
  if (reports.length === 0) return [];

  // Build a lookup from pointer → FormatNode for context
  const nodeMap: Record<string, FormatNode> = Object.create(null);
  for (let i = 0; i < formatNodes.length; i++) {
    nodeMap[formatNodes[i].pointer] = formatNodes[i];
  }

  const result: FormatTestMatrix[] = [];

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    const node = nodeMap[report.pointer];

    const requiredTests: string[] = [...BASE_TESTS];
    let multiplier = 1;

    if (node !== undefined) {
      // Add context-specific tests
      const ctx = node.combinatorContext;

      // oneOf → add branch tests
      if (ctx.includes('oneOf')) {
        requiredTests.push('oneOf-branch-valid');
        requiredTests.push('oneOf-branch-invalid');
        multiplier = safeMultiply(multiplier, 2, MAX_ESTIMATED_TESTS);
      }

      // anyOf → add branch tests
      if (ctx.includes('anyOf')) {
        requiredTests.push('anyOf-combination-valid');
        requiredTests.push('anyOf-combination-invalid');
        multiplier = safeMultiply(multiplier, 2, MAX_ESTIMATED_TESTS);
      }

      // if/then/else → add conditional tests
      if (ctx.includes('if') || ctx.includes('then') || ctx.includes('else')) {
        requiredTests.push('conditional-true-path');
        requiredTests.push('conditional-false-path');
        multiplier = safeMultiply(multiplier, 2, MAX_ESTIMATED_TESTS);
      }

      // allOf → add intersection tests
      if (ctx.includes('allOf')) {
        requiredTests.push('allOf-intersection-valid');
        multiplier = safeMultiply(multiplier, 2, MAX_ESTIMATED_TESTS);
      }

      // Union type → multiply by type count
      if (Array.isArray(node.type) && node.type.length > 1) {
        requiredTests.push('union-type-variant');
        multiplier = safeMultiply(multiplier, node.type.length, MAX_ESTIMATED_TESTS);
      }

      // Required property → add missing-required test
      if (node.required) {
        requiredTests.push('missing-required-negative');
      }
    }

    const estimatedTestCount = Math.min(
      MAX_ESTIMATED_TESTS,
      safeMultiply(requiredTests.length, multiplier, MAX_ESTIMATED_TESTS),
    );

    result.push({
      format: report.format,
      pointer: report.pointer,
      requiredTests,
      estimatedTestCount,
      complexityMultiplier: multiplier,
    });
  }

  // Sort by pointer for deterministic output
  result.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));

  return result;
}

/**
 * Multiply a × b, capping at max to prevent overflow.
 */
function safeMultiply(a: number, b: number, max: number): number {
  if (a === 0 || b === 0) return a;
  if (a > max / b) return max;
  const result = a * b;
  return result > max ? max : result;
}

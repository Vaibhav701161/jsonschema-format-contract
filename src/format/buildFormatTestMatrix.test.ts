import { describe, it, expect } from 'vitest';
import { buildFormatTestMatrix } from './buildFormatTestMatrix';
import type { FormatSurfaceReport, FormatNode } from './types';

function makeReport(overrides: Partial<FormatSurfaceReport> & { format: string; pointer: string }): FormatSurfaceReport {
  return {
    branchDepth: 0,
    refDepth: 0,
    combinatorDepth: 0,
    fanOut: 0,
    riskScore: 0,
    ...overrides,
  };
}

function makeFormatNode(overrides: Partial<FormatNode> & { format: string; pointer: string }): FormatNode {
  return {
    depth: 0,
    refDepth: 0,
    combinatorContext: [],
    required: false,
    ...overrides,
  };
}

describe('buildFormatTestMatrix', () => {
  it('returns empty array for empty reports', () => {
    expect(buildFormatTestMatrix([], [])).toEqual([]);
  });

  it('generates base tests for simple email format', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/properties/email' })];
    const nodes = [makeFormatNode({ format: 'email', pointer: '#/properties/email' })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('email');
    expect(result[0].requiredTests).toContain('valid-basic');
    expect(result[0].requiredTests).toContain('valid-edge');
    expect(result[0].requiredTests).toContain('invalid-basic');
    expect(result[0].requiredTests).toContain('invalid-edge');
    expect(result[0].requiredTests).toContain('invalid-type');
    expect(result[0].requiredTests).toHaveLength(5);
    expect(result[0].complexityMultiplier).toBe(1);
    expect(result[0].estimatedTestCount).toBe(5);
  });

  it('adds branch tests for oneOf context', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/oneOf/0' })];
    const nodes = [makeFormatNode({ format: 'email', pointer: '#/oneOf/0', combinatorContext: ['oneOf'] })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('oneOf-branch-valid');
    expect(result[0].requiredTests).toContain('oneOf-branch-invalid');
    expect(result[0].complexityMultiplier).toBe(2);
    // (5 base + 2 oneOf) * 2 = 14
    expect(result[0].estimatedTestCount).toBe(14);
  });

  it('adds combination tests for anyOf context', () => {
    const reports = [makeReport({ format: 'uri', pointer: '#/anyOf/0' })];
    const nodes = [makeFormatNode({ format: 'uri', pointer: '#/anyOf/0', combinatorContext: ['anyOf'] })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('anyOf-combination-valid');
    expect(result[0].requiredTests).toContain('anyOf-combination-invalid');
    expect(result[0].complexityMultiplier).toBe(2);
  });

  it('adds conditional tests for if/then/else context', () => {
    const reports = [makeReport({ format: 'date-time', pointer: '#/then' })];
    const nodes = [makeFormatNode({ format: 'date-time', pointer: '#/then', combinatorContext: ['if', 'then'] })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('conditional-true-path');
    expect(result[0].requiredTests).toContain('conditional-false-path');
    expect(result[0].complexityMultiplier).toBe(2);
  });

  it('adds intersection test for allOf context', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/allOf/0' })];
    const nodes = [makeFormatNode({ format: 'email', pointer: '#/allOf/0', combinatorContext: ['allOf'] })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('allOf-intersection-valid');
    expect(result[0].complexityMultiplier).toBe(2);
  });

  it('adds union type variant and multiplies by type count', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/properties/val' })];
    const nodes = [
      makeFormatNode({
        format: 'email',
        pointer: '#/properties/val',
        type: ['string', 'null'],
      }),
    ];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('union-type-variant');
    // multiplier = 1 * 2 (union types) = 2
    expect(result[0].complexityMultiplier).toBe(2);
  });

  it('adds missing-required test for required property', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/properties/email' })];
    const nodes = [makeFormatNode({ format: 'email', pointer: '#/properties/email', required: true })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('missing-required-negative');
    // required adds 1 test but doesn't change multiplier
    expect(result[0].complexityMultiplier).toBe(1);
    expect(result[0].estimatedTestCount).toBe(6);
  });

  it('combines multiple context modifiers', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/oneOf/0/anyOf/0' })];
    const nodes = [
      makeFormatNode({
        format: 'email',
        pointer: '#/oneOf/0/anyOf/0',
        combinatorContext: ['oneOf', 'anyOf'],
        required: true,
      }),
    ];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toContain('oneOf-branch-valid');
    expect(result[0].requiredTests).toContain('anyOf-combination-valid');
    expect(result[0].requiredTests).toContain('missing-required-negative');
    // multiplier = 1 * 2 (oneOf) * 2 (anyOf) = 4
    expect(result[0].complexityMultiplier).toBe(4);
  });

  it('handles multiple format nodes', () => {
    const reports = [
      makeReport({ format: 'email', pointer: '#/properties/email' }),
      makeReport({ format: 'uri', pointer: '#/properties/website' }),
    ];
    const nodes = [
      makeFormatNode({ format: 'email', pointer: '#/properties/email' }),
      makeFormatNode({ format: 'uri', pointer: '#/properties/website' }),
    ];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(2);
    expect(result[0].format).toBe('email');
    expect(result[1].format).toBe('uri');
  });

  it('returns sorted results by pointer', () => {
    const reports = [
      makeReport({ format: 'uri', pointer: '#/properties/z' }),
      makeReport({ format: 'email', pointer: '#/properties/a' }),
    ];
    const nodes = [
      makeFormatNode({ format: 'uri', pointer: '#/properties/z' }),
      makeFormatNode({ format: 'email', pointer: '#/properties/a' }),
    ];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result[0].pointer).toBe('#/properties/a');
    expect(result[1].pointer).toBe('#/properties/z');
  });

  it('is deterministic across multiple runs', () => {
    const reports = [
      makeReport({ format: 'date', pointer: '#/properties/b' }),
      makeReport({ format: 'email', pointer: '#/properties/a' }),
    ];
    const nodes = [
      makeFormatNode({ format: 'date', pointer: '#/properties/b' }),
      makeFormatNode({ format: 'email', pointer: '#/properties/a' }),
    ];
    const run1 = buildFormatTestMatrix(reports, nodes);
    const run2 = buildFormatTestMatrix(reports, nodes);
    expect(run1).toEqual(run2);
  });

  it('handles report without matching format node', () => {
    const reports = [makeReport({ format: 'email', pointer: '#/properties/email' })];
    const nodes: FormatNode[] = []; // No matching node
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].requiredTests).toHaveLength(5); // Only base tests
    expect(result[0].complexityMultiplier).toBe(1);
  });

  it('caps estimated test count at 100,000', () => {
    // Union type with many types × multiple combinators
    const reports = [makeReport({ format: 'email', pointer: '#/x' })];
    const nodes = [
      makeFormatNode({
        format: 'email',
        pointer: '#/x',
        combinatorContext: ['oneOf', 'anyOf', 'allOf', 'if'],
        type: ['string', 'integer', 'number', 'boolean', 'null'],
        required: true,
      }),
    ];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    expect(result[0].estimatedTestCount).toBeLessThanOrEqual(100_000);
  });

  it('handles format node with only else combinator', () => {
    const reports = [makeReport({ format: 'date', pointer: '#/else' })];
    const nodes = [makeFormatNode({ format: 'date', pointer: '#/else', combinatorContext: ['else'] })];
    const result = buildFormatTestMatrix(reports, nodes);

    expect(result).toHaveLength(1);
    // 'else' triggers conditional path via the if/then/else check
    expect(result[0].requiredTests).toContain('conditional-true-path');
    expect(result[0].requiredTests).toContain('conditional-false-path');
  });

  it('generates correct test count with 3 union types and required', () => {
    const reports = [makeReport({ format: 'date', pointer: '#/p' })];
    const nodes = [
      makeFormatNode({
        format: 'date',
        pointer: '#/p',
        type: ['string', 'integer', 'null'],
        required: true,
      }),
    ];
    const result = buildFormatTestMatrix(reports, nodes);

    // 5 base + 1 union + 1 required = 7 tests
    // multiplier = 1 * 3 (union) = 3
    // estimated = 7 * 3 = 21
    expect(result[0].requiredTests).toHaveLength(7);
    expect(result[0].complexityMultiplier).toBe(3);
    expect(result[0].estimatedTestCount).toBe(21);
  });
});

import { describe, it, expect } from 'vitest';
import { extractFormatContexts } from './extractFormatContexts';
import type { StructuralModel, SchemaNode, RefEdge } from '../../types';

function makeNode(overrides: Partial<SchemaNode> & { pointer: string }): SchemaNode {
  return {
    children: [],
    depth: 0,
    ...overrides,
  };
}

function makeModel(
  nodes: Record<string, SchemaNode>,
  edges: RefEdge[] = [],
  cycles: string[][] = [],
  unsupportedKeywords: string[] = [],
): StructuralModel {
  return {
    nodes,
    edges,
    cycles,
    missingTargets: [],
    unsupportedKeywords,
  };
}

describe('extractFormatContexts', () => {
  it('returns empty array for empty model', () => {
    const model = makeModel({});
    expect(extractFormatContexts(model)).toEqual([]);
  });

  it('returns empty array for model with no format nodes', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object', depth: 0 }),
      '#/properties/name': makeNode({ pointer: '#/properties/name', type: 'string', depth: 1, parent: '#' }),
    });
    expect(extractFormatContexts(model)).toEqual([]);
  });

  it('extracts a single format context', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object', depth: 0, children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', type: 'string', format: 'email', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('email');
    expect(result[0].pointer).toBe('#/properties/email');
    expect(result[0].depth).toBe(1);
  });

  it('extracts multiple format contexts sorted by pointer', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object', depth: 0 }),
      '#/properties/url': makeNode({ pointer: '#/properties/url', type: 'string', format: 'uri', depth: 1, parent: '#' }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', type: 'string', format: 'email', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(2);
    expect(result[0].pointer).toBe('#/properties/email');
    expect(result[1].pointer).toBe('#/properties/url');
  });

  it('computes combinator depth for format under oneOf', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { oneOf: ['#/oneOf/0'] }, children: ['#/oneOf/0'] }),
      '#/oneOf/0': makeNode({ pointer: '#/oneOf/0', type: 'string', format: 'email', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorDepth).toBe(1);
    expect(result[0].combinatorTypes).toContain('oneOf');
  });

  it('computes combinator depth for nested combinators', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { allOf: ['#/allOf/0'] }, children: ['#/allOf/0'] }),
      '#/allOf/0': makeNode({ pointer: '#/allOf/0', depth: 1, parent: '#', combinators: { oneOf: ['#/allOf/0/oneOf/0'] }, children: ['#/allOf/0/oneOf/0'] }),
      '#/allOf/0/oneOf/0': makeNode({ pointer: '#/allOf/0/oneOf/0', type: 'string', format: 'email', depth: 2, parent: '#/allOf/0' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorDepth).toBe(2);
    expect(result[0].combinatorTypes).toContain('allOf');
    expect(result[0].combinatorTypes).toContain('oneOf');
  });

  it('detects conditional context for format under then', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { if: '#/if', then: '#/then' }, children: ['#/if', '#/then'] }),
      '#/if': makeNode({ pointer: '#/if', depth: 1, parent: '#' }),
      '#/then': makeNode({ pointer: '#/then', depth: 1, parent: '#', children: ['#/then/properties/value'] }),
      '#/then/properties/value': makeNode({ pointer: '#/then/properties/value', type: 'string', format: 'email', depth: 2, parent: '#/then' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].conditionalContext).toBe(true);
  });

  it('detects conditional context from pointer segments', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, children: ['#/if'] }),
      '#/if': makeNode({ pointer: '#/if', depth: 1, parent: '#', children: ['#/if/properties/x'] }),
      '#/if/properties/x': makeNode({ pointer: '#/if/properties/x', type: 'string', format: 'email', depth: 2, parent: '#/if' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].conditionalContext).toBe(true);
  });

  it('returns false for conditional context when not in if/then/else', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', type: 'string', format: 'email', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].conditionalContext).toBe(false);
  });

  it('detects recursive context when node is on a cycle', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0, ref: '#/$defs/Node', children: ['#/$defs/Node'] }),
        '#/$defs/Node': makeNode({ pointer: '#/$defs/Node', depth: 1, parent: '#', ref: '#/$defs/Node', format: 'uri', type: 'string' }),
      },
      [
        { from: '#', to: '#/$defs/Node', status: 'normal' },
        { from: '#/$defs/Node', to: '#/$defs/Node', status: 'cycle' },
      ],
      [['#/$defs/Node']],
    );
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].recursiveContext).toBe(true);
  });

  it('detects recursive context for descendant of cyclic node', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0, children: ['#/$defs/Node'] }),
        '#/$defs/Node': makeNode({ pointer: '#/$defs/Node', depth: 1, parent: '#', ref: '#/$defs/Node', children: ['#/$defs/Node/properties/email'] }),
        '#/$defs/Node/properties/email': makeNode({ pointer: '#/$defs/Node/properties/email', depth: 2, parent: '#/$defs/Node', format: 'email', type: 'string' }),
      },
      [{ from: '#/$defs/Node', to: '#/$defs/Node', status: 'cycle' }],
      [['#/$defs/Node']],
    );
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].recursiveContext).toBe(true);
  });

  it('returns false for recursive context when no cycles', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].recursiveContext).toBe(false);
  });

  it('detects dynamic context from $dynamicRef', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0 }),
        '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
      },
      [],
      [],
      ['$dynamicRef'],
    );
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].dynamicContext).toBe(true);
  });

  it('detects dynamic context from $recursiveRef', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0 }),
        '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
      },
      [],
      [],
      ['$recursiveRef'],
    );
    const result = extractFormatContexts(model);
    expect(result[0].dynamicContext).toBe(true);
  });

  it('returns false for dynamic context when no dynamic keywords', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].dynamicContext).toBe(false);
  });

  it('detects union type', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/value': makeNode({ pointer: '#/properties/value', format: 'date-time', type: ['string', 'null'], depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].unionType).toBe(true);
  });

  it('returns false for union type with single type', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].unionType).toBe(false);
  });

  it('detects required property', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', required: ['email'], children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].required).toBe(true);
  });

  it('returns false for required when not in required list', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', required: ['name'], children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].required).toBe(false);
  });

  it('detects pattern property context from pointer path', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, patternProperties: ['^x-'], children: ['#/patternProperties/^x-'] }),
      '#/patternProperties/^x-': makeNode({ pointer: '#/patternProperties/^x-', format: 'uri', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].patternPropertyContext).toBe(true);
  });

  it('detects pattern property context from ancestor', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, patternProperties: ['^x-'], children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].patternPropertyContext).toBe(true);
  });

  it('returns false for pattern property when no pattern properties', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].patternPropertyContext).toBe(false);
  });

  it('computes ref depth for format behind $ref chain', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0, ref: '#/$defs/A', children: ['#/$defs/A', '#/$defs/B'] }),
        '#/$defs/A': makeNode({ pointer: '#/$defs/A', depth: 1, parent: '#', ref: '#/$defs/B' }),
        '#/$defs/B': makeNode({ pointer: '#/$defs/B', depth: 1, parent: '#', format: 'email', type: 'string' }),
      },
      [
        { from: '#', to: '#/$defs/A', status: 'normal' },
        { from: '#/$defs/A', to: '#/$defs/B', status: 'normal' },
      ],
    );
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].refDepth).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic across multiple runs', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
      '#/properties/url': makeNode({ pointer: '#/properties/url', format: 'uri', type: 'string', depth: 1, parent: '#' }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', format: 'email', type: 'string', depth: 1, parent: '#' }),
      '#/properties/date': makeNode({ pointer: '#/properties/date', format: 'date', type: 'string', depth: 1, parent: '#' }),
    });
    const run1 = extractFormatContexts(model);
    const run2 = extractFormatContexts(model);
    expect(run1).toEqual(run2);
  });

  it('handles combinator types in root-first order', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { allOf: ['#/allOf/0'] }, children: ['#/allOf/0'] }),
      '#/allOf/0': makeNode({ pointer: '#/allOf/0', depth: 1, parent: '#', combinators: { oneOf: ['#/allOf/0/oneOf/0'] }, children: ['#/allOf/0/oneOf/0'] }),
      '#/allOf/0/oneOf/0': makeNode({ pointer: '#/allOf/0/oneOf/0', type: 'string', format: 'email', depth: 2, parent: '#/allOf/0' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].combinatorTypes[0]).toBe('allOf');
    expect(result[0].combinatorTypes[1]).toBe('oneOf');
  });

  it('handles not combinator context', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { not: '#/not' }, children: ['#/not'] }),
      '#/not': makeNode({ pointer: '#/not', type: 'string', format: 'email', depth: 1, parent: '#' }),
    });
    const result = extractFormatContexts(model);
    expect(result[0].combinatorTypes).toContain('not');
  });

  it('handles format at root level', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, format: 'uri', type: 'string' }),
    });
    const result = extractFormatContexts(model);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#');
    expect(result[0].depth).toBe(0);
    expect(result[0].combinatorDepth).toBe(0);
    expect(result[0].required).toBe(false);
  });
});

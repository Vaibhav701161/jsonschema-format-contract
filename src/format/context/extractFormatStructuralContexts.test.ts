import { describe, it, expect } from 'vitest';
import { extractFormatStructuralContexts } from './extractFormatStructuralContexts';
import type { StructuralModel, SchemaNode } from '../../types';

function node(overrides: Partial<SchemaNode> & { pointer: string }): SchemaNode {
  return {
    children: [],
    depth: 0,
    ...overrides,
  };
}

function model(overrides: Partial<StructuralModel> = {}): StructuralModel {
  return {
    nodes: {},
    edges: [],
    cycles: [],
    missingTargets: [],
    unsupportedKeywords: [],
    ...overrides,
  };
}

describe('extractFormatStructuralContexts', () => {
  it('returns empty array for empty model', () => {
    const result = extractFormatStructuralContexts(model());
    expect(result).toEqual([]);
  });

  it('returns empty array when no nodes have format', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'object' }),
        '#/properties/name': node({ pointer: '#/properties/name', type: 'string', parent: '#', depth: 1 }),
      },
    });
    expect(extractFormatStructuralContexts(m)).toEqual([]);
  });

  it('extracts single flat format node', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'object', properties: ['email'], children: ['#/properties/email'] }),
        '#/properties/email': node({
          pointer: '#/properties/email',
          type: 'string',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#/properties/email');
    expect(result[0].format).toBe('email');
    expect(result[0].underRef).toBe(false);
    expect(result[0].underCombinator).toBe(false);
    expect(result[0].underConditional).toBe(false);
    expect(result[0].insideRecursiveCycle).toBe(false);
    expect(result[0].refChainDepth).toBe(0);
  });

  it('captures correct format value', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'object', properties: ['ts'], children: ['#/properties/ts'] }),
        '#/properties/ts': node({
          pointer: '#/properties/ts',
          type: 'string',
          format: 'date-time',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].format).toBe('date-time');
  });

  it('extracts multiple format nodes sorted by pointer', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'object', properties: ['z', 'a'], children: ['#/properties/z', '#/properties/a'] }),
        '#/properties/z': node({ pointer: '#/properties/z', format: 'uri', parent: '#', depth: 1 }),
        '#/properties/a': node({ pointer: '#/properties/a', format: 'email', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(2);
    expect(result[0].pointer).toBe('#/properties/a');
    expect(result[1].pointer).toBe('#/properties/z');
  });

  it('detects format under $ref', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', ref: '#/$defs/Email', children: ['#/$defs/Email'] }),
        '#/$defs/Email': node({
          pointer: '#/$defs/Email',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
      edges: [{ from: '#', to: '#/$defs/Email', status: 'normal' }],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underRef).toBe(true);
  });

  it('computes refChainDepth via edge BFS', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', ref: '#/$defs/L1', children: ['#/$defs/L1', '#/$defs/L2'] }),
        '#/$defs/L1': node({ pointer: '#/$defs/L1', ref: '#/$defs/L2', parent: '#', depth: 1 }),
        '#/$defs/L2': node({ pointer: '#/$defs/L2', format: 'uri', parent: '#', depth: 1 }),
      },
      edges: [
        { from: '#', to: '#/$defs/L1', status: 'normal' },
        { from: '#/$defs/L1', to: '#/$defs/L2', status: 'normal' },
      ],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].refChainDepth).toBe(2);
  });

  it('detects format inside recursive cycle', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', ref: '#/$defs/A', children: ['#/$defs/A', '#/$defs/B'] }),
        '#/$defs/A': node({ pointer: '#/$defs/A', ref: '#/$defs/B', format: 'email', parent: '#', depth: 1 }),
        '#/$defs/B': node({ pointer: '#/$defs/B', ref: '#/$defs/A', parent: '#', depth: 1 }),
      },
      edges: [
        { from: '#', to: '#/$defs/A', status: 'normal' },
        { from: '#/$defs/A', to: '#/$defs/B', status: 'cycle' },
        { from: '#/$defs/B', to: '#/$defs/A', status: 'cycle' },
      ],
      cycles: [['#/$defs/A', '#/$defs/B']],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].insideRecursiveCycle).toBe(true);
  });

  it('marks reachable children of cyclic nodes as recursive', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', children: ['#/$defs/A'] }),
        '#/$defs/A': node({ pointer: '#/$defs/A', ref: '#/$defs/A', parent: '#', depth: 1, children: ['#/$defs/A/properties/x'] }),
        '#/$defs/A/properties/x': node({
          pointer: '#/$defs/A/properties/x',
          format: 'date',
          parent: '#/$defs/A',
          depth: 2,
        }),
      },
      edges: [{ from: '#/$defs/A', to: '#/$defs/A', status: 'cycle' }],
      cycles: [['#/$defs/A']],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].insideRecursiveCycle).toBe(true);
  });

  it('detects format under allOf', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { allOf: ['#/allOf/0'] },
          children: ['#/allOf/0'],
        }),
        '#/allOf/0': node({
          pointer: '#/allOf/0',
          format: 'date-time',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underCombinator).toBe(true);
    expect(result[0].combinatorTypes).toContain('allOf');
  });

  it('detects format under anyOf', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', combinators: { anyOf: ['#/anyOf/0'] }, children: ['#/anyOf/0'] }),
        '#/anyOf/0': node({ pointer: '#/anyOf/0', format: 'email', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underCombinator).toBe(true);
    expect(result[0].combinatorTypes).toContain('anyOf');
  });

  it('detects format under oneOf', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', combinators: { oneOf: ['#/oneOf/0'] }, children: ['#/oneOf/0'] }),
        '#/oneOf/0': node({ pointer: '#/oneOf/0', format: 'uri', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].combinatorTypes).toContain('oneOf');
  });

  it('detects format under not', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', combinators: { not: '#/not' }, children: ['#/not'] }),
        '#/not': node({ pointer: '#/not', format: 'ipv4', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underCombinator).toBe(true);
    expect(result[0].combinatorTypes).toContain('not');
  });

  it('detects nested combinator depth', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { allOf: ['#/allOf/0'] },
          children: ['#/allOf/0'],
        }),
        '#/allOf/0': node({
          pointer: '#/allOf/0',
          combinators: { oneOf: ['#/allOf/0/oneOf/0'] },
          parent: '#',
          depth: 1,
          children: ['#/allOf/0/oneOf/0'],
        }),
        '#/allOf/0/oneOf/0': node({
          pointer: '#/allOf/0/oneOf/0',
          format: 'email',
          parent: '#/allOf/0',
          depth: 2,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underCombinator).toBe(true);
    expect(result[0].combinatorTypes).toEqual(['allOf', 'oneOf']);
    expect(result[0].combinatorDepth).toBe(2);
  });

  it('sorts combinator types alphabetically', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { oneOf: ['#/oneOf/0'], anyOf: ['#/anyOf/0'] },
          children: ['#/oneOf/0'],
        }),
        '#/oneOf/0': node({
          pointer: '#/oneOf/0',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].combinatorTypes).toEqual(['anyOf', 'oneOf']);
  });

  it('detects format under if', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { if: '#/if' },
          children: ['#/if'],
        }),
        '#/if': node({
          pointer: '#/if',
          format: 'date',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underConditional).toBe(true);
    expect(result[0].underIf).toBe(true);
    expect(result[0].underThen).toBe(false);
    expect(result[0].underElse).toBe(false);
  });

  it('detects format under then', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { then: '#/then' },
          children: ['#/then'],
        }),
        '#/then': node({ pointer: '#/then', format: 'date', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underConditional).toBe(true);
    expect(result[0].underThen).toBe(true);
  });

  it('detects format under else', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { else: '#/else' },
          children: ['#/else'],
        }),
        '#/else': node({ pointer: '#/else', format: 'time', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underConditional).toBe(true);
    expect(result[0].underElse).toBe(true);
  });

  it('detects conditional from ancestor combinators', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { if: '#/if', then: '#/then' },
          children: ['#/then'],
        }),
        '#/then': node({
          pointer: '#/then',
          type: 'object',
          properties: ['x'],
          parent: '#',
          depth: 1,
          children: ['#/then/properties/x'],
        }),
        '#/then/properties/x': node({
          pointer: '#/then/properties/x',
          format: 'email',
          parent: '#/then',
          depth: 2,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underConditional).toBe(true);
    expect(result[0].underThen).toBe(true);
  });

  it('detects format with union type', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: ['string', 'null'], format: 'email' }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underUnionType).toBe(true);
    expect(result[0].unionTypes).toEqual(['string', 'null']);
  });

  it('no union type for single type', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'string', format: 'email' }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underUnionType).toBe(false);
    expect(result[0].unionTypes).toBeUndefined();
  });

  it('no union type for single-element array', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: ['string'], format: 'email' }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underUnionType).toBe(false);
  });

  it('detects format under patternProperties', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          type: 'object',
          patternProperties: ['^x-'],
          children: ['#/patternProperties/^x-'],
        }),
        '#/patternProperties/^x-': node({
          pointer: '#/patternProperties/^x-',
          format: 'uri',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underPatternProperties).toBe(true);
  });

  it('detects patternProperties from ancestor', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', patternProperties: ['^x-'], children: ['#/patternProperties/^x-'] }),
        '#/patternProperties/^x-': node({
          pointer: '#/patternProperties/^x-',
          type: 'object',
          properties: ['val'],
          parent: '#',
          depth: 1,
          children: ['#/patternProperties/^x-/properties/val'],
        }),
        '#/patternProperties/^x-/properties/val': node({
          pointer: '#/patternProperties/^x-/properties/val',
          format: 'date',
          parent: '#/patternProperties/^x-',
          depth: 2,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underPatternProperties).toBe(true);
  });

  it('detects format under unevaluatedProperties via pointer segment', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', children: ['#/unevaluatedProperties'] }),
        '#/unevaluatedProperties': node({
          pointer: '#/unevaluatedProperties',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underUnevaluatedProperties).toBe(true);
  });

  it('detects required property format', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          type: 'object',
          properties: ['email'],
          required: ['email'],
          children: ['#/properties/email'],
        }),
        '#/properties/email': node({
          pointer: '#/properties/email',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].requiredProperty).toBe(true);
  });

  it('non-required property returns false', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          type: 'object',
          properties: ['email'],
          children: ['#/properties/email'],
        }),
        '#/properties/email': node({
          pointer: '#/properties/email',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].requiredProperty).toBe(false);
  });

  it('detects dynamic ref via unsupportedKeywords', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', format: 'email' }),
      },
      unsupportedKeywords: ['$dynamicRef'],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underDynamicRef).toBe(true);
  });

  it('detects $recursiveRef via unsupportedKeywords', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', format: 'uri' }),
      },
      unsupportedKeywords: ['$recursiveRef'],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underDynamicRef).toBe(true);
  });

  it('detects $dynamicAnchor via unsupportedKeywords', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', format: 'uri' }),
      },
      unsupportedKeywords: ['$dynamicAnchor'],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underDynamicRef).toBe(true);
  });

  it('no dynamic ref without unsupportedKeywords', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', format: 'email' }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underDynamicRef).toBe(false);
  });

  it('captures maxAncestorDepth from node.depth', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', children: ['#/properties/a'] }),
        '#/properties/a': node({
          pointer: '#/properties/a',
          children: ['#/properties/a/properties/b'],
          parent: '#',
          depth: 1,
        }),
        '#/properties/a/properties/b': node({
          pointer: '#/properties/a/properties/b',
          format: 'date',
          parent: '#/properties/a',
          depth: 2,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].maxAncestorDepth).toBe(2);
  });

  it('captures all flags simultaneously on complex node', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { allOf: ['#/allOf/0'], if: '#/if', then: '#/then' },
          children: ['#/then', '#/if', '#/$defs/A'],
        }),
        '#/if': node({ pointer: '#/if', parent: '#', depth: 1 }),
        '#/then': node({
          pointer: '#/then',
          type: 'object',
          patternProperties: ['^x-'],
          parent: '#',
          depth: 1,
          children: ['#/then/patternProperties/^x-'],
        }),
        '#/then/patternProperties/^x-': node({
          pointer: '#/then/patternProperties/^x-',
          type: ['string', 'null'],
          format: 'email',
          parent: '#/then',
          depth: 2,
        }),
        '#/$defs/A': node({ pointer: '#/$defs/A', ref: '#/$defs/A', parent: '#', depth: 1 }),
      },
      edges: [{ from: '#/$defs/A', to: '#/$defs/A', status: 'cycle' }],
      cycles: [['#/$defs/A']],
      unsupportedKeywords: ['$dynamicRef'],
    });
    const result = extractFormatStructuralContexts(m);
    const ctx = result[0];
    expect(ctx.format).toBe('email');
    expect(ctx.underConditional).toBe(true);
    expect(ctx.underThen).toBe(true);
    expect(ctx.underPatternProperties).toBe(true);
    expect(ctx.underUnionType).toBe(true);
    expect(ctx.underDynamicRef).toBe(true);
    expect(ctx.underCombinator).toBe(true);
  });

  it('output is deterministic across multiple calls', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'object', properties: ['b', 'a', 'c'] }),
        '#/properties/b': node({ pointer: '#/properties/b', format: 'uri', parent: '#', depth: 1 }),
        '#/properties/a': node({ pointer: '#/properties/a', format: 'email', parent: '#', depth: 1 }),
        '#/properties/c': node({ pointer: '#/properties/c', format: 'date', parent: '#', depth: 1 }),
      },
    });
    const r1 = extractFormatStructuralContexts(m);
    const r2 = extractFormatStructuralContexts(m);
    expect(r1).toEqual(r2);
    expect(r1.map(c => c.pointer)).toEqual([
      '#/properties/a',
      '#/properties/b',
      '#/properties/c',
    ]);
  });

  it('handles format on root node', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', format: 'email', type: 'string' }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#');
    expect(result[0].requiredProperty).toBe(false);
    expect(result[0].underRef).toBe(false);
  });

  it('handles deeply nested format (depth 5)', () => {
    const nodes: Record<string, SchemaNode> = {};
    nodes['#'] = node({ pointer: '#', type: 'object', properties: ['a'], children: ['#/properties/a'] });
    for (let i = 1; i <= 4; i++) {
      const actualPtr = '#' + '/properties/a'.repeat(i);
      nodes[actualPtr] = node({
        pointer: actualPtr,
        type: 'object',
        properties: i < 4 ? ['a'] : undefined,
        format: i === 4 ? 'email' : undefined,
        parent: '#' + '/properties/a'.repeat(i - 1),
        depth: i,
        children: i < 4 ? [('#' + '/properties/a'.repeat(i + 1))] : [],
      });
    }
    const m = model({ nodes });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(1);
    expect(result[0].maxAncestorDepth).toBe(4);
  });

  it('ignores nodes without format field', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', type: 'object', properties: ['a', 'b'] }),
        '#/properties/a': node({ pointer: '#/properties/a', type: 'string', parent: '#', depth: 1 }),
        '#/properties/b': node({ pointer: '#/properties/b', format: 'uri', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('uri');
  });

  it('handles missing edge targets gracefully', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', ref: '#/$defs/Missing', format: 'email' }),
      },
      edges: [{ from: '#', to: '#/$defs/Missing', status: 'missing' }],
      missingTargets: ['#/$defs/Missing'],
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(1);
    // Should still work, just with ref detected on node
    expect(result[0].underRef).toBe(true);
  });

  it('handles multiple formats on different branches', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1'] },
          children: ['#/oneOf/0', '#/oneOf/1'],
        }),
        '#/oneOf/0': node({ pointer: '#/oneOf/0', format: 'email', parent: '#', depth: 1 }),
        '#/oneOf/1': node({ pointer: '#/oneOf/1', format: 'uri', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(2);
    expect(result[0].format).toBe('email');
    expect(result[1].format).toBe('uri');
    expect(result[0].underCombinator).toBe(true);
    expect(result[1].underCombinator).toBe(true);
  });

  it('format under both allOf and if/then/else', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { allOf: ['#/allOf/0'], if: '#/if', then: '#/then' },
          children: ['#/allOf/0', '#/if', '#/then'],
        }),
        '#/if': node({ pointer: '#/if', parent: '#', depth: 1 }),
        '#/then': node({
          pointer: '#/then',
          combinators: { allOf: ['#/then/allOf/0'] },
          parent: '#',
          depth: 1,
          children: ['#/then/allOf/0'],
        }),
        '#/then/allOf/0': node({
          pointer: '#/then/allOf/0',
          format: 'date',
          parent: '#/then',
          depth: 2,
        }),
        '#/allOf/0': node({ pointer: '#/allOf/0', parent: '#', depth: 1 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].underConditional).toBe(true);
    expect(result[0].underThen).toBe(true);
    expect(result[0].underCombinator).toBe(true);
    expect(result[0].combinatorTypes).toContain('allOf');
  });

  it('format with no parent returns depth 0', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', format: 'email', depth: 0 }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result[0].maxAncestorDepth).toBe(0);
  });

  it('non-format nodes with combinators do not produce contexts', () => {
    const m = model({
      nodes: {
        '#': node({
          pointer: '#',
          combinators: { allOf: ['#/allOf/0'] },
          children: ['#/allOf/0'],
        }),
        '#/allOf/0': node({
          pointer: '#/allOf/0',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toEqual([]);
  });

  it('handles format under $defs directly', () => {
    const m = model({
      nodes: {
        '#': node({ pointer: '#', children: ['#/$defs/Email'] }),
        '#/$defs/Email': node({
          pointer: '#/$defs/Email',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = extractFormatStructuralContexts(m);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#/$defs/Email');
    expect(result[0].format).toBe('email');
  });
});

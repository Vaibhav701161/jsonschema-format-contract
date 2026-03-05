import { describe, it, expect } from 'vitest';
import { extractFormatNodes } from './extractFormatNodes';
import type { StructuralModel, SchemaNode } from '../types';

function makeModel(
  nodes: Record<string, SchemaNode>,
  edges: StructuralModel['edges'] = [],
  cycles: string[][] = [],
): StructuralModel {
  return {
    nodes,
    edges,
    cycles,
    missingTargets: [],
    unsupportedKeywords: [],
  };
}

function makeNode(overrides: Partial<SchemaNode> & { pointer: string }): SchemaNode {
  return {
    children: [],
    depth: 0,
    ...overrides,
  };
}

describe('extractFormatNodes', () => {
  it('returns empty array for model with no format nodes', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/name': makeNode({ pointer: '#/properties/name', parent: '#', type: 'string', depth: 1 }),
    });
    const result = extractFormatNodes(model);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty model', () => {
    const model = makeModel({});
    const result = extractFormatNodes(model);
    expect(result).toEqual([]);
  });

  it('extracts a single format node', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#/properties/email');
    expect(result[0].format).toBe('email');
    expect(result[0].type).toBe('string');
    expect(result[0].depth).toBe(1);
  });

  it('extracts multiple format nodes sorted by pointer', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/website': makeNode({
        pointer: '#/properties/website',
        parent: '#',
        type: 'string',
        format: 'uri',
        depth: 1,
      }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(2);
    // Sorted by pointer
    expect(result[0].pointer).toBe('#/properties/email');
    expect(result[1].pointer).toBe('#/properties/website');
  });

  it('detects required property status', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object', required: ['email'] }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
      '#/properties/website': makeNode({
        pointer: '#/properties/website',
        parent: '#',
        type: 'string',
        format: 'uri',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(2);
    const email = result.find(n => n.pointer === '#/properties/email');
    const website = result.find(n => n.pointer === '#/properties/website');
    expect(email?.required).toBe(true);
    expect(website?.required).toBe(false);
  });

  it('computes combinator context for format under oneOf', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1'] },
      }),
      '#/oneOf/0': makeNode({
        pointer: '#/oneOf/0',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorContext).toContain('oneOf');
  });

  it('computes combinator context for nested anyOf inside oneOf', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0'] },
      }),
      '#/oneOf/0': makeNode({
        pointer: '#/oneOf/0',
        parent: '#',
        type: 'object',
        combinators: { anyOf: ['#/oneOf/0/anyOf/0'] },
        depth: 1,
      }),
      '#/oneOf/0/anyOf/0': makeNode({
        pointer: '#/oneOf/0/anyOf/0',
        parent: '#/oneOf/0',
        type: 'string',
        format: 'uri',
        depth: 2,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    // Root-first order
    expect(result[0].combinatorContext).toEqual(['oneOf', 'anyOf']);
  });

  it('computes combinator context for if/then/else', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { if: '#/if', then: '#/then' },
      }),
      '#/then': makeNode({
        pointer: '#/then',
        parent: '#',
        type: 'string',
        format: 'date-time',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorContext).toContain('if');
    expect(result[0].combinatorContext).toContain('then');
  });

  it('computes ref depth for format behind $ref', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/properties/contact': makeNode({
          pointer: '#/properties/contact',
          parent: '#',
          ref: '#/$defs/EmailType',
          depth: 1,
        }),
        '#/$defs/EmailType': makeNode({
          pointer: '#/$defs/EmailType',
          type: 'string',
          format: 'email',
          depth: 1,
        }),
      },
      [{ from: '#/properties/contact', to: '#/$defs/EmailType', status: 'normal' }],
    );
    const result = extractFormatNodes(model);
    // The format is on the $defs node, not the ref node
    const emailDef = result.find(n => n.pointer === '#/$defs/EmailType');
    expect(emailDef).toBeDefined();
    expect(emailDef!.format).toBe('email');
  });

  it('computes ref depth for chained $refs', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/properties/a': makeNode({
          pointer: '#/properties/a',
          parent: '#',
          ref: '#/$defs/B',
          depth: 1,
        }),
        '#/$defs/B': makeNode({
          pointer: '#/$defs/B',
          ref: '#/$defs/C',
          depth: 1,
        }),
        '#/$defs/C': makeNode({
          pointer: '#/$defs/C',
          type: 'string',
          format: 'uri',
          depth: 1,
        }),
      },
      [
        { from: '#/properties/a', to: '#/$defs/B', status: 'normal' },
        { from: '#/$defs/B', to: '#/$defs/C', status: 'normal' },
      ],
    );
    const result = extractFormatNodes(model);
    const cNode = result.find(n => n.pointer === '#/$defs/C');
    expect(cNode).toBeDefined();
    expect(cNode!.refDepth).toBe(0); // C itself has no ref
  });

  it('handles format node with refDepth > 0', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/properties/x': makeNode({
          pointer: '#/properties/x',
          parent: '#',
          ref: '#/$defs/Y',
          type: 'string',
          format: 'date',
          depth: 1,
        }),
        '#/$defs/Y': makeNode({
          pointer: '#/$defs/Y',
          type: 'string',
          format: 'date',
          depth: 1,
        }),
      },
      [{ from: '#/properties/x', to: '#/$defs/Y', status: 'normal' }],
    );
    const result = extractFormatNodes(model);
    const x = result.find(n => n.pointer === '#/properties/x');
    expect(x).toBeDefined();
    expect(x!.refDepth).toBe(1);
  });

  it('sets depth from node', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/nested/properties/deep': makeNode({
        pointer: '#/properties/nested/properties/deep',
        parent: '#/properties/nested',
        type: 'string',
        format: 'hostname',
        depth: 3,
      }),
      '#/properties/nested': makeNode({
        pointer: '#/properties/nested',
        parent: '#',
        type: 'object',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].depth).toBe(3);
  });

  it('preserves type as array for union types', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/val': makeNode({
        pointer: '#/properties/val',
        parent: '#',
        type: ['string', 'null'],
        format: 'email',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].type).toEqual(['string', 'null']);
  });

  it('handles allOf combinator context', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { allOf: ['#/allOf/0', '#/allOf/1'] },
      }),
      '#/allOf/0': makeNode({
        pointer: '#/allOf/0',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorContext).toContain('allOf');
  });

  it('handles not combinator context', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { not: '#/not' },
      }),
      '#/not': makeNode({
        pointer: '#/not',
        parent: '#',
        type: 'string',
        format: 'ipv4',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorContext).toContain('not');
  });

  it('deterministic output across multiple runs', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/z': makeNode({
        pointer: '#/properties/z',
        parent: '#',
        type: 'string',
        format: 'uri',
        depth: 1,
      }),
      '#/properties/a': makeNode({
        pointer: '#/properties/a',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
      '#/properties/m': makeNode({
        pointer: '#/properties/m',
        parent: '#',
        type: 'string',
        format: 'date',
        depth: 1,
      }),
    });
    const run1 = extractFormatNodes(model);
    const run2 = extractFormatNodes(model);
    expect(run1).toEqual(run2);
    expect(run1[0].pointer).toBe('#/properties/a');
    expect(run1[1].pointer).toBe('#/properties/m');
    expect(run1[2].pointer).toBe('#/properties/z');
  });

  it('ignores nodes without format', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/name': makeNode({
        pointer: '#/properties/name',
        parent: '#',
        type: 'string',
        depth: 1,
      }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
      '#/properties/age': makeNode({
        pointer: '#/properties/age',
        parent: '#',
        type: 'integer',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('email');
  });

  it('handles cycle in ref chain without infinite loop', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/$defs/A': makeNode({
          pointer: '#/$defs/A',
          ref: '#/$defs/B',
          type: 'string',
          format: 'email',
          depth: 1,
        }),
        '#/$defs/B': makeNode({
          pointer: '#/$defs/B',
          ref: '#/$defs/A',
          depth: 1,
        }),
      },
      [
        { from: '#/$defs/A', to: '#/$defs/B', status: 'cycle' },
        { from: '#/$defs/B', to: '#/$defs/A', status: 'cycle' },
      ],
      [['#/$defs/A', '#/$defs/B']],
    );
    // Should not hang - ref cycle protection
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#/$defs/A');
    expect(result[0].refDepth).toBeGreaterThanOrEqual(1);
  });

  it('handles formats at root level', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'string',
        format: 'date',
        depth: 0,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#');
    expect(result[0].depth).toBe(0);
    expect(result[0].required).toBe(false);
    expect(result[0].combinatorContext).toEqual([]);
  });

  it('handles custom/unknown format strings', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/custom': makeNode({
        pointer: '#/properties/custom',
        parent: '#',
        type: 'string',
        format: 'my-custom-format',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('my-custom-format');
  });

  it('does not report required for non-properties paths', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object', required: ['items'] }),
      '#/items': makeNode({
        pointer: '#/items',
        parent: '#',
        type: 'string',
        format: 'date-time',
        depth: 1,
      }),
    });
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    // items is not under properties/
    expect(result[0].required).toBe(false);
  });
});

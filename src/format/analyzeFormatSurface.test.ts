import { describe, it, expect } from 'vitest';
import { analyzeFormatSurface } from './analyzeFormatSurface';
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

describe('analyzeFormatSurface', () => {
  it('returns empty array for model with no formats', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
    });
    expect(analyzeFormatSurface(model)).toEqual([]);
  });

  it('returns empty array for empty model', () => {
    const model = makeModel({});
    expect(analyzeFormatSurface(model)).toEqual([]);
  });

  it('returns report for single simple format', () => {
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
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('email');
    expect(result[0].pointer).toBe('#/properties/email');
    expect(result[0].branchDepth).toBe(0);
    expect(result[0].refDepth).toBe(0);
    expect(result[0].combinatorDepth).toBe(0);
    expect(result[0].fanOut).toBe(0);
    expect(result[0].riskScore).toBe(0);
  });

  it('computes branch depth from parent oneOf', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1', '#/oneOf/2'] },
      }),
      '#/oneOf/0': makeNode({
        pointer: '#/oneOf/0',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
      '#/oneOf/1': makeNode({
        pointer: '#/oneOf/1',
        parent: '#',
        type: 'string',
        depth: 1,
      }),
      '#/oneOf/2': makeNode({
        pointer: '#/oneOf/2',
        parent: '#',
        type: 'string',
        depth: 1,
      }),
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    expect(result[0].branchDepth).toBeGreaterThan(0);
  });

  it('computes combinator depth from nested combinators', () => {
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
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    expect(result[0].combinatorDepth).toBe(2); // two ancestor nodes with combinators
  });

  it('computes fan-out for format in a referenced definition', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/properties/a': makeNode({
          pointer: '#/properties/a',
          parent: '#',
          ref: '#/$defs/Email',
          depth: 1,
        }),
        '#/properties/b': makeNode({
          pointer: '#/properties/b',
          parent: '#',
          ref: '#/$defs/Email',
          depth: 1,
        }),
        '#/$defs/Email': makeNode({
          pointer: '#/$defs/Email',
          type: 'string',
          format: 'email',
          depth: 1,
        }),
      },
      [
        { from: '#/properties/a', to: '#/$defs/Email', status: 'normal' },
        { from: '#/properties/b', to: '#/$defs/Email', status: 'normal' },
      ],
    );
    const result = analyzeFormatSurface(model);
    const emailReport = result.find(r => r.format === 'email');
    expect(emailReport).toBeDefined();
    expect(emailReport!.fanOut).toBe(2); // two refs point to same def
  });

  it('computes risk score with default weights', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1', '#/oneOf/2'] },
      }),
      '#/oneOf/0': makeNode({
        pointer: '#/oneOf/0',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    // branch=3 (from oneOf), combinator=1 (parent has combinator)
    // default: branchWeight=2, refWeight=3, combinatorWeight=2, fanOutWeight=1
    // score = 3*2 + 0*3 + 1*2 + 0*1 = 8
    expect(result[0].riskScore).toBe(8);
  });

  it('applies custom risk weights', () => {
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
    const result = analyzeFormatSurface(model, {
      branchDepthWeight: 10,
      refDepthWeight: 10,
      combinatorDepthWeight: 10,
      fanOutWeight: 10,
    });
    expect(result).toHaveLength(1);
    // All zeros, so score should be 0 regardless of weights
    expect(result[0].riskScore).toBe(0);
  });

  it('caps risk score at 100', () => {
    // Create a model with extreme combinator nesting
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: {
          oneOf: Array.from({ length: 20 }, (_, i) => `#/oneOf/${i}`),
          anyOf: Array.from({ length: 20 }, (_, i) => `#/anyOf/${i}`),
        },
      }),
      '#/oneOf/0': makeNode({
        pointer: '#/oneOf/0',
        parent: '#',
        type: 'object',
        combinators: {
          oneOf: Array.from({ length: 20 }, (_, i) => `#/oneOf/0/oneOf/${i}`),
        },
        depth: 1,
      }),
      '#/oneOf/0/oneOf/0': makeNode({
        pointer: '#/oneOf/0/oneOf/0',
        parent: '#/oneOf/0',
        type: 'string',
        format: 'email',
        depth: 2,
      }),
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    expect(result[0].riskScore).toBeLessThanOrEqual(100);
  });

  it('returns sorted results by pointer', () => {
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
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(2);
    expect(result[0].pointer).toBe('#/properties/a');
    expect(result[1].pointer).toBe('#/properties/z');
  });

  it('is deterministic across multiple runs', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/b': makeNode({
        pointer: '#/properties/b',
        parent: '#',
        type: 'string',
        format: 'date',
        depth: 1,
      }),
      '#/properties/a': makeNode({
        pointer: '#/properties/a',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const run1 = analyzeFormatSurface(model);
    const run2 = analyzeFormatSurface(model);
    expect(run1).toEqual(run2);
  });

  it('computes risk for format in if/then/else context', () => {
    const model = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { if: '#/if', then: '#/then', else: '#/else' },
      }),
      '#/then': makeNode({
        pointer: '#/then',
        parent: '#',
        type: 'string',
        format: 'date-time',
        depth: 1,
      }),
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    // if+then+else contributes to branch depth
    expect(result[0].branchDepth).toBeGreaterThan(0);
    expect(result[0].combinatorDepth).toBe(1);
    expect(result[0].riskScore).toBeGreaterThan(0);
  });

  it('computes risk for allOf combinator', () => {
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
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    expect(result[0].branchDepth).toBeGreaterThan(0);
    expect(result[0].combinatorDepth).toBe(1);
  });

  it('handles deeply nested format with multiple risk factors', () => {
    const model = makeModel(
      {
        '#': makeNode({
          pointer: '#',
          type: 'object',
          combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1'] },
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
          type: 'object',
          depth: 2,
        }),
        '#/oneOf/0/anyOf/0/properties/val': makeNode({
          pointer: '#/oneOf/0/anyOf/0/properties/val',
          parent: '#/oneOf/0/anyOf/0',
          type: 'string',
          format: 'uri',
          depth: 3,
        }),
      },
      [],
    );
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    // Two levels of combinators (oneOf, anyOf)
    expect(result[0].combinatorDepth).toBe(2);
    // Branch depth should accumulate from both levels
    expect(result[0].branchDepth).toBeGreaterThan(0);
    expect(result[0].riskScore).toBeGreaterThan(0);
  });

  it('assigns zero fan-out when no refs exist', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/val': makeNode({
        pointer: '#/properties/val',
        parent: '#',
        type: 'string',
        format: 'date',
        depth: 1,
      }),
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(1);
    expect(result[0].fanOut).toBe(0);
  });

  it('risk score reflects ref depth weight', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/properties/x': makeNode({
          pointer: '#/properties/x',
          parent: '#',
          ref: '#/$defs/Y',
          type: 'string',
          format: 'email',
          depth: 1,
        }),
        '#/$defs/Y': makeNode({
          pointer: '#/$defs/Y',
          type: 'string',
          depth: 1,
        }),
      },
      [{ from: '#/properties/x', to: '#/$defs/Y', status: 'normal' }],
    );
    const result = analyzeFormatSurface(model);
    const report = result.find(r => r.pointer === '#/properties/x');
    expect(report).toBeDefined();
    expect(report!.refDepth).toBe(1);
    // refDepth=1 * refDepthWeight=3 = 3 contribution
    expect(report!.riskScore).toBeGreaterThanOrEqual(3);
  });

  it('handles multiple formats with varying risk levels', () => {
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
      '#/properties/simple': makeNode({
        pointer: '#/properties/simple',
        parent: '#',
        type: 'string',
        format: 'date',
        depth: 1,
      }),
    });
    const result = analyzeFormatSurface(model);
    expect(result).toHaveLength(2);
    const email = result.find(r => r.format === 'email');
    const date = result.find(r => r.format === 'date');
    expect(email).toBeDefined();
    expect(date).toBeDefined();
    // email is under oneOf so should have higher risk
    expect(email!.riskScore).toBeGreaterThanOrEqual(date!.riskScore);
  });
});

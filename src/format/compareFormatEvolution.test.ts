import { describe, it, expect } from 'vitest';
import { compareFormatEvolution } from './compareFormatEvolution';
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

describe('compareFormatEvolution', () => {
  it('returns all-empty for identical models with no formats', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
    });
    const result = compareFormatEvolution(model, model);
    expect(result.addedFormats).toEqual([]);
    expect(result.removedFormats).toEqual([]);
    expect(result.modifiedFormats).toEqual([]);
    expect(result.breakingChanges).toEqual([]);
    expect(result.riskChanges).toEqual([]);
  });

  it('returns all-empty for identical models with formats', () => {
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
    const result = compareFormatEvolution(model, model);
    expect(result.addedFormats).toEqual([]);
    expect(result.removedFormats).toEqual([]);
    expect(result.modifiedFormats).toEqual([]);
    expect(result.breakingChanges).toEqual([]);
  });

  it('detects format added to existing node as breaking', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.addedFormats).toHaveLength(1);
    expect(result.addedFormats[0].format).toBe('email');
    expect(result.breakingChanges.some(c => c.ruleId === 'format-added')).toBe(true);
  });

  it('detects format removed from existing node as breaking', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.removedFormats).toHaveLength(1);
    expect(result.removedFormats[0].format).toBe('email');
    expect(result.breakingChanges.some(c => c.ruleId === 'format-removed')).toBe(true);
  });

  it('detects format changed as breaking', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/contact': makeNode({
        pointer: '#/properties/contact',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/contact': makeNode({
        pointer: '#/properties/contact',
        parent: '#',
        type: 'string',
        format: 'uri',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.modifiedFormats).toHaveLength(1);
    expect(result.modifiedFormats[0].oldFormat).toBe('email');
    expect(result.modifiedFormats[0].newFormat).toBe('uri');
    expect(result.breakingChanges.some(c => c.ruleId === 'format-changed')).toBe(true);
  });

  it('detects type narrowed while format preserved as breaking', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/val': makeNode({
        pointer: '#/properties/val',
        parent: '#',
        type: ['string', 'null'],
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/val': makeNode({
        pointer: '#/properties/val',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.breakingChanges.some(c => c.ruleId === 'format-type-narrowed')).toBe(true);
  });

  it('does not flag type widened as breaking', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/val': makeNode({
        pointer: '#/properties/val',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/val': makeNode({
        pointer: '#/properties/val',
        parent: '#',
        type: ['string', 'null'],
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.breakingChanges.some(c => c.ruleId === 'format-type-narrowed')).toBe(false);
  });

  it('detects combinator context change as breaking', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0'] },
      }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.breakingChanges.some(c => c.ruleId === 'format-combinator-context-changed')).toBe(true);
  });

  it('does not report breaking when node is entirely new', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.addedFormats).toHaveLength(1);
    // Not breaking because the node didn't exist before
    expect(result.breakingChanges.some(c => c.ruleId === 'format-added')).toBe(false);
  });

  it('does not report format-removed when node is entirely removed', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.removedFormats).toHaveLength(1);
    // Node was entirely removed, so format-removed shouldn't fire
    expect(result.breakingChanges.some(c => c.ruleId === 'format-removed')).toBe(false);
  });

  it('detects combinator depth increase as risk', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0'] },
      }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.riskChanges.some(c => c.ruleId === 'format-combinator-depth-increased')).toBe(true);
  });

  it('detects fan-out increase as risk', () => {
    const oldModel = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/$defs/Email': makeNode({
          pointer: '#/$defs/Email',
          type: 'string',
          format: 'email',
          depth: 1,
        }),
        '#/properties/a': makeNode({
          pointer: '#/properties/a',
          parent: '#',
          ref: '#/$defs/Email',
          depth: 1,
        }),
      },
      [{ from: '#/properties/a', to: '#/$defs/Email', status: 'normal' }],
    );
    const newModel = makeModel(
      {
        '#': makeNode({ pointer: '#', type: 'object' }),
        '#/$defs/Email': makeNode({
          pointer: '#/$defs/Email',
          type: 'string',
          format: 'email',
          depth: 1,
        }),
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
      },
      [
        { from: '#/properties/a', to: '#/$defs/Email', status: 'normal' },
        { from: '#/properties/b', to: '#/$defs/Email', status: 'normal' },
      ],
    );
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.riskChanges.some(c => c.ruleId === 'format-fan-out-increased')).toBe(true);
  });

  it('handles multiple simultaneous changes', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
      '#/properties/old': makeNode({
        pointer: '#/properties/old',
        parent: '#',
        type: 'string',
        format: 'hostname',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'uri',
        depth: 1,
      }),
      '#/properties/new': makeNode({
        pointer: '#/properties/new',
        parent: '#',
        type: 'string',
        format: 'date',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    // email changed, old removed (node also removed), new added (node also new)
    expect(result.modifiedFormats).toHaveLength(1);
    expect(result.removedFormats).toHaveLength(1);
    expect(result.addedFormats).toHaveLength(1);
  });

  it('produces sorted output', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
    });
    const newModel = makeModel({
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
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.addedFormats[0].pointer).toBe('#/properties/a');
    expect(result.addedFormats[1].pointer).toBe('#/properties/z');
  });

  it('is deterministic across multiple runs', () => {
    const oldModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'uri',
        depth: 1,
      }),
    });
    const run1 = compareFormatEvolution(oldModel, newModel);
    const run2 = compareFormatEvolution(oldModel, newModel);
    expect(run1.breakingChanges).toEqual(run2.breakingChanges);
    expect(run1.riskChanges).toEqual(run2.riskChanges);
    expect(run1.addedFormats).toEqual(run2.addedFormats);
    expect(run1.removedFormats).toEqual(run2.removedFormats);
    expect(run1.modifiedFormats).toEqual(run2.modifiedFormats);
  });

  it('detects no breaking when combinator context decreases', () => {
    const oldModel = makeModel({
      '#': makeNode({
        pointer: '#',
        type: 'object',
        combinators: { oneOf: ['#/oneOf/0'] },
      }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const newModel = makeModel({
      '#': makeNode({ pointer: '#', type: 'object' }),
      '#/properties/email': makeNode({
        pointer: '#/properties/email',
        parent: '#',
        type: 'string',
        format: 'email',
        depth: 1,
      }),
    });
    const result = compareFormatEvolution(oldModel, newModel);
    // Context decreased - not breaking (combinator-context-changed only fires when context increases)
    expect(result.breakingChanges.some(c => c.ruleId === 'format-combinator-context-changed')).toBe(false);
  });

  it('handles empty models', () => {
    const empty = makeModel({});
    const result = compareFormatEvolution(empty, empty);
    expect(result.addedFormats).toEqual([]);
    expect(result.removedFormats).toEqual([]);
    expect(result.modifiedFormats).toEqual([]);
    expect(result.breakingChanges).toEqual([]);
    expect(result.riskChanges).toEqual([]);
  });
});

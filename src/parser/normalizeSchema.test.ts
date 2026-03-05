import { describe, it, expect } from 'vitest';
import { normalizeSchema } from './normalizeSchema';
import { buildPointerIndex } from './buildPointerIndex';
import type { SchemaNode } from '../types';

describe('normalizeSchema', () => {

  it('returns a StructuralModel with nodes populated', () => {
    const schema = {
      properties: {
        a: { type: 'string' },
      },
    };
    const nodes = buildPointerIndex(schema);
    const model = normalizeSchema(nodes);

    expect(model.nodes).toBe(nodes);
    expect(Object.keys(model.nodes)).toHaveLength(2);
  });

  it('initializes edges as empty array', () => {
    const nodes = buildPointerIndex({ type: 'object' });
    const model = normalizeSchema(nodes);
    expect(model.edges).toEqual([]);
  });

  it('initializes cycles as empty array', () => {
    const nodes = buildPointerIndex({ type: 'object' });
    const model = normalizeSchema(nodes);
    expect(model.cycles).toEqual([]);
  });

  it('initializes missingTargets as empty array', () => {
    const nodes = buildPointerIndex({ type: 'object' });
    const model = normalizeSchema(nodes);
    expect(model.missingTargets).toEqual([]);
  });

  it('captures unsupported keywords from traversal', () => {
    const schema = {
      $dynamicRef: '#meta',
      type: 'object',
    };
    const nodes = buildPointerIndex(schema);
    const model = normalizeSchema(nodes);

    expect(model.unsupportedKeywords).toContain('$dynamicRef');
  });

  it('passes validation for a well-formed node map', () => {
    const schema = {
      $defs: {
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
      },
    };
    const nodes = buildPointerIndex(schema);

    // Should not throw
    expect(() => normalizeSchema(nodes)).not.toThrow();
  });

  it('throws on orphaned child pointer', () => {
    const nodes: Record<string, SchemaNode> = {
      '#': {
        pointer: '#',
        children: ['#/properties/missing'],
        depth: 0,
      },
    };

    expect(() => normalizeSchema(nodes)).toThrow(/Integrity error/);
  });

  it('throws on missing parent pointer', () => {
    const nodes: Record<string, SchemaNode> = {
      '#/properties/a': {
        pointer: '#/properties/a',
        parent: '#/nonexistent',
        children: [],
        depth: 1,
      },
    };

    expect(() => normalizeSchema(nodes)).toThrow(/Integrity error/);
  });

  it('produces a valid model from a complex schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        items: {
          type: 'array',
          items: {
            allOf: [
              { type: 'object' },
              { $ref: '#/$defs/Base' },
            ],
          },
        },
      },
      $defs: {
        Base: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
      },
    };
    const nodes = buildPointerIndex(schema);
    const model = normalizeSchema(nodes);

    // Model is structurally valid
    expect(model.edges).toEqual([]);
    expect(model.cycles).toEqual([]);
    expect(model.missingTargets).toEqual([]);

    // All expected nodes exist
    expect(model.nodes['#']).toBeDefined();
    expect(model.nodes['#/properties/name']).toBeDefined();
    expect(model.nodes['#/properties/items']).toBeDefined();
    expect(model.nodes['#/properties/items/items']).toBeDefined();
    expect(model.nodes['#/properties/items/items/allOf/0']).toBeDefined();
    expect(model.nodes['#/properties/items/items/allOf/1']).toBeDefined();
    expect(model.nodes['#/$defs/Base']).toBeDefined();
    expect(model.nodes['#/$defs/Base/properties/id']).toBeDefined();
  });
});

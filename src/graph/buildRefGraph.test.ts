import { describe, it, expect } from 'vitest';
import { buildRefGraph } from './buildRefGraph';
import { buildPointerIndex } from '../parser/buildPointerIndex';
import { normalizeSchema } from '../parser/normalizeSchema';
import type { StructuralModel } from '../types';

/**
 * Helper: build a StructuralModel from a raw schema object.
 */
function modelFrom(schema: unknown): StructuralModel {
  const nodes = buildPointerIndex(schema);
  return normalizeSchema(nodes);
}

describe('buildRefGraph', () => {

  it('creates a normal edge for a valid internal $ref', () => {
    const schema = {
      $defs: {
        Task: { type: 'object' },
      },
      properties: {
        task: { $ref: '#/$defs/Task' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toEqual({
      from: '#/properties/task',
      to: '#/$defs/Task',
      status: 'normal',
    });
    expect(model.missingTargets).toEqual([]);
  });

  it('creates a missing edge and records missing target for non-existent $ref', () => {
    const schema = {
      properties: {
        item: { $ref: '#/$defs/NonExistent' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toEqual({
      from: '#/properties/item',
      to: '#/$defs/NonExistent',
      status: 'missing',
    });
    expect(model.missingTargets).toContain('#/$defs/NonExistent');
  });

  it('skips non-internal refs and logs them to unsupportedKeywords', () => {
    const schema = {
      properties: {
        ext: { $ref: 'http://example.com/schema.json' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    // No edges created for external refs
    expect(model.edges).toHaveLength(0);
    expect(model.missingTargets).toEqual([]);

    // External ref logged
    expect(model.unsupportedKeywords).toContain(
      'http://example.com/schema.json',
    );
  });

  it('skips relative file path refs', () => {
    const schema = {
      properties: {
        ext: { $ref: './other.json' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    expect(model.edges).toHaveLength(0);
    expect(model.unsupportedKeywords).toContain('./other.json');
  });

  it('handles multiple $ref values in one schema', () => {
    const schema = {
      $defs: {
        A: { type: 'string' },
        B: { type: 'number' },
      },
      properties: {
        x: { $ref: '#/$defs/A' },
        y: { $ref: '#/$defs/B' },
        z: { $ref: '#/$defs/Missing' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    const normal = model.edges.filter((e) => e.status === 'normal');
    const missing = model.edges.filter((e) => e.status === 'missing');

    expect(normal).toHaveLength(2);
    expect(missing).toHaveLength(1);
    expect(model.missingTargets).toEqual(['#/$defs/Missing']);
  });

  it('returns empty edges for schema with no refs', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    expect(model.edges).toEqual([]);
    expect(model.missingTargets).toEqual([]);
  });

  it('does not mutate the input model', () => {
    const schema = {
      $defs: {
        A: { type: 'string' },
      },
      properties: {
        x: { $ref: '#/$defs/A' },
      },
    };
    const original = modelFrom(schema);
    const edgesBefore = [...original.edges];
    const missingBefore = [...original.missingTargets];

    buildRefGraph(original);

    expect(original.edges).toEqual(edgesBefore);
    expect(original.missingTargets).toEqual(missingBefore);
  });

  it('does not duplicate missing targets for the same $ref value', () => {
    const schema = {
      properties: {
        a: { $ref: '#/$defs/Missing' },
        b: { $ref: '#/$defs/Missing' },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    expect(model.missingTargets).toHaveLength(1);
    expect(model.missingTargets[0]).toBe('#/$defs/Missing');
    expect(model.edges.filter((e) => e.status === 'missing')).toHaveLength(2);
  });

  it('creates a normal edge for a self-referencing $ref', () => {
    const schema = {
      $defs: {
        Recursive: {
          type: 'object',
          properties: {
            child: { $ref: '#/$defs/Recursive' },
          },
        },
      },
    };
    const model = buildRefGraph(modelFrom(schema));

    const edge = model.edges.find(
      (e) => e.from === '#/$defs/Recursive/properties/child',
    );
    expect(edge).toBeDefined();
    expect(edge!.to).toBe('#/$defs/Recursive');
    expect(edge!.status).toBe('normal');
  });
});

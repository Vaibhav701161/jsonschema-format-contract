import { describe, it, expect } from 'vitest';
import { detectCycles } from './detectCycles';
import { buildRefGraph } from './buildRefGraph';
import { buildPointerIndex } from '../parser/buildPointerIndex';
import { normalizeSchema } from '../parser/normalizeSchema';
import type { StructuralModel } from '../types';

/**
 * Helper: build a StructuralModel with edges from a raw schema.
 */
function modelWithEdges(schema: unknown): StructuralModel {
  const nodes = buildPointerIndex(schema);
  const skeleton = normalizeSchema(nodes);
  return buildRefGraph(skeleton);
}

describe('detectCycles', () => {

  it('returns empty cycles for a schema with no circular refs', () => {
    const schema = {
      $defs: {
        A: { type: 'string' },
      },
      properties: {
        x: { $ref: '#/$defs/A' },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    expect(model.cycles).toEqual([]);
    expect(model.edges.every((e) => e.status === 'normal')).toBe(true);
  });

  it('detects a simple cycle (A → B → A)', () => {
    const schema = {
      $defs: {
        A: {
          type: 'object',
          properties: {
            toB: { $ref: '#/$defs/B' },
          },
        },
        B: {
          type: 'object',
          properties: {
            toA: { $ref: '#/$defs/A' },
          },
        },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    // At least one cycle detected
    expect(model.cycles.length).toBeGreaterThanOrEqual(1);

    // At least one edge marked as 'cycle'
    const cycleEdges = model.edges.filter((e) => e.status === 'cycle');
    expect(cycleEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a self-referencing cycle', () => {
    const schema = {
      $defs: {
        Recursive: {
          type: 'object',
          properties: {
            self: { $ref: '#/$defs/Recursive' },
          },
        },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    expect(model.cycles.length).toBeGreaterThanOrEqual(1);

    const cycleEdges = model.edges.filter((e) => e.status === 'cycle');
    expect(cycleEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('does not include missing edges in cycle detection', () => {
    const schema = {
      properties: {
        x: { $ref: '#/$defs/NonExistent' },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    expect(model.cycles).toEqual([]);
    // Missing edge should still be 'missing'
    const missingEdges = model.edges.filter((e) => e.status === 'missing');
    expect(missingEdges).toHaveLength(1);
  });

  it('cycle path contains the pointers involved in the cycle', () => {
    const schema = {
      $defs: {
        A: {
          type: 'object',
          properties: {
            toB: { $ref: '#/$defs/B' },
          },
        },
        B: {
          type: 'object',
          properties: {
            toA: { $ref: '#/$defs/A' },
          },
        },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    expect(model.cycles.length).toBeGreaterThanOrEqual(1);

    // At least one cycle should contain pointers related to A and B
    const allCyclePointers = model.cycles.flat();
    const hasAOrB =
      allCyclePointers.some((p) => p.includes('$defs/A')) ||
      allCyclePointers.some((p) => p.includes('$defs/B'));
    expect(hasAOrB).toBe(true);
  });

  it('does not mutate the input model', () => {
    const schema = {
      $defs: {
        A: {
          type: 'object',
          properties: {
            toB: { $ref: '#/$defs/B' },
          },
        },
        B: {
          type: 'object',
          properties: {
            toA: { $ref: '#/$defs/A' },
          },
        },
      },
    };
    const original = modelWithEdges(schema);
    const edgesBefore = original.edges.map((e) => ({ ...e }));
    const cyclesBefore = [...original.cycles];

    detectCycles(original);

    // Original model should be unchanged
    expect(original.edges).toEqual(edgesBefore);
    expect(original.cycles).toEqual(cyclesBefore);
  });

  it('handles schema with no refs gracefully', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    expect(model.cycles).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it('detects a three-node cycle (A → B → C → A)', () => {
    const schema = {
      $defs: {
        A: {
          type: 'object',
          properties: {
            toB: { $ref: '#/$defs/B' },
          },
        },
        B: {
          type: 'object',
          properties: {
            toC: { $ref: '#/$defs/C' },
          },
        },
        C: {
          type: 'object',
          properties: {
            toA: { $ref: '#/$defs/A' },
          },
        },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    expect(model.cycles.length).toBeGreaterThanOrEqual(1);

    const cycleEdges = model.edges.filter((e) => e.status === 'cycle');
    expect(cycleEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('only marks cycle edges, leaves other edges as normal', () => {
    const schema = {
      $defs: {
        A: {
          type: 'object',
          properties: {
            toB: { $ref: '#/$defs/B' },
          },
        },
        B: {
          type: 'object',
          properties: {
            toA: { $ref: '#/$defs/A' },
          },
        },
        Standalone: { type: 'string' },
      },
      properties: {
        s: { $ref: '#/$defs/Standalone' },
      },
    };
    const model = detectCycles(modelWithEdges(schema));

    // The standalone ref should still be normal
    const standaloneEdge = model.edges.find(
      (e) => e.from === '#/properties/s',
    );
    expect(standaloneEdge).toBeDefined();
    expect(standaloneEdge!.status).toBe('normal');

    // Cycle edges should exist
    const cycleEdges = model.edges.filter((e) => e.status === 'cycle');
    expect(cycleEdges.length).toBeGreaterThanOrEqual(1);
  });
});

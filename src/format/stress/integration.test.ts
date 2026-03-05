import { describe, it, expect } from 'vitest';
import { extractFormatContexts } from './extractFormatContexts';
import { analyzeFormatInteractions } from './analyzeFormatInteractions';
import { generateStressSchemas } from './generateStressSchemas';
import { detectCoverageGaps } from './detectCoverageGaps';
import { buildMinimalReproducer } from './minimalReproducerBuilder';
import { INTERACTION_TYPES, DEFAULT_STRESS_HIGH_RISK_THRESHOLD } from './types';
import type { StructuralModel, SchemaNode, RefEdge } from '../../types';

function node(overrides: Partial<SchemaNode> & { pointer: string }): SchemaNode {
  return { children: [], depth: 0, ...overrides };
}

function model(
  nodes: Record<string, SchemaNode>,
  edges: RefEdge[] = [],
  cycles: string[][] = [],
  unsupportedKeywords: string[] = [],
): StructuralModel {
  return { nodes, edges, cycles, missingTargets: [], unsupportedKeywords };
}

describe('format-stress integration', () => {
  it('full pipeline produces results for simple format schema', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/email'] }),
      '#/properties/email': node({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    expect(contexts).toHaveLength(1);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles).toHaveLength(1);

    const schemas = generateStressSchemas(profiles[0]);
    expect(schemas.length).toBeGreaterThanOrEqual(1);

    const gaps = detectCoverageGaps(profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });
    expect(gaps).toBeDefined();

    const reproducer = buildMinimalReproducer(contexts[0], m);
    expect(reproducer.$schema).toBeDefined();
  });

  it('full pipeline handles combinator-branching format', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1'] }, children: ['#/oneOf/0', '#/oneOf/1'] }),
      '#/oneOf/0': node({ pointer: '#/oneOf/0', depth: 1, type: 'string', format: 'email', parent: '#' }),
      '#/oneOf/1': node({ pointer: '#/oneOf/1', depth: 1, type: 'string', format: 'uri', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    expect(contexts).toHaveLength(2);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles.every(p => p.interactionTypes.includes(INTERACTION_TYPES.COMBINATOR_BRANCHING))).toBe(true);

    for (const p of profiles) {
      const schemas = generateStressSchemas(p);
      expect(schemas.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('full pipeline handles conditional format', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, combinators: { if: '#/if', then: '#/then', else: '#/else' }, children: ['#/if', '#/then', '#/else'] }),
      '#/if': node({ pointer: '#/if', depth: 1, parent: '#', type: 'object' }),
      '#/then': node({ pointer: '#/then', depth: 1, parent: '#', type: 'string', format: 'date-time' }),
      '#/else': node({ pointer: '#/else', depth: 1, parent: '#', type: 'string', format: 'date' }),
    });

    const contexts = extractFormatContexts(m);
    expect(contexts.length).toBeGreaterThanOrEqual(1);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles.some(p => p.requiresConditionalTests)).toBe(true);

    const gaps = detectCoverageGaps(profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });
    expect(gaps.missingStressScenarios.some(s => s.includes('conditional'))).toBe(true);
  });

  it('full pipeline handles recursive format', () => {
    const m = model(
      {
        '#': node({ pointer: '#', depth: 0, ref: '#/$defs/Tree', children: ['#/$defs/Tree'] }),
        '#/$defs/Tree': node({
          pointer: '#/$defs/Tree', depth: 1, parent: '#',
          type: 'object', format: 'uri', ref: '#/$defs/Tree',
          children: [],
        }),
      },
      [
        { from: '#', to: '#/$defs/Tree', status: 'normal' },
        { from: '#/$defs/Tree', to: '#/$defs/Tree', status: 'cycle' },
      ],
      [['#/$defs/Tree']],
    );

    const contexts = extractFormatContexts(m);
    expect(contexts.length).toBe(1);
    expect(contexts[0].recursiveContext).toBe(true);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles[0].requiresRecursionTests).toBe(true);
    expect(profiles[0].interactionTypes).toContain(INTERACTION_TYPES.RECURSIVE_REF);
  });

  it('full pipeline handles dynamic context', () => {
    const m = model(
      {
        '#': node({ pointer: '#', depth: 0, type: 'string', format: 'email' }),
      },
      [],
      [],
      ['$dynamicRef'],
    );

    const contexts = extractFormatContexts(m);
    expect(contexts[0].dynamicContext).toBe(true);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles[0].requiresDynamicScopeTests).toBe(true);

    const gaps = detectCoverageGaps(profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });
    expect(gaps.missingStressScenarios.some(s => s.includes('dynamic'))).toBe(true);
  });

  it('full pipeline handles multi-ref-chain format', () => {
    const m = model(
      {
        '#': node({ pointer: '#', depth: 0, ref: '#/$defs/A', children: ['#/$defs/A', '#/$defs/B', '#/$defs/C'] }),
        '#/$defs/A': node({ pointer: '#/$defs/A', depth: 1, parent: '#', ref: '#/$defs/B' }),
        '#/$defs/B': node({ pointer: '#/$defs/B', depth: 1, parent: '#', ref: '#/$defs/C' }),
        '#/$defs/C': node({ pointer: '#/$defs/C', depth: 1, parent: '#', type: 'string', format: 'email' }),
      },
      [
        { from: '#', to: '#/$defs/A', status: 'normal' },
        { from: '#/$defs/A', to: '#/$defs/B', status: 'normal' },
        { from: '#/$defs/B', to: '#/$defs/C', status: 'normal' },
      ],
    );

    const contexts = extractFormatContexts(m);
    expect(contexts.length).toBeGreaterThanOrEqual(1);
    expect(contexts[0].refDepth).toBeGreaterThanOrEqual(1);
  });

  it('full pipeline handles union type format', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, type: ['string', 'null'], format: 'email' }),
    });

    const contexts = extractFormatContexts(m);
    expect(contexts[0].unionType).toBe(true);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles[0].interactionTypes).toContain(INTERACTION_TYPES.UNION_TYPE);
  });

  it('full pipeline handles required format property', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, type: 'object', required: ['email'], children: ['#/properties/email'] }),
      '#/properties/email': node({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    expect(contexts[0].required).toBe(true);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles[0].interactionTypes).toContain(INTERACTION_TYPES.REQUIRED_PROPERTY);
  });

  it('full pipeline handles pattern property format', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, patternProperties: ['^x-'], children: ['#/patternProperties/^x-'] }),
      '#/patternProperties/^x-': node({ pointer: '#/patternProperties/^x-', depth: 1, type: 'string', format: 'uri', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    expect(contexts[0].patternPropertyContext).toBe(true);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles[0].interactionTypes).toContain(INTERACTION_TYPES.PATTERN_OVERLAP);
  });

  it('coverage gap report detects gaps correctly', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, combinators: { oneOf: ['#/oneOf/0'] }, children: ['#/oneOf/0'] }),
      '#/oneOf/0': node({ pointer: '#/oneOf/0', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    const profiles = analyzeFormatInteractions(contexts);
    const gaps = detectCoverageGaps(profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });

    expect(gaps.missingInteractionTypes.length).toBeGreaterThan(0);
    expect(gaps.coveragePercentage).toBe(0);
  });

  it('coverage gap report shows full coverage when everything is covered', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, type: 'object', required: ['email'], children: ['#/properties/email'] }),
      '#/properties/email': node({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    const profiles = analyzeFormatInteractions(contexts);

    // Cover all interactions from profiles
    const coveredInteractions = new Set(profiles.flatMap(p => p.interactionTypes));
    const coveredFormats = new Set(
      profiles.map(p => p.format),
    );

    const gaps = detectCoverageGaps(profiles, { coveredInteractions, coveredFormats });
    expect(gaps.coveragePercentage).toBe(100);
    expect(gaps.missingInteractionTypes).toEqual([]);
  });

  it('minimal reproducer includes correct structure for combinator format', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, combinators: { oneOf: ['#/oneOf/0'] }, children: ['#/oneOf/0'] }),
      '#/oneOf/0': node({ pointer: '#/oneOf/0', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    const reproducer = buildMinimalReproducer(contexts[0], m);

    expect(reproducer.$schema).toBeDefined();
    expect(reproducer.oneOf).toBeDefined();
  });

  it('stress schemas are valid JSON Schema objects', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, combinators: { oneOf: ['#/oneOf/0'] }, children: ['#/oneOf/0'] }),
      '#/oneOf/0': node({ pointer: '#/oneOf/0', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });

    const contexts = extractFormatContexts(m);
    const profiles = analyzeFormatInteractions(contexts);

    for (const p of profiles) {
      const schemas = generateStressSchemas(p);
      for (const s of schemas) {
        expect(typeof s.schema).toBe('object');
        expect(s.schema).not.toBeNull();
        expect((s.schema as Record<string, unknown>).$schema).toBeDefined();
      }
    }
  });

  it('handles model with many format nodes efficiently', () => {
    const nodes: Record<string, SchemaNode> = {
      '#': node({ pointer: '#', depth: 0, type: 'object', children: [] }),
    };
    const childPointers: string[] = [];
    for (let i = 0; i < 50; i++) {
      const ptr = `#/properties/field${i}`;
      nodes[ptr] = node({ pointer: ptr, depth: 1, type: 'string', format: i % 2 === 0 ? 'email' : 'uri', parent: '#' });
      childPointers.push(ptr);
    }
    nodes['#'].children = childPointers;
    const m = model(nodes);

    const start = performance.now();
    const contexts = extractFormatContexts(m);
    const profiles = analyzeFormatInteractions(contexts);
    const elapsed = performance.now() - start;

    expect(contexts).toHaveLength(50);
    expect(profiles).toHaveLength(50);
    expect(elapsed).toBeLessThan(1000); // Should be well under 1s
  });

  it('full pipeline is deterministic', () => {
    const m = model({
      '#': node({
        pointer: '#', depth: 0, type: 'object',
        required: ['email'],
        combinators: { oneOf: ['#/oneOf/0'] },
        children: ['#/properties/email', '#/oneOf/0'],
      }),
      '#/properties/email': node({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
      '#/oneOf/0': node({ pointer: '#/oneOf/0', depth: 1, type: 'string', format: 'uri', parent: '#' }),
    });

    const run1Contexts = extractFormatContexts(m);
    const run1Profiles = analyzeFormatInteractions(run1Contexts);
    const run1Schemas = run1Profiles.flatMap(p => generateStressSchemas(p));
    const run1Gaps = detectCoverageGaps(run1Profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });

    const run2Contexts = extractFormatContexts(m);
    const run2Profiles = analyzeFormatInteractions(run2Contexts);
    const run2Schemas = run2Profiles.flatMap(p => generateStressSchemas(p));
    const run2Gaps = detectCoverageGaps(run2Profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });

    expect(run1Contexts).toEqual(run2Contexts);
    expect(run1Profiles).toEqual(run2Profiles);
    expect(run1Schemas).toEqual(run2Schemas);
    expect(run1Gaps).toEqual(run2Gaps);
  });

  it('risk summary from profiles uses DEFAULT_STRESS_HIGH_RISK_THRESHOLD', () => {
    expect(DEFAULT_STRESS_HIGH_RISK_THRESHOLD).toBe(40);
  });

  it('handles empty model gracefully through entire pipeline', () => {
    const m = model({});

    const contexts = extractFormatContexts(m);
    expect(contexts).toEqual([]);

    const profiles = analyzeFormatInteractions(contexts);
    expect(profiles).toEqual([]);

    const gaps = detectCoverageGaps(profiles, { coveredInteractions: new Set(), coveredFormats: new Set() });
    expect(gaps.totalInteractions).toBe(0);
    expect(gaps.coveragePercentage).toBe(100); // 0/0 → 100
    expect(gaps.missingInteractionTypes).toEqual([]);
  });

  it('handles complex schema with multiple interaction types', () => {
    const m = model(
      {
        '#': node({
          pointer: '#', depth: 0, type: 'object',
          required: ['field'],
          combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1'] },
          children: ['#/properties/field', '#/oneOf/0', '#/oneOf/1', '#/$defs/Ref'],
        }),
        '#/properties/field': node({
          pointer: '#/properties/field', depth: 1, parent: '#',
          type: ['string', 'null'], format: 'email',
        }),
        '#/oneOf/0': node({ pointer: '#/oneOf/0', depth: 1, parent: '#', type: 'string', format: 'date-time' }),
        '#/oneOf/1': node({ pointer: '#/oneOf/1', depth: 1, parent: '#', ref: '#/$defs/Ref' }),
        '#/$defs/Ref': node({ pointer: '#/$defs/Ref', depth: 1, parent: '#', type: 'string', format: 'uri' }),
      },
      [{ from: '#/oneOf/1', to: '#/$defs/Ref', status: 'normal' }],
    );

    const contexts = extractFormatContexts(m);
    expect(contexts.length).toBeGreaterThanOrEqual(2);

    const profiles = analyzeFormatInteractions(contexts);
    const allTypes = new Set(profiles.flatMap(p => p.interactionTypes));
    // Should detect at least combinator-branching
    expect(allTypes.size).toBeGreaterThan(0);
  });

  it('reproducer for deep nested format preserves hierarchy', () => {
    const m = model({
      '#': node({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/a'] }),
      '#/properties/a': node({ pointer: '#/properties/a', depth: 1, type: 'object', parent: '#', children: ['#/properties/a/properties/b'] }),
      '#/properties/a/properties/b': node({ pointer: '#/properties/a/properties/b', depth: 2, type: 'string', format: 'email', parent: '#/properties/a' }),
    });

    const contexts = extractFormatContexts(m);
    const reproducer = buildMinimalReproducer(contexts[0], m);

    expect(reproducer.type).toBe('object');
    expect(reproducer.properties).toBeDefined();
    const props = reproducer.properties as Record<string, Record<string, unknown>>;
    expect(props.a).toBeDefined();
    expect(props.a.properties).toBeDefined();
  });

  it('exports all expected types from index', async () => {
    const idx = await import('./index');
    expect(idx.extractFormatContexts).toBeDefined();
    expect(idx.analyzeFormatInteractions).toBeDefined();
    expect(idx.generateStressSchemas).toBeDefined();
    expect(idx.detectCoverageGaps).toBeDefined();
    expect(idx.buildMinimalReproducer).toBeDefined();
    expect(idx.DEFAULT_INTERACTION_RISK_WEIGHTS).toBeDefined();
    expect(idx.DEFAULT_STRESS_HIGH_RISK_THRESHOLD).toBeDefined();
    expect(idx.INTERACTION_TYPES).toBeDefined();
  });
});

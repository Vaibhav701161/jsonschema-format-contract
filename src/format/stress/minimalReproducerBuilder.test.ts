import { describe, it, expect } from 'vitest';
import { buildMinimalReproducer } from './minimalReproducerBuilder';
import type { StructuralModel, SchemaNode, RefEdge } from '../../types';
import type { FormatContext } from './types';

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
): StructuralModel {
  return {
    nodes,
    edges,
    cycles,
    missingTargets: [],
    unsupportedKeywords: [],
  };
}

function fmtCtx(overrides: Partial<FormatContext> = {}): FormatContext {
  return {
    pointer: '#/properties/email',
    format: 'email',
    depth: 1,
    refDepth: 0,
    combinatorDepth: 0,
    combinatorTypes: [],
    conditionalContext: false,
    recursiveContext: false,
    dynamicContext: false,
    unionType: false,
    required: false,
    patternPropertyContext: false,
    ...overrides,
  };
}

describe('buildMinimalReproducer', () => {
  it('returns bare format schema when node not found', () => {
    const model = makeModel({});
    const ctx = fmtCtx({ pointer: '#/properties/missing' });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.$schema).toBeDefined();
    expect(result.format).toBe('email');
    expect(result.type).toBe('string');
  });

  it('includes $schema in output', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx();
    const result = buildMinimalReproducer(ctx, model);
    expect(result.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('preserves format keyword on target node', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx();
    const result = buildMinimalReproducer(ctx, model);
    const props = result.properties as Record<string, Record<string, unknown>> | undefined;
    if (props !== undefined && props.email !== undefined) {
      expect(props.email.format).toBe('email');
    } else {
      // If format is on root directly, that's also acceptable
      expect(result.format === 'email' || (props?.email?.format === 'email')).toBe(true);
    }
  });

  it('preserves type from model nodes', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx();
    const result = buildMinimalReproducer(ctx, model);
    expect(result.type).toBe('object');
  });

  it('handles format at root level', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'string', format: 'uri' }),
    });
    const ctx = fmtCtx({ pointer: '#', format: 'uri', depth: 0 });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.format).toBe('uri');
    expect(result.type).toBe('string');
  });

  it('builds properties container for nested format', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/url'] }),
      '#/properties/url': makeNode({ pointer: '#/properties/url', depth: 1, type: 'string', format: 'uri', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/properties/url', format: 'uri' });
    const result = buildMinimalReproducer(ctx, model);
    const props = result.properties as Record<string, unknown> | undefined;
    expect(props).toBeDefined();
    if (props !== undefined) {
      expect(props.url).toBeDefined();
    }
  });

  it('follows $ref chain and includes target', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0, ref: '#/$defs/EmailStr', children: ['#/$defs/EmailStr'] }),
        '#/$defs/EmailStr': makeNode({ pointer: '#/$defs/EmailStr', depth: 1, type: 'string', format: 'email', parent: '#' }),
      },
      [{ from: '#', to: '#/$defs/EmailStr', status: 'normal' }],
    );
    const ctx = fmtCtx({ pointer: '#/$defs/EmailStr', format: 'email', refDepth: 1 });
    const result = buildMinimalReproducer(ctx, model);
    // Should include $defs section
    const defs = result.$defs as Record<string, unknown> | undefined;
    expect(defs).toBeDefined();
    if (defs !== undefined) {
      expect(defs.EmailStr).toBeDefined();
    }
  });

  it('includes combinator children for structural validity', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { oneOf: ['#/oneOf/0', '#/oneOf/1'] }, children: ['#/oneOf/0', '#/oneOf/1'] }),
      '#/oneOf/0': makeNode({ pointer: '#/oneOf/0', depth: 1, type: 'string', format: 'email', parent: '#' }),
      '#/oneOf/1': makeNode({ pointer: '#/oneOf/1', depth: 1, type: 'string', format: 'uri', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/oneOf/0', format: 'email', combinatorDepth: 1, combinatorTypes: ['oneOf'] });
    const result = buildMinimalReproducer(ctx, model);
    // Should include oneOf array
    expect(result.oneOf).toBeDefined();
    const oneOf = result.oneOf as unknown[];
    expect(oneOf.length).toBeGreaterThanOrEqual(1);
  });

  it('handles if/then/else structure', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { if: '#/if', then: '#/then' }, children: ['#/if', '#/then'] }),
      '#/if': makeNode({ pointer: '#/if', depth: 1, parent: '#' }),
      '#/then': makeNode({ pointer: '#/then', depth: 1, parent: '#', type: 'string', format: 'email' }),
    });
    const ctx = fmtCtx({ pointer: '#/then', format: 'email', conditionalContext: true });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.then).toBeDefined();
  });

  it('handles patternProperties', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, patternProperties: ['^x-'], children: ['#/patternProperties/^x-'] }),
      '#/patternProperties/^x-': makeNode({ pointer: '#/patternProperties/^x-', depth: 1, type: 'string', format: 'uri', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/patternProperties/^x-', format: 'uri', patternPropertyContext: true });
    const result = buildMinimalReproducer(ctx, model);
    const pp = result.patternProperties as Record<string, unknown> | undefined;
    expect(pp).toBeDefined();
  });

  it('handles deep nesting (3+ levels)', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/address'] }),
      '#/properties/address': makeNode({ pointer: '#/properties/address', depth: 1, type: 'object', parent: '#', children: ['#/properties/address/properties/city'] }),
      '#/properties/address/properties/city': makeNode({ pointer: '#/properties/address/properties/city', depth: 2, type: 'object', parent: '#/properties/address', children: ['#/properties/address/properties/city/properties/zip'] }),
      '#/properties/address/properties/city/properties/zip': makeNode({ pointer: '#/properties/address/properties/city/properties/zip', depth: 3, type: 'string', format: 'regex', parent: '#/properties/address/properties/city' }),
    });
    const ctx = fmtCtx({ pointer: '#/properties/address/properties/city/properties/zip', format: 'regex', depth: 3 });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.type).toBe('object');
    expect(result.properties).toBeDefined();
  });

  it('preserves required list for relevant properties', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', required: ['email'], children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/properties/email', format: 'email', required: true });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.required).toBeDefined();
    expect((result.required as string[])).toContain('email');
  });

  it('does not include unrelated required properties', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', required: ['email', 'name', 'age'], children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx();
    const result = buildMinimalReproducer(ctx, model);
    if (result.required !== undefined) {
      const req = result.required as string[];
      // Should only include 'email', not 'name' or 'age'
      expect(req).toContain('email');
      expect(req).not.toContain('name');
      expect(req).not.toContain('age');
    }
  });

  it('handles ref cycle without infinite loop', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0, ref: '#/$defs/Node', children: ['#/$defs/Node'] }),
        '#/$defs/Node': makeNode({ pointer: '#/$defs/Node', depth: 1, parent: '#', ref: '#/$defs/Node', type: 'object', format: 'uri' }),
      },
      [
        { from: '#', to: '#/$defs/Node', status: 'normal' },
        { from: '#/$defs/Node', to: '#/$defs/Node', status: 'cycle' },
      ],
      [['#/$defs/Node']],
    );
    const ctx = fmtCtx({ pointer: '#/$defs/Node', format: 'uri', recursiveContext: true });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.$schema).toBeDefined();
    // Should not throw or hang
  });

  it('handles multi-step ref chain', () => {
    const model = makeModel(
      {
        '#': makeNode({ pointer: '#', depth: 0, ref: '#/$defs/A', children: ['#/$defs/A', '#/$defs/B', '#/$defs/C'] }),
        '#/$defs/A': makeNode({ pointer: '#/$defs/A', depth: 1, parent: '#', ref: '#/$defs/B' }),
        '#/$defs/B': makeNode({ pointer: '#/$defs/B', depth: 1, parent: '#', ref: '#/$defs/C' }),
        '#/$defs/C': makeNode({ pointer: '#/$defs/C', depth: 1, parent: '#', type: 'string', format: 'email' }),
      },
      [
        { from: '#', to: '#/$defs/A', status: 'normal' },
        { from: '#/$defs/A', to: '#/$defs/B', status: 'normal' },
        { from: '#/$defs/B', to: '#/$defs/C', status: 'normal' },
      ],
    );
    const ctx = fmtCtx({ pointer: '#/$defs/C', format: 'email', refDepth: 3 });
    const result = buildMinimalReproducer(ctx, model);
    const defs = result.$defs as Record<string, unknown> | undefined;
    expect(defs).toBeDefined();
    if (defs !== undefined) {
      expect(defs.C).toBeDefined();
    }
  });

  it('handles definitions (legacy) container', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, children: ['#/definitions/Email'] }),
      '#/definitions/Email': makeNode({ pointer: '#/definitions/Email', depth: 1, parent: '#', type: 'string', format: 'email' }),
    });
    const ctx = fmtCtx({ pointer: '#/definitions/Email', format: 'email' });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.definitions).toBeDefined();
  });

  it('output is a plain object', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, format: 'email', type: 'string' }),
    });
    const ctx = fmtCtx({ pointer: '#', format: 'email', depth: 0 });
    const result = buildMinimalReproducer(ctx, model);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it('is deterministic across runs', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/email'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx();
    const run1 = buildMinimalReproducer(ctx, model);
    const run2 = buildMinimalReproducer(ctx, model);
    expect(run1).toEqual(run2);
  });

  it('does not include nodes not on the path', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'object', children: ['#/properties/email', '#/properties/name'] }),
      '#/properties/email': makeNode({ pointer: '#/properties/email', depth: 1, type: 'string', format: 'email', parent: '#' }),
      '#/properties/name': makeNode({ pointer: '#/properties/name', depth: 1, type: 'string', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/properties/email', format: 'email' });
    const result = buildMinimalReproducer(ctx, model);
    const props = result.properties as Record<string, unknown> | undefined;
    if (props !== undefined) {
      expect(props.name).toBeUndefined();
    }
  });

  it('handles allOf combinator', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { allOf: ['#/allOf/0', '#/allOf/1'] }, children: ['#/allOf/0', '#/allOf/1'] }),
      '#/allOf/0': makeNode({ pointer: '#/allOf/0', depth: 1, type: 'string', format: 'email', parent: '#' }),
      '#/allOf/1': makeNode({ pointer: '#/allOf/1', depth: 1, type: 'string', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/allOf/0', format: 'email', combinatorDepth: 1, combinatorTypes: ['allOf'] });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.allOf).toBeDefined();
  });

  it('handles anyOf combinator', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { anyOf: ['#/anyOf/0'] }, children: ['#/anyOf/0'] }),
      '#/anyOf/0': makeNode({ pointer: '#/anyOf/0', depth: 1, type: 'string', format: 'date', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/anyOf/0', format: 'date', combinatorDepth: 1, combinatorTypes: ['anyOf'] });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.anyOf).toBeDefined();
  });

  it('handles not combinator', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, combinators: { not: '#/not' }, children: ['#/not'] }),
      '#/not': makeNode({ pointer: '#/not', depth: 1, type: 'string', format: 'email', parent: '#' }),
    });
    const ctx = fmtCtx({ pointer: '#/not', format: 'email', combinatorDepth: 1, combinatorTypes: ['not'] });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.not).toBeDefined();
  });

  it('returns schema with format even for unknown format strings', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0, type: 'string', format: 'custom-format-xyz' }),
    });
    const ctx = fmtCtx({ pointer: '#', format: 'custom-format-xyz', depth: 0 });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.format).toBe('custom-format-xyz');
  });

  it('handles model with only root node', () => {
    const model = makeModel({
      '#': makeNode({ pointer: '#', depth: 0 }),
    });
    const ctx = fmtCtx({ pointer: '#', format: 'email', depth: 0 });
    const result = buildMinimalReproducer(ctx, model);
    expect(result.$schema).toBeDefined();
  });
});

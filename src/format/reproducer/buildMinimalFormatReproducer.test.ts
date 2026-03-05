import { describe, it, expect } from 'vitest';
import { buildMinimalFormatReproducer } from './buildMinimalFormatReproducer';
import type { StructuralModel, SchemaNode } from '../../types';

function sn(overrides: Partial<SchemaNode> & { pointer: string }): SchemaNode {
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

describe('buildMinimalFormatReproducer', () => {
  it('returns null for empty model', () => {
    expect(buildMinimalFormatReproducer(model(), '#')).toBeNull();
  });

  it('returns null for non-existent pointer', () => {
    const m = model({
      nodes: { '#': sn({ pointer: '#', format: 'email' }) },
    });
    expect(buildMinimalFormatReproducer(m, '#/nope')).toBeNull();
  });

  it('returns null when node has no format', () => {
    const m = model({
      nodes: { '#': sn({ pointer: '#', type: 'string' }) },
    });
    expect(buildMinimalFormatReproducer(m, '#')).toBeNull();
  });

  it('extracts root format node', () => {
    const m = model({
      nodes: { '#': sn({ pointer: '#', format: 'email', type: 'string' }) },
    });
    const result = buildMinimalFormatReproducer(m, '#');
    expect(result).not.toBeNull();
    expect(result!.targetPointer).toBe('#');
    expect(result!.format).toBe('email');
    expect(result!.schema).toBeTruthy();
    expect(result!.includedPointers).toContain('#');
  });

  it('schema includes type from target', () => {
    const m = model({
      nodes: { '#': sn({ pointer: '#', format: 'date', type: 'string' }) },
    });
    const result = buildMinimalFormatReproducer(m, '#')!;
    expect(result.schema['type']).toBe('string');
  });

  it('schema includes format from target', () => {
    const m = model({
      nodes: { '#': sn({ pointer: '#', format: 'uri', type: 'string' }) },
    });
    const result = buildMinimalFormatReproducer(m, '#')!;
    expect(result.schema['format']).toBe('uri');
  });

  it('includes ancestor chain', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', type: 'object', properties: ['a'], children: ['#/properties/a'] }),
        '#/properties/a': sn({
          pointer: '#/properties/a',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/properties/a')!;
    expect(result.includedPointers).toContain('#');
    expect(result.includedPointers).toContain('#/properties/a');
  });

  it('schema includes properties from ancestor', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', type: 'object', properties: ['email'], children: ['#/properties/email'] }),
        '#/properties/email': sn({
          pointer: '#/properties/email',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/properties/email')!;
    expect(result.schema['properties']).toBeTruthy();
    const props = result.schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['email']).toBeTruthy();
    expect(props['email']['format']).toBe('email');
  });

  it('includes ref target nodes', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          ref: '#/$defs/Email',
          children: ['#/$defs/Email'],
        }),
        '#/$defs/Email': sn({
          pointer: '#/$defs/Email',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
      edges: [{ from: '#', to: '#/$defs/Email', status: 'normal' }],
    });
    const result = buildMinimalFormatReproducer(m, '#/$defs/Email')!;
    expect(result.includedPointers).toContain('#');
    expect(result.includedPointers).toContain('#/$defs/Email');
  });

  it('includes transitive ref targets', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', ref: '#/$defs/A', children: ['#/$defs/A', '#/$defs/B'] }),
        '#/$defs/A': sn({ pointer: '#/$defs/A', ref: '#/$defs/B', parent: '#', depth: 1 }),
        '#/$defs/B': sn({ pointer: '#/$defs/B', format: 'uri', parent: '#', depth: 1 }),
      },
      edges: [
        { from: '#', to: '#/$defs/A', status: 'normal' },
        { from: '#/$defs/A', to: '#/$defs/B', status: 'normal' },
      ],
    });
    const result = buildMinimalFormatReproducer(m, '#/$defs/B')!;
    expect(result.includedPointers).toContain('#/$defs/B');
  });

  it('includes required siblings', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          type: 'object',
          properties: ['email', 'name'],
          required: ['name'],
          children: ['#/properties/email', '#/properties/name'],
        }),
        '#/properties/email': sn({
          pointer: '#/properties/email',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
        '#/properties/name': sn({
          pointer: '#/properties/name',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/properties/email')!;
    expect(result.includedPointers).toContain('#/properties/name');
  });

  it('rebuilds $defs section in schema', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          ref: '#/$defs/Fmt',
          children: ['#/$defs/Fmt'],
        }),
        '#/$defs/Fmt': sn({
          pointer: '#/$defs/Fmt',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
      edges: [{ from: '#', to: '#/$defs/Fmt', status: 'normal' }],
    });
    const result = buildMinimalFormatReproducer(m, '#/$defs/Fmt')!;
    expect(result.schema['$defs']).toBeTruthy();
    const defs = result.schema['$defs'] as Record<string, Record<string, unknown>>;
    expect(defs['Fmt']).toBeTruthy();
    expect(defs['Fmt']['format']).toBe('email');
  });

  it('uses definitions keyword for old-style defs', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          ref: '#/definitions/Fmt',
          defsKeyword: 'definitions',
          children: ['#/definitions/Fmt'],
        }),
        '#/definitions/Fmt': sn({
          pointer: '#/definitions/Fmt',
          format: 'uri',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
      edges: [{ from: '#', to: '#/definitions/Fmt', status: 'normal' }],
    });
    const result = buildMinimalFormatReproducer(m, '#/definitions/Fmt')!;
    expect(result.schema['definitions']).toBeTruthy();
  });

  it('includes combinator structure in schema', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          combinators: { allOf: ['#/allOf/0'] },
          children: ['#/allOf/0'],
        }),
        '#/allOf/0': sn({
          pointer: '#/allOf/0',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/allOf/0')!;
    expect(result.schema['allOf']).toBeTruthy();
    const allOf = result.schema['allOf'] as Record<string, unknown>[];
    expect(allOf[0]['format']).toBe('email');
  });

  it('includes anyOf combinator', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          combinators: { anyOf: ['#/anyOf/0', '#/anyOf/1'] },
          children: ['#/anyOf/0', '#/anyOf/1'],
        }),
        '#/anyOf/0': sn({ pointer: '#/anyOf/0', format: 'email', parent: '#', depth: 1 }),
        '#/anyOf/1': sn({ pointer: '#/anyOf/1', type: 'string', parent: '#', depth: 1 }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/anyOf/0')!;
    expect(result.schema['anyOf']).toBeTruthy();
  });

  it('includes if/then/else in schema', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          combinators: { if: '#/if', then: '#/then', else: '#/else' },
          children: ['#/if', '#/then', '#/else'],
        }),
        '#/if': sn({ pointer: '#/if', parent: '#', depth: 1 }),
        '#/then': sn({ pointer: '#/then', format: 'email', parent: '#', depth: 1 }),
        '#/else': sn({ pointer: '#/else', parent: '#', depth: 1 }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/then')!;
    expect(result.schema['then']).toBeTruthy();
    expect((result.schema['then'] as Record<string, unknown>)['format']).toBe('email');
  });

  it('includes patternProperties in schema', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          type: 'object',
          patternProperties: ['^x-'],
          children: ['#/patternProperties/^x-'],
        }),
        '#/patternProperties/^x-': sn({
          pointer: '#/patternProperties/^x-',
          format: 'uri',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/patternProperties/^x-')!;
    expect(result.schema['patternProperties']).toBeTruthy();
  });

  it('includes required array in schema', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          type: 'object',
          properties: ['email'],
          required: ['email'],
          children: ['#/properties/email'],
        }),
        '#/properties/email': sn({
          pointer: '#/properties/email',
          format: 'email',
          parent: '#',
          depth: 1,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/properties/email')!;
    expect(result.schema['required']).toEqual(['email']);
  });

  it('preserves $ref in schema output', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', ref: '#/$defs/A', children: ['#/$defs/A'] }),
        '#/$defs/A': sn({
          pointer: '#/$defs/A',
          format: 'email',
          type: 'string',
          parent: '#',
          depth: 1,
        }),
      },
      edges: [{ from: '#', to: '#/$defs/A', status: 'normal' }],
    });
    const result = buildMinimalFormatReproducer(m, '#/$defs/A')!;
    expect(result.schema['$ref']).toBe('#/$defs/A');
  });

  it('includedPointers are sorted', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', type: 'object', properties: ['z', 'a'], children: ['#/properties/z', '#/properties/a'] }),
        '#/properties/z': sn({ pointer: '#/properties/z', type: 'string', parent: '#', depth: 1 }),
        '#/properties/a': sn({ pointer: '#/properties/a', format: 'email', parent: '#', depth: 1 }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/properties/a')!;
    const sorted = [...result.includedPointers].sort();
    expect(result.includedPointers).toEqual(sorted);
  });

  it('is deterministic across calls', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', type: 'object', properties: ['x'], children: ['#/properties/x'] }),
        '#/properties/x': sn({ pointer: '#/properties/x', format: 'date', parent: '#', depth: 1 }),
      },
    });
    const a = buildMinimalFormatReproducer(m, '#/properties/x');
    const b = buildMinimalFormatReproducer(m, '#/properties/x');
    expect(a).toEqual(b);
  });

  it('includes $schema in output', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', format: 'email', type: 'string' }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#')!;
    expect(result.schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('handles 3-level nested property', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          type: 'object',
          properties: ['a'],
          children: ['#/properties/a'],
        }),
        '#/properties/a': sn({
          pointer: '#/properties/a',
          type: 'object',
          properties: ['b'],
          parent: '#',
          depth: 1,
          children: ['#/properties/a/properties/b'],
        }),
        '#/properties/a/properties/b': sn({
          pointer: '#/properties/a/properties/b',
          format: 'email',
          parent: '#/properties/a',
          depth: 2,
        }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/properties/a/properties/b')!;
    expect(result.includedPointers).toContain('#');
    expect(result.includedPointers).toContain('#/properties/a');
    expect(result.includedPointers).toContain('#/properties/a/properties/b');
  });

  it('preserves different format values correctly', () => {
    for (const fmt of ['email', 'uri', 'date-time', 'ipv4', 'hostname']) {
      const m = model({
        nodes: { '#': sn({ pointer: '#', format: fmt }) },
      });
      const result = buildMinimalFormatReproducer(m, '#')!;
      expect(result.format).toBe(fmt);
      expect(result.schema['format']).toBe(fmt);
    }
  });

  it('handles ref to missing node gracefully', () => {
    const m = model({
      nodes: {
        '#': sn({ pointer: '#', ref: '#/$defs/Missing', format: 'email' }),
      },
      edges: [{ from: '#', to: '#/$defs/Missing', status: 'missing' }],
    });
    const result = buildMinimalFormatReproducer(m, '#')!;
    expect(result).toBeTruthy();
    expect(result.format).toBe('email');
  });

  it('includes oneOf items in reproduced schema', () => {
    const m = model({
      nodes: {
        '#': sn({
          pointer: '#',
          combinators: { oneOf: ['#/oneOf/0'] },
          children: ['#/oneOf/0'],
        }),
        '#/oneOf/0': sn({ pointer: '#/oneOf/0', format: 'ipv4', parent: '#', depth: 1 }),
      },
    });
    const result = buildMinimalFormatReproducer(m, '#/oneOf/0')!;
    expect(result.schema['oneOf']).toBeTruthy();
  });
});

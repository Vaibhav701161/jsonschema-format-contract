import { describe, it, expect } from 'vitest';
import { walkSchema, unsupportedKeywordsFound } from './traversal';

function pointers(schema: unknown): string[] {
  return walkSchema(schema).map((e) => e.pointer);
}

describe('walkSchema', () => {
  it('visits the root node', () => {
    const result = walkSchema({ type: 'object' });
    expect(result).toHaveLength(1);
    expect(result[0].pointer).toBe('#');
    expect(result[0].depth).toBe(0);
    expect(result[0].parent).toBeUndefined();
  });

  it('visits properties children', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
      },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#');
    expect(ptrs).toContain('#/properties/a');
    expect(ptrs).toHaveLength(2);
  });

  it('visits $defs children', () => {
    const schema = {
      $defs: {
        Foo: { type: 'number' },
      },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/$defs/Foo');
  });

  it('visits definitions children (Draft-07)', () => {
    const schema = {
      definitions: {
        Bar: { type: 'string' },
      },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/definitions/Bar');
  });

  it('visits additionalProperties when it is a schema object', () => {
    const schema = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/additionalProperties');
  });

  it('does not visit additionalProperties when it is a boolean', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
    };
    const ptrs = pointers(schema);
    expect(ptrs).not.toContain('#/additionalProperties');
    expect(ptrs).toHaveLength(1);
  });

  it('visits allOf array elements', () => {
    const schema = {
      allOf: [{ type: 'string' }, { minLength: 1 }],
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/allOf/0');
    expect(ptrs).toContain('#/allOf/1');
  });

  it('visits anyOf array elements', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/anyOf/0');
    expect(ptrs).toContain('#/anyOf/1');
  });

  it('visits oneOf array elements', () => {
    const schema = {
      oneOf: [{ type: 'string' }],
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/oneOf/0');
  });

  it('visits not subschema', () => {
    const schema = {
      not: { type: 'null' },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/not');
  });

  it('visits if/then/else subschemas', () => {
    const schema = {
      if: { properties: { foo: { type: 'string' } } },
      then: { required: ['foo'] },
      else: { required: ['bar'] },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/if');
    expect(ptrs).toContain('#/then');
    expect(ptrs).toContain('#/else');
    // if has its own properties child
    expect(ptrs).toContain('#/if/properties/foo');
  });

  it('visits items (single schema)', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/items');
  });

  it('visits patternProperties children', () => {
    const schema = {
      patternProperties: {
        '^S_': { type: 'string' },
      },
    };
    const ptrs = pointers(schema);
    expect(ptrs).toContain('#/patternProperties/^S_');
  });

  it('builds correct nested pointers (not relative to root)', () => {
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
    const ptrs = pointers(schema);
    // Must be under $defs/Task, not directly under root
    expect(ptrs).toContain('#/$defs/Task/properties/id');
    expect(ptrs).not.toContain('#/properties/id');
  });

  it('sets parent pointer for child entries', () => {
    const schema = {
      properties: {
        a: { type: 'string' },
      },
    };
    const entries = walkSchema(schema);
    const child = entries.find((e) => e.pointer === '#/properties/a');
    expect(child).toBeDefined();
    expect(child!.parent).toBe('#');
  });

  it('increments depth for nested schemas', () => {
    const schema = {
      $defs: {
        X: {
          properties: {
            y: { type: 'number' },
          },
        },
      },
    };
    const entries = walkSchema(schema);
    const root = entries.find((e) => e.pointer === '#');
    const def = entries.find((e) => e.pointer === '#/$defs/X');
    const prop = entries.find((e) => e.pointer === '#/$defs/X/properties/y');
    expect(root!.depth).toBe(0);
    expect(def!.depth).toBe(1);
    expect(prop!.depth).toBe(2);
  });

  it('records unsupported keywords without throwing', () => {
    const schema = {
      $dynamicRef: '#meta',
      type: 'object',
    };
    const result = walkSchema(schema);
    expect(result).toHaveLength(1); // only root, no child from $dynamicRef
    expect(unsupportedKeywordsFound).toContain('$dynamicRef');
  });

  it('records $dynamicAnchor as unsupported', () => {
    const schema = {
      $dynamicAnchor: 'meta',
      type: 'object',
    };
    walkSchema(schema);
    expect(unsupportedKeywordsFound).toContain('$dynamicAnchor');
  });

  it('records $recursiveRef as unsupported', () => {
    const schema = {
      $recursiveRef: '#',
      type: 'string',
    };
    walkSchema(schema);
    expect(unsupportedKeywordsFound).toContain('$recursiveRef');
  });

  it('does not recurse into primitive property values', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
      },
    };
    const ptrs = pointers(schema);
    // Should visit root and properties/name, but not "minLength" as a child
    expect(ptrs).toEqual(['#', '#/properties/name']);
  });

  it('visits every subschema exactly once in a complex schema', () => {
    const schema = {
      $defs: {
        Address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
      type: 'object',
      properties: {
        name: { type: 'string' },
        addresses: {
          type: 'array',
          items: { $ref: '#/$defs/Address' },
        },
      },
    };
    const ptrs = pointers(schema);
    // No duplicates
    expect(new Set(ptrs).size).toBe(ptrs.length);

    const expected = [
      '#',
      '#/$defs/Address',
      '#/$defs/Address/properties/street',
      '#/$defs/Address/properties/city',
      '#/properties/name',
      '#/properties/addresses',
      '#/properties/addresses/items',
    ];
    for (const p of expected) {
      expect(ptrs).toContain(p);
    }
    expect(ptrs).toHaveLength(expected.length);
  });
});

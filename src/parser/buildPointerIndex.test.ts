import { describe, it, expect } from 'vitest';
import { buildPointerIndex } from './buildPointerIndex';

describe('buildPointerIndex', () => {

  it('indexes a minimal schema with one property', () => {
    const schema = {
      properties: {
        a: { type: 'string' },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(Object.keys(nodes)).toHaveLength(2);
    expect(nodes['#']).toBeDefined();
    expect(nodes['#/properties/a']).toBeDefined();

    // Root node
    expect(nodes['#'].depth).toBe(0);
    expect(nodes['#'].parent).toBeUndefined();
    expect(nodes['#'].children).toContain('#/properties/a');
    expect(nodes['#'].properties).toEqual(['a']);

    // Property node
    expect(nodes['#/properties/a'].depth).toBe(1);
    expect(nodes['#/properties/a'].parent).toBe('#');
    expect(nodes['#/properties/a'].type).toBe('string');
    expect(nodes['#/properties/a'].children).toEqual([]);
  });

  it('indexes $defs entries', () => {
    const schema = {
      $defs: {
        Foo: { type: 'object' },
        Bar: { type: 'number' },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/$defs/Foo']).toBeDefined();
    expect(nodes['#/$defs/Bar']).toBeDefined();
    expect(nodes['#'].defs).toEqual(['Foo', 'Bar']);
    expect(nodes['#'].defsKeyword).toBe('$defs');
    expect(nodes['#'].children).toContain('#/$defs/Foo');
    expect(nodes['#'].children).toContain('#/$defs/Bar');
  });

  it('indexes definitions entries (Draft-07)', () => {
    const schema = {
      definitions: {
        Baz: { type: 'string' },
        Qux: { type: 'number' },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/definitions/Baz']).toBeDefined();
    expect(nodes['#/definitions/Qux']).toBeDefined();
    expect(nodes['#'].defs).toEqual(['Baz', 'Qux']);
    expect(nodes['#'].defsKeyword).toBe('definitions');
  });

  it('indexes both $defs and definitions when both present', () => {
    const schema = {
      $defs: { A: { type: 'string' } },
      definitions: { B: { type: 'number' } },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/$defs/A']).toBeDefined();
    expect(nodes['#/definitions/B']).toBeDefined();
    expect(nodes['#'].defs).toEqual(['A', 'B']);
    expect(nodes['#'].defsKeyword).toBe('both');
  });

  it('indexes additionalProperties when it is a schema object', () => {
    const schema = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/additionalProperties']).toBeDefined();
    expect(nodes['#'].children).toContain('#/additionalProperties');
  });

  it('does not index additionalProperties when it is a boolean', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/additionalProperties']).toBeUndefined();
  });

  it('indexes allOf combinator children', () => {
    const schema = {
      allOf: [{ type: 'string' }, { minLength: 1 }],
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/allOf/0']).toBeDefined();
    expect(nodes['#/allOf/1']).toBeDefined();
    expect(nodes['#'].combinators?.allOf).toEqual([
      '#/allOf/0',
      '#/allOf/1',
    ]);
  });

  it('indexes anyOf combinator children', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/anyOf/0']).toBeDefined();
    expect(nodes['#/anyOf/1']).toBeDefined();
    expect(nodes['#'].combinators?.anyOf).toEqual([
      '#/anyOf/0',
      '#/anyOf/1',
    ]);
  });

  it('indexes oneOf combinator children', () => {
    const schema = {
      oneOf: [{ type: 'string' }],
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/oneOf/0']).toBeDefined();
    expect(nodes['#'].combinators?.oneOf).toEqual(['#/oneOf/0']);
  });

  it('indexes not combinator', () => {
    const schema = {
      not: { type: 'null' },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/not']).toBeDefined();
    expect(nodes['#'].combinators?.not).toBe('#/not');
  });

  it('indexes if/then/else combinators', () => {
    const schema = {
      if: { properties: { x: { type: 'string' } } },
      then: { required: ['x'] },
      else: { required: ['y'] },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/if']).toBeDefined();
    expect(nodes['#/then']).toBeDefined();
    expect(nodes['#/else']).toBeDefined();
    expect(nodes['#'].combinators?.if).toBe('#/if');
    expect(nodes['#'].combinators?.then).toBe('#/then');
    expect(nodes['#'].combinators?.else).toBe('#/else');

    // if has nested properties
    expect(nodes['#/if/properties/x']).toBeDefined();
    expect(nodes['#/if'].children).toContain('#/if/properties/x');
  });

  it('builds correct nested pointers for $defs with properties', () => {
    const schema = {
      $defs: {
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/$defs/Task']).toBeDefined();
    expect(nodes['#/$defs/Task/properties/id']).toBeDefined();
    expect(nodes['#/$defs/Task/properties/name']).toBeDefined();

    expect(nodes['#/$defs/Task'].properties).toEqual(['id', 'name']);
    expect(nodes['#/$defs/Task'].children).toContain(
      '#/$defs/Task/properties/id',
    );
    expect(nodes['#/$defs/Task'].children).toContain(
      '#/$defs/Task/properties/name',
    );
  });

  it('assigns correct depth for deeply nested schemas', () => {
    const schema = {
      $defs: {
        Outer: {
          properties: {
            inner: {
              properties: {
                leaf: { type: 'string' },
              },
            },
          },
        },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#'].depth).toBe(0);
    expect(nodes['#/$defs/Outer'].depth).toBe(1);
    expect(nodes['#/$defs/Outer/properties/inner'].depth).toBe(2);
    expect(nodes['#/$defs/Outer/properties/inner/properties/leaf'].depth).toBe(3);
  });

  it('records $ref values on nodes', () => {
    const schema = {
      properties: {
        task: { $ref: '#/$defs/Task' },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/properties/task'].ref).toBe('#/$defs/Task');
  });

  it('records required array on nodes', () => {
    const schema = {
      type: 'object',
      required: ['name', 'age'],
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#'].required).toEqual(['name', 'age']);
  });

  it('indexes patternProperties children and records pattern strings', () => {
    const schema = {
      patternProperties: {
        '^S_': { type: 'string' },
        '^I_': { type: 'integer' },
      },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/patternProperties/^S_']).toBeDefined();
    expect(nodes['#/patternProperties/^I_']).toBeDefined();
    expect(nodes['#'].patternProperties).toEqual(['^S_', '^I_']);
  });

  it('indexes items (single schema)', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#/items']).toBeDefined();
    expect(nodes['#'].children).toContain('#/items');
  });

  it('handles type as an array of strings', () => {
    const schema = {
      type: ['string', 'null'],
    };
    const nodes = buildPointerIndex(schema);

    expect(nodes['#'].type).toEqual(['string', 'null']);
  });

  it('does not mutate the original schema object', () => {
    const schema = {
      properties: {
        a: { type: 'string' },
      },
    };
    const original = JSON.stringify(schema);
    buildPointerIndex(schema);
    expect(JSON.stringify(schema)).toBe(original);
  });

  it('creates exactly one entry per subschema', () => {
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
    const nodes = buildPointerIndex(schema);

    const expected = [
      '#',
      '#/$defs/Address',
      '#/$defs/Address/properties/street',
      '#/$defs/Address/properties/city',
      '#/properties/name',
      '#/properties/addresses',
      '#/properties/addresses/items',
    ];

    expect(Object.keys(nodes)).toHaveLength(expected.length);
    for (const p of expected) {
      expect(nodes[p]).toBeDefined();
    }
  });

  it('handles a complex schema with multiple keyword types', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        metadata: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          patternProperties: {
            '^x-': { type: 'string' },
          },
        },
      },
      $defs: {
        Status: {
          oneOf: [
            { type: 'string' },
            { type: 'number' },
          ],
        },
      },
      allOf: [{ required: ['metadata'] }],
    };
    const nodes = buildPointerIndex(schema);

    // Spot-check key nodes
    expect(nodes['#']).toBeDefined();
    expect(nodes['#/properties/id']).toBeDefined();
    expect(nodes['#/properties/metadata']).toBeDefined();
    expect(nodes['#/properties/metadata/properties/tags']).toBeDefined();
    expect(nodes['#/properties/metadata/properties/tags/items']).toBeDefined();
    expect(nodes['#/properties/metadata/patternProperties/^x-']).toBeDefined();
    expect(nodes['#/$defs/Status']).toBeDefined();
    expect(nodes['#/$defs/Status/oneOf/0']).toBeDefined();
    expect(nodes['#/$defs/Status/oneOf/1']).toBeDefined();
    expect(nodes['#/allOf/0']).toBeDefined();

    // Parent/child relationships
    expect(nodes['#/properties/metadata'].children).toContain(
      '#/properties/metadata/properties/tags',
    );
    expect(nodes['#/properties/metadata'].children).toContain(
      '#/properties/metadata/patternProperties/^x-',
    );
  });
});

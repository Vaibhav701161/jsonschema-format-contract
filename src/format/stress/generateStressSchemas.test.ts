import { describe, it, expect } from 'vitest';
import { generateStressSchemas } from './generateStressSchemas';
import { INTERACTION_TYPES } from './types';
import type { FormatInteractionProfile } from './types';

function profile(overrides: Partial<FormatInteractionProfile> = {}): FormatInteractionProfile {
  return {
    pointer: '#/properties/email',
    format: 'email',
    interactionTypes: [],
    structuralRisk: 10,
    requiredBranches: 0,
    requiresDynamicScopeTests: false,
    requiresRecursionTests: false,
    requiresConditionalTests: false,
    ...overrides,
  };
}

describe('generateStressSchemas', () => {
  it('returns basic format schema when no interaction types', () => {
    const result = generateStressSchemas(profile({ interactionTypes: [] }));
    expect(result.length).toBeGreaterThanOrEqual(1);
    const basic = result[0];
    expect(basic.schema).toBeDefined();
    expect(basic.name).toBeDefined();
  });

  it('generates combinator stress schemas for combinator-branching', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.COMBINATOR_BRANCHING] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('oneOf') || n.includes('combinator'))).toBe(true);
  });

  it('generates conditional stress schemas for conditional-gating', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.CONDITIONAL_GATING] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('conditional') || n.includes('if-then'))).toBe(true);
  });

  it('generates recursive stress schemas for recursive-ref', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.RECURSIVE_REF] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('recursive'))).toBe(true);
  });

  it('generates ref chain stress schemas for multi-ref-chain', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.MULTI_REF_CHAIN] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('ref'))).toBe(true);
  });

  it('generates union-type stress schemas', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.UNION_TYPE] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('union'))).toBe(true);
  });

  it('generates required-property stress schemas', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.REQUIRED_PROPERTY] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('required'))).toBe(true);
  });

  it('generates pattern-overlap stress schemas', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.PATTERN_OVERLAP] }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map(s => s.name);
    expect(names.some(n => n.includes('pattern'))).toBe(true);
  });

  it('generates schemas for multiple interaction types', () => {
    const result = generateStressSchemas(
      profile({
        interactionTypes: [
          INTERACTION_TYPES.COMBINATOR_BRANCHING,
          INTERACTION_TYPES.CONDITIONAL_GATING,
          INTERACTION_TYPES.RECURSIVE_REF,
        ],
      }),
    );
    // Should have schemas from all three types
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('all schemas include $schema keyword', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.COMBINATOR_BRANCHING] }),
    );
    for (const s of result) {
      expect((s.schema as Record<string, unknown>)['$schema']).toBeDefined();
    }
  });

  it('all schemas include format matching the profile', () => {
    const result = generateStressSchemas(
      profile({ format: 'date-time', interactionTypes: [INTERACTION_TYPES.COMBINATOR_BRANCHING] }),
    );
    for (const s of result) {
      const json = JSON.stringify(s.schema);
      expect(json).toContain('date-time');
    }
  });

  it('all schemas have non-empty name', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: Object.values(INTERACTION_TYPES) }),
    );
    for (const s of result) {
      expect(s.name.length).toBeGreaterThan(0);
    }
  });

  it('all schemas have non-empty description', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.COMBINATOR_BRANCHING] }),
    );
    for (const s of result) {
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('all schemas have expectedTestCases >= 1', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: Object.values(INTERACTION_TYPES) }),
    );
    for (const s of result) {
      expect(s.expectedTestCases).toBeGreaterThanOrEqual(1);
    }
  });

  it('combinator schemas include oneOf/anyOf/allOf structure', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.COMBINATOR_BRANCHING] }),
    );
    const json = JSON.stringify(result.map(s => s.schema));
    expect(json.includes('oneOf') || json.includes('anyOf') || json.includes('allOf')).toBe(true);
  });

  it('conditional schemas include if/then/else structure', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.CONDITIONAL_GATING] }),
    );
    const json = JSON.stringify(result.map(s => s.schema));
    expect(json.includes('"if"') || json.includes('"then"') || json.includes('"else"')).toBe(true);
  });

  it('recursive schemas include $ref', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.RECURSIVE_REF] }),
    );
    const json = JSON.stringify(result.map(s => s.schema));
    expect(json).toContain('$ref');
  });

  it('multi-ref-chain schemas include $ref', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.MULTI_REF_CHAIN] }),
    );
    const json = JSON.stringify(result.map(s => s.schema));
    expect(json).toContain('$ref');
  });

  it('union-type schemas include type array', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.UNION_TYPE] }),
    );
    const hasArray = result.some(s => {
      const json = JSON.stringify(s.schema);
      return json.includes('"type":["string"') || json.includes('"type": ["string"');
    });
    // May also use oneOf/anyOf for union representation
    const hasOneOf = result.some(s => {
      const json = JSON.stringify(s.schema);
      return json.includes('oneOf') || json.includes('anyOf');
    });
    expect(hasArray || hasOneOf).toBe(true);
  });

  it('required-property schemas include required array', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.REQUIRED_PROPERTY] }),
    );
    const json = JSON.stringify(result.map(s => s.schema));
    expect(json).toContain('required');
  });

  it('pattern-overlap schemas include patternProperties', () => {
    const result = generateStressSchemas(
      profile({ interactionTypes: [INTERACTION_TYPES.PATTERN_OVERLAP] }),
    );
    const json = JSON.stringify(result.map(s => s.schema));
    expect(json).toContain('patternProperties');
  });

  it('is deterministic across runs', () => {
    const p = profile({ interactionTypes: Object.values(INTERACTION_TYPES), format: 'email' });
    const run1 = generateStressSchemas(p);
    const run2 = generateStressSchemas(p);
    expect(run1).toEqual(run2);
  });

  it('uses different format values correctly', () => {
    const emailResult = generateStressSchemas(
      profile({ format: 'email', interactionTypes: [INTERACTION_TYPES.REQUIRED_PROPERTY] }),
    );
    const uriResult = generateStressSchemas(
      profile({ format: 'uri', interactionTypes: [INTERACTION_TYPES.REQUIRED_PROPERTY] }),
    );
    const emailJson = JSON.stringify(emailResult.map(s => s.schema));
    const uriJson = JSON.stringify(uriResult.map(s => s.schema));
    expect(emailJson).toContain('email');
    expect(uriJson).toContain('uri');
  });

  it('handles all interaction types simultaneously without error', () => {
    const p = profile({
      interactionTypes: Object.values(INTERACTION_TYPES),
      format: 'date-time',
    });
    const result = generateStressSchemas(p);
    expect(result.length).toBeGreaterThan(0);
    // Each schema should be a valid object
    for (const s of result) {
      expect(typeof s.schema).toBe('object');
      expect(s.schema).not.toBeNull();
    }
  });

  it('basic fallback schema is structurally valid', () => {
    const result = generateStressSchemas(profile({ interactionTypes: [] }));
    expect(result.length).toBeGreaterThanOrEqual(1);
    const schema = result[0].schema as Record<string, unknown>;
    expect(schema['$schema']).toBeDefined();
    expect(schema['format'] || schema['type'] || schema['properties']).toBeDefined();
  });
});

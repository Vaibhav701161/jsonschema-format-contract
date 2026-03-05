import { describe, it, expect } from 'vitest';
import {
  generateAllStressScenarios,
  recursiveFormatDeep,
  mutualRecursiveFormat,
  combinatorFormatExplosion,
  anyOfBranchMultiplier,
  oneOfConflictFormat,
  conditionalFormatGate,
  dynamicFormatOverride,
  formatUnderUnevaluatedProperties,
  formatUnionTypeMismatch,
  formatUnderRefIndirection,
} from './stressScenarioGenerator';
import type { FormatStressScenario } from './stressTypes';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

function assertValidScenario(scenario: FormatStressScenario, expectedName: string): void {
  expect(scenario.name).toBe(expectedName);
  expect(scenario.description).toBeTruthy();
  expect(scenario.schema).toBeTruthy();
  expect(scenario.schema['$schema']).toBe(DRAFT);
  expect(scenario.expectedFailureModes).toBeInstanceOf(Array);
  expect(scenario.expectedFailureModes.length).toBeGreaterThanOrEqual(3);
}

describe('generateAllStressScenarios', () => {
  it('returns exactly 10 scenarios', () => {
    const scenarios = generateAllStressScenarios('email');
    expect(scenarios).toHaveLength(10);
  });

  it('every scenario has required fields', () => {
    const scenarios = generateAllStressScenarios('email');
    for (const s of scenarios) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.schema).toBeTruthy();
      expect(s.expectedFailureModes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all scenario names are unique', () => {
    const scenarios = generateAllStressScenarios('email');
    const names = scenarios.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all scenarios include $schema', () => {
    const scenarios = generateAllStressScenarios('date-time');
    for (const s of scenarios) {
      expect(s.schema['$schema']).toBe(DRAFT);
    }
  });

  it('is deterministic - same output on repeated calls', () => {
    const a = generateAllStressScenarios('uri');
    const b = generateAllStressScenarios('uri');
    expect(a).toEqual(b);
  });

  it('format parameter is embedded in all schemas', () => {
    const scenarios = generateAllStressScenarios('ipv4');
    for (const s of scenarios) {
      const json = JSON.stringify(s.schema);
      expect(json).toContain('ipv4');
    }
  });

  it('includes all 10 named generators', () => {
    const scenarios = generateAllStressScenarios('email');
    const names = scenarios.map(s => s.name);
    expect(names).toEqual([
      'recursive_format_deep',
      'mutual_recursive_format',
      'combinator_format_explosion',
      'anyOf_branch_multiplier',
      'oneOf_conflict_format',
      'conditional_format_gate',
      'dynamic_format_override',
      'format_under_unevaluatedProperties',
      'format_union_type_mismatch',
      'format_under_ref_indirection',
    ]);
  });
});

describe('recursiveFormatDeep', () => {
  it('generates valid scenario', () => {
    assertValidScenario(recursiveFormatDeep('email'), 'recursive_format_deep');
  });

  it('schema is self-recursive via $ref: #', () => {
    const s = recursiveFormatDeep('email');
    const schema = s.schema as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;
    expect((props['child'] as Record<string, unknown>)['$ref']).toBe('#');
  });

  it('includes format in schema root', () => {
    expect(recursiveFormatDeep('date').schema['format']).toBe('date');
  });

  it('description mentions the format', () => {
    expect(recursiveFormatDeep('uri').description).toContain('uri');
  });
});

describe('mutualRecursiveFormat', () => {
  it('generates valid scenario', () => {
    assertValidScenario(mutualRecursiveFormat('email'), 'mutual_recursive_format');
  });

  it('has $defs with A and B', () => {
    const defs = mutualRecursiveFormat('email').schema['$defs'] as Record<string, unknown>;
    expect(defs['A']).toBeTruthy();
    expect(defs['B']).toBeTruthy();
  });

  it('A references B and B references A', () => {
    const defs = mutualRecursiveFormat('email').schema['$defs'] as Record<string, Record<string, unknown>>;
    const aProps = defs['A']['properties'] as Record<string, Record<string, string>>;
    const bProps = defs['B']['properties'] as Record<string, Record<string, string>>;
    expect(aProps['b']['$ref']).toBe('#/$defs/B');
    expect(bProps['a']['$ref']).toBe('#/$defs/A');
  });
});

describe('combinatorFormatExplosion', () => {
  it('generates valid scenario', () => {
    assertValidScenario(combinatorFormatExplosion('email'), 'combinator_format_explosion');
  });

  it('has nested allOf > oneOf > anyOf', () => {
    const schema = combinatorFormatExplosion('email').schema;
    expect(schema['allOf']).toBeTruthy();
    const allOf = schema['allOf'] as Record<string, unknown>[];
    expect(allOf[0]['oneOf']).toBeTruthy();
  });
});

describe('anyOfBranchMultiplier', () => {
  it('generates valid scenario', () => {
    assertValidScenario(anyOfBranchMultiplier('email'), 'anyOf_branch_multiplier');
  });

  it('has 5 anyOf branches', () => {
    const schema = anyOfBranchMultiplier('email').schema;
    expect((schema['anyOf'] as unknown[]).length).toBe(5);
  });

  it('all branches have the same format', () => {
    const branches = anyOfBranchMultiplier('uri').schema['anyOf'] as Record<string, unknown>[];
    for (const b of branches) {
      expect(b['format']).toBe('uri');
    }
  });
});

describe('oneOfConflictFormat', () => {
  it('generates valid scenario', () => {
    assertValidScenario(oneOfConflictFormat('email'), 'oneOf_conflict_format');
  });

  it('has 2 overlapping oneOf branches', () => {
    const branches = oneOfConflictFormat('email').schema['oneOf'] as Record<string, unknown>[];
    expect(branches.length).toBe(2);
    expect(branches[0]['format']).toBe('email');
    expect(branches[1]['format']).toBe('email');
  });
});

describe('conditionalFormatGate', () => {
  it('generates valid scenario', () => {
    assertValidScenario(conditionalFormatGate('date'), 'conditional_format_gate');
  });

  it('has if/then/else with format in then', () => {
    const schema = conditionalFormatGate('date').schema;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    const value = props['value'];
    expect(value['if']).toBeTruthy();
    expect(value['then']).toBeTruthy();
    expect(value['else']).toBeTruthy();
    expect((value['then'] as Record<string, unknown>)['format']).toBe('date');
  });
});

describe('dynamicFormatOverride', () => {
  it('generates valid scenario', () => {
    assertValidScenario(dynamicFormatOverride('email'), 'dynamic_format_override');
  });

  it('has $dynamicAnchor in both defs', () => {
    const defs = dynamicFormatOverride('email').schema['$defs'] as Record<string, Record<string, unknown>>;
    expect(defs['base']['$dynamicAnchor']).toBe('fmt');
    expect(defs['override']['$dynamicAnchor']).toBe('fmt');
  });

  it('base and override have different formats', () => {
    const defs = dynamicFormatOverride('email').schema['$defs'] as Record<string, Record<string, unknown>>;
    expect(defs['base']['format']).toBe('email');
    expect(defs['override']['format']).toBe('uri');
  });
});

describe('formatUnderUnevaluatedProperties', () => {
  it('generates valid scenario', () => {
    assertValidScenario(formatUnderUnevaluatedProperties('email'), 'format_under_unevaluatedProperties');
  });

  it('has unevaluatedProperties with format', () => {
    const schema = formatUnderUnevaluatedProperties('date').schema;
    const uneval = schema['unevaluatedProperties'] as Record<string, unknown>;
    expect(uneval['format']).toBe('date');
  });
});

describe('formatUnionTypeMismatch', () => {
  it('generates valid scenario', () => {
    assertValidScenario(formatUnionTypeMismatch('email'), 'format_union_type_mismatch');
  });

  it('has union type ["string", "null"]', () => {
    const schema = formatUnionTypeMismatch('email').schema;
    expect(schema['type']).toEqual(['string', 'null']);
  });

  it('has format on union type', () => {
    expect(formatUnionTypeMismatch('date-time').schema['format']).toBe('date-time');
  });
});

describe('formatUnderRefIndirection', () => {
  it('generates valid scenario', () => {
    assertValidScenario(formatUnderRefIndirection('email'), 'format_under_ref_indirection');
  });

  it('creates 4-level ref chain L1→L2→L3→L4', () => {
    const defs = formatUnderRefIndirection('email').schema['$defs'] as Record<string, Record<string, unknown>>;
    expect(defs['L1']['$ref']).toBe('#/$defs/L2');
    expect(defs['L2']['$ref']).toBe('#/$defs/L3');
    expect(defs['L3']['$ref']).toBe('#/$defs/L4');
    expect(defs['L4']['format']).toBe('email');
  });

  it('root $ref points to L1', () => {
    const schema = formatUnderRefIndirection('email').schema;
    expect(schema['$ref']).toBe('#/$defs/L1');
  });
});

describe('format variations', () => {
  const formats = ['email', 'uri', 'date-time', 'ipv4', 'ipv6', 'hostname', 'date', 'time'];

  for (const fmt of formats) {
    it(`generates all scenarios for format "${fmt}"`, () => {
      const scenarios = generateAllStressScenarios(fmt);
      expect(scenarios).toHaveLength(10);
      for (const s of scenarios) {
        expect(JSON.stringify(s.schema)).toContain(fmt);
      }
    });
  }
});

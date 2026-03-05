import type { FormatInteractionProfile, StressSchema } from './types';
import { INTERACTION_TYPES } from './types';

const SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Generate minimal adversarial stress schemas for a given interaction profile.
 * Returns deterministically ordered schemas.
 */
export function generateStressSchemas(profile: FormatInteractionProfile): StressSchema[] {
  const result: StressSchema[] = [];
  const fmt = profile.format;
  const types = profile.interactionTypes;

  for (let i = 0; i < types.length; i++) {
    const interaction = types[i];
    const schemas = generateForInteraction(fmt, interaction, profile);
    for (let j = 0; j < schemas.length; j++) {
      result.push(schemas[j]);
    }
  }

  // If no interactions found, generate a basic format schema
  if (result.length === 0) {
    result.push(buildBasicFormatSchema(fmt));
  }

  return result;
}

function generateForInteraction(
  fmt: string,
  interaction: string,
  _profile: FormatInteractionProfile,
): StressSchema[] {
  switch (interaction) {
    case INTERACTION_TYPES.COMBINATOR_BRANCHING:
      return generateCombinatorStress(fmt);
    case INTERACTION_TYPES.CONDITIONAL_GATING:
      return generateConditionalStress(fmt);
    case INTERACTION_TYPES.RECURSIVE_REF:
      return generateRecursiveStress(fmt);
    case INTERACTION_TYPES.MULTI_REF_CHAIN:
      return generateMultiRefChainStress(fmt);
    case INTERACTION_TYPES.UNION_TYPE:
      return generateUnionTypeStress(fmt);
    case INTERACTION_TYPES.REQUIRED_PROPERTY:
      return generateRequiredPropertyStress(fmt);
    case INTERACTION_TYPES.PATTERN_OVERLAP:
      return generatePatternOverlapStress(fmt);
    default:
      return [];
  }
}

function generateCombinatorStress(fmt: string): StressSchema[] {
  return [
    {
      name: `oneOf-explosion-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        oneOf: [
          { type: 'string', format: fmt },
          { type: 'string' },
          { type: 'integer' },
        ],
      },
      description: `Format "${fmt}" inside oneOf with 3 exclusive branches`,
      expectedTestCases: 6,
    },
    {
      name: `anyOf-branch-multiplier-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        anyOf: [
          { type: 'string', format: fmt },
          { type: 'string', minLength: 1 },
        ],
      },
      description: `Format "${fmt}" inside anyOf requiring combination testing`,
      expectedTestCases: 4,
    },
    {
      name: `deep-combinator-nesting-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        allOf: [
          {
            oneOf: [
              {
                anyOf: [
                  { type: 'string', format: fmt },
                  { type: 'string' },
                ],
              },
              { type: 'integer' },
            ],
          },
        ],
      },
      description: `Format "${fmt}" nested 3 levels deep: allOf > oneOf > anyOf`,
      expectedTestCases: 12,
    },
  ];
}

function generateConditionalStress(fmt: string): StressSchema[] {
  return [
    {
      name: `if-then-else-gated-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        type: 'object',
        properties: {
          kind: { type: 'string' },
          value: { type: 'string' },
        },
        if: {
          properties: { kind: { const: 'formatted' } },
          required: ['kind'],
        },
        then: {
          properties: { value: { type: 'string', format: fmt } },
        },
        else: {
          properties: { value: { type: 'string' } },
        },
      },
      description: `Format "${fmt}" gated behind if/then/else conditional`,
      expectedTestCases: 4,
    },
    {
      name: `nested-conditional-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        type: 'object',
        if: {
          properties: { type: { const: 'a' } },
        },
        then: {
          if: {
            properties: { subtype: { const: 'x' } },
          },
          then: {
            properties: { data: { type: 'string', format: fmt } },
          },
        },
      },
      description: `Format "${fmt}" behind nested if/then conditional`,
      expectedTestCases: 6,
    },
  ];
}

function generateRecursiveStress(fmt: string): StressSchema[] {
  return [
    {
      name: `recursive-format-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        $defs: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string', format: fmt },
              child: { $ref: '#/$defs/Node' },
            },
          },
        },
        $ref: '#/$defs/Node',
      },
      description: `Format "${fmt}" inside self-referencing recursive structure`,
      expectedTestCases: 5,
    },
    {
      name: `mutual-recursive-format-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        $defs: {
          Alpha: {
            type: 'object',
            properties: {
              data: { type: 'string', format: fmt },
              beta: { $ref: '#/$defs/Beta' },
            },
          },
          Beta: {
            type: 'object',
            properties: {
              alpha: { $ref: '#/$defs/Alpha' },
            },
          },
        },
        $ref: '#/$defs/Alpha',
      },
      description: `Format "${fmt}" inside mutually recursive Alpha ↔ Beta structure`,
      expectedTestCases: 6,
    },
  ];
}

function generateMultiRefChainStress(fmt: string): StressSchema[] {
  return [
    {
      name: `ref-indirection-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        $defs: {
          Base: { type: 'string', format: fmt },
          Mid: { $ref: '#/$defs/Base' },
          Top: { $ref: '#/$defs/Mid' },
        },
        $ref: '#/$defs/Top',
      },
      description: `Format "${fmt}" behind 3-level $ref indirection chain`,
      expectedTestCases: 3,
    },
    {
      name: `ref-fan-out-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        $defs: {
          Fmt: { type: 'string', format: fmt },
        },
        type: 'object',
        properties: {
          a: { $ref: '#/$defs/Fmt' },
          b: { $ref: '#/$defs/Fmt' },
          c: { $ref: '#/$defs/Fmt' },
        },
      },
      description: `Format "${fmt}" in $def referenced by 3 properties (fan-out)`,
      expectedTestCases: 6,
    },
  ];
}

function generateUnionTypeStress(fmt: string): StressSchema[] {
  return [
    {
      name: `union-type-format-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        type: ['string', 'null'],
        format: fmt,
      },
      description: `Format "${fmt}" on union type (string | null)`,
      expectedTestCases: 4,
    },
    {
      name: `union-type-multi-format-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        type: 'object',
        properties: {
          value: {
            type: ['string', 'integer'],
            format: fmt,
          },
        },
      },
      description: `Format "${fmt}" on union type (string | integer) as property`,
      expectedTestCases: 5,
    },
  ];
}

function generateRequiredPropertyStress(fmt: string): StressSchema[] {
  return [
    {
      name: `required-format-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: fmt },
        },
      },
      description: `Format "${fmt}" as required property - must test missing case`,
      expectedTestCases: 3,
    },
  ];
}

function generatePatternOverlapStress(fmt: string): StressSchema[] {
  return [
    {
      name: `pattern-overlap-format-${fmt}`,
      schema: {
        $schema: SCHEMA_2020_12,
        type: 'object',
        properties: {
          value: { type: 'string', format: fmt },
        },
        patternProperties: {
          '^val': { type: 'string', format: fmt },
          '^v': { type: 'string' },
        },
      },
      description: `Format "${fmt}" with overlapping patternProperties`,
      expectedTestCases: 5,
    },
  ];
}

function buildBasicFormatSchema(fmt: string): StressSchema {
  return {
    name: `basic-format-${fmt}`,
    schema: {
      $schema: SCHEMA_2020_12,
      type: 'string',
      format: fmt,
    },
    description: `Basic format "${fmt}" validation - no structural complexity`,
    expectedTestCases: 2,
  };
}

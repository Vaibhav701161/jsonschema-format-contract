import type { FormatStressScenario } from './stressTypes';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Generate all named stress scenarios for a given format.
 */
export function generateAllStressScenarios(format: string): FormatStressScenario[] {
  return [
    recursiveFormatDeep(format),
    mutualRecursiveFormat(format),
    combinatorFormatExplosion(format),
    anyOfBranchMultiplier(format),
    oneOfConflictFormat(format),
    conditionalFormatGate(format),
    dynamicFormatOverride(format),
    formatUnderUnevaluatedProperties(format),
    formatUnionTypeMismatch(format),
    formatUnderRefIndirection(format),
  ];
}

export function recursiveFormatDeep(format: string): FormatStressScenario {
  return {
    name: 'recursive_format_deep',
    description: `Self-recursive schema where format "${format}" is applied at every recursion level`,
    schema: {
      $schema: DRAFT,
      type: 'object',
      format,
      properties: {
        child: { $ref: '#' },
      },
    },
    expectedFailureModes: [
      'infinite-depth-format-validation',
      'stack-overflow-on-deep-recursion',
      'format-not-applied-at-recursive-depth',
    ],
  };
}

export function mutualRecursiveFormat(format: string): FormatStressScenario {
  return {
    name: 'mutual_recursive_format',
    description: `Two definitions reference each other, both carrying format "${format}"`,
    schema: {
      $schema: DRAFT,
      $ref: '#/$defs/A',
      $defs: {
        A: {
          type: 'object',
          format,
          properties: {
            b: { $ref: '#/$defs/B' },
          },
        },
        B: {
          type: 'object',
          format,
          properties: {
            a: { $ref: '#/$defs/A' },
          },
        },
      },
    },
    expectedFailureModes: [
      'mutual-recursion-infinite-loop',
      'format-lost-across-mutual-ref',
      'cycle-detection-failure',
    ],
  };
}

export function combinatorFormatExplosion(format: string): FormatStressScenario {
  return {
    name: 'combinator_format_explosion',
    description: `Deeply nested allOf > oneOf > anyOf each carrying format "${format}"`,
    schema: {
      $schema: DRAFT,
      allOf: [
        {
          oneOf: [
            {
              anyOf: [
                { type: 'string', format },
                { type: 'string', format, minLength: 1 },
              ],
            },
            { type: 'string', format, maxLength: 100 },
          ],
        },
        { type: 'string', format },
      ],
    },
    expectedFailureModes: [
      'exponential-branch-evaluation',
      'format-conflict-across-branches',
      'combinator-short-circuit-skips-format',
    ],
  };
}

export function anyOfBranchMultiplier(format: string): FormatStressScenario {
  return {
    name: 'anyOf_branch_multiplier',
    description: `anyOf with 5 branches each requiring format "${format}" with conflicting constraints`,
    schema: {
      $schema: DRAFT,
      anyOf: [
        { type: 'string', format, minLength: 1 },
        { type: 'string', format, minLength: 5 },
        { type: 'string', format, maxLength: 10 },
        { type: 'string', format, pattern: '^[a-z]+$' },
        { type: 'string', format },
      ],
    },
    expectedFailureModes: [
      'branch-explosion-format-evaluation',
      'format-validated-on-wrong-branch',
      'anyOf-early-exit-skips-format',
    ],
  };
}

export function oneOfConflictFormat(format: string): FormatStressScenario {
  return {
    name: 'oneOf_conflict_format',
    description: `oneOf with overlapping branches that both match format "${format}", causing oneOf invalidation`,
    schema: {
      $schema: DRAFT,
      oneOf: [
        { type: 'string', format },
        { type: 'string', format, minLength: 0 },
      ],
    },
    expectedFailureModes: [
      'oneOf-multiple-match-with-format',
      'format-doesnt-disambiguate-oneOf',
      'both-branches-valid-violation',
    ],
  };
}

export function conditionalFormatGate(format: string): FormatStressScenario {
  return {
    name: 'conditional_format_gate',
    description: `Format "${format}" only applies in then/else branches gated by if condition`,
    schema: {
      $schema: DRAFT,
      type: 'object',
      properties: {
        value: {
          type: 'string',
          if: { minLength: 5 },
          then: { format },
          else: { format: 'uri' },
        },
      },
    },
    expectedFailureModes: [
      'format-applied-without-if-evaluation',
      'then-else-format-conflict',
      'conditional-short-circuit',
    ],
  };
}

export function dynamicFormatOverride(format: string): FormatStressScenario {
  return {
    name: 'dynamic_format_override',
    description: `$dynamicRef overrides format "${format}" at a dynamic anchor point`,
    schema: {
      $schema: DRAFT,
      $id: 'https://example.com/root',
      $ref: '#/$defs/base',
      $defs: {
        base: {
          $dynamicAnchor: 'fmt',
          type: 'string',
          format,
        },
        override: {
          $dynamicAnchor: 'fmt',
          type: 'string',
          format: 'uri',
        },
      },
    },
    expectedFailureModes: [
      'dynamic-anchor-format-not-resolved',
      'format-from-wrong-scope',
      'dynamic-ref-resolution-failure',
    ],
  };
}

export function formatUnderUnevaluatedProperties(format: string): FormatStressScenario {
  return {
    name: 'format_under_unevaluatedProperties',
    description: `Format "${format}" applied via unevaluatedProperties, testing annotation collection`,
    schema: {
      $schema: DRAFT,
      type: 'object',
      properties: {
        known: { type: 'string' },
      },
      unevaluatedProperties: {
        type: 'string',
        format,
      },
    },
    expectedFailureModes: [
      'unevaluated-properties-format-ignored',
      'annotation-collection-incomplete',
      'format-applied-to-evaluated-property',
    ],
  };
}

export function formatUnionTypeMismatch(format: string): FormatStressScenario {
  return {
    name: 'format_union_type_mismatch',
    description: `Format "${format}" with union type ["string", "null"] - format on non-string branch`,
    schema: {
      $schema: DRAFT,
      type: ['string', 'null'],
      format,
    },
    expectedFailureModes: [
      'format-applied-to-null-type',
      'union-type-format-semantics-unclear',
      'format-validation-on-wrong-type',
    ],
  };
}

export function formatUnderRefIndirection(format: string): FormatStressScenario {
  return {
    name: 'format_under_ref_indirection',
    description: `Format "${format}" reached through 4-level $ref chain`,
    schema: {
      $schema: DRAFT,
      $ref: '#/$defs/L1',
      $defs: {
        L1: { $ref: '#/$defs/L2' },
        L2: { $ref: '#/$defs/L3' },
        L3: { $ref: '#/$defs/L4' },
        L4: { type: 'string', format },
      },
    },
    expectedFailureModes: [
      'ref-chain-format-lost',
      'deep-ref-resolution-timeout',
      'format-not-propagated-through-refs',
    ],
  };
}

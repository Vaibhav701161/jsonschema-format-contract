import type { SchemaDraft } from '../types';

/**
 * Known `$schema` URI patterns mapped to draft versions.
 */
const SCHEMA_URI_MAP: Array<{ pattern: RegExp; draft: SchemaDraft }> = [
  { pattern: /draft-04/, draft: 'Draft-04' },
  { pattern: /draft-06/, draft: 'Draft-06' },
  { pattern: /draft-07/, draft: 'Draft-07' },
  { pattern: /draft\/2019-09/, draft: 'Draft 2019-09' },
  { pattern: /draft\/2020-12/, draft: 'Draft 2020-12' },
];

/**
 * Detect the JSON Schema draft version from a parsed schema object.
 *
 * Strategy:
 * 1. If `$schema` is present, match against known URI patterns.
 * 2. If not present, use heuristic keyword detection.
 */
export function detectDraft(schema: unknown): SchemaDraft {
  if (
    schema === null ||
    typeof schema !== 'object' ||
    Array.isArray(schema)
  ) {
    return 'Unknown';
  }

  const obj = schema as Record<string, unknown>;

  // 1. Explicit $schema URI
  if (typeof obj['$schema'] === 'string') {
    const uri = obj['$schema'];
    for (const { pattern, draft } of SCHEMA_URI_MAP) {
      if (pattern.test(uri)) {
        return draft;
      }
    }
  }

  // 2. Heuristic: check for draft-specific keywords
  //    $defs → 2019-09+, definitions → draft-04/06/07
  //    $anchor → 2019-09+
  //    $dynamicRef → 2020-12
  //    $recursiveRef → 2019-09
  if ('$dynamicRef' in obj || '$dynamicAnchor' in obj) {
    return 'Draft 2020-12';
  }
  if ('$recursiveRef' in obj || '$recursiveAnchor' in obj) {
    return 'Draft 2019-09';
  }
  if ('$defs' in obj) {
    return 'Draft 2019-09'; // Could be 2020-12, but default to 2019-09
  }
  if ('definitions' in obj) {
    return 'Draft-07'; // Could be 04/06, default to 07
  }

  return 'Unknown';
}

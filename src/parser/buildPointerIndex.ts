import type { SchemaNode } from '../types';
import { walkSchema } from '../utils/traversal';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extract string-array valued field from a plain object.
 * Returns `undefined` if the key is missing or not a plain object with string keys.
 */
function extractStringKeys(
  node: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const dict = node[key];
  if (!isPlainObject(dict)) return undefined;
  const keys = Object.keys(dict);
  return keys.length > 0 ? keys : undefined;
}

/**
 * Build a complete pointer index from a raw JSON Schema object.
 *
 * Returns `Record<string, SchemaNode>` - one entry per subschema.
 */
export function buildPointerIndex(
  schema: unknown,
): Record<string, SchemaNode> {
  const entries = walkSchema(schema);
  const nodes: Record<string, SchemaNode> = {};

  // First pass: create SchemaNode shells for every visited subschema
  for (const entry of entries) {
    const { pointer, node, depth, parent } = entry;

    const schemaNode: SchemaNode = {
      pointer,
      parent,
      children: [],
      depth,
    };

    if (isPlainObject(node)) {
      populateNodeFields(schemaNode, node);
    }

    nodes[pointer] = schemaNode;
  }

  // Second pass: populate children arrays from parent links
  for (const pointer of Object.keys(nodes)) {
    const node = nodes[pointer];
    if (node.parent !== undefined && nodes[node.parent] !== undefined) {
      nodes[node.parent].children.push(pointer);
    }
  }

  return nodes;
}

/**
 * Populate optional fields on a `SchemaNode` by inspecting the raw
 * schema subobject.  Does NOT mutate the original schema.
 */
function populateNodeFields(
  schemaNode: SchemaNode,
  raw: Record<string, unknown>,
): void {
  // type
  if (typeof raw['type'] === 'string') {
    schemaNode.type = raw['type'];
  } else if (
    Array.isArray(raw['type']) &&
    raw['type'].every((t) => typeof t === 'string')
  ) {
    schemaNode.type = raw['type'] as string[];
  }

  // properties (key names only)
  schemaNode.properties = extractStringKeys(raw, 'properties');

  // patternProperties (pattern strings only)
  schemaNode.patternProperties = extractStringKeys(raw, 'patternProperties');

  // required
  if (
    Array.isArray(raw['required']) &&
    raw['required'].every((r) => typeof r === 'string')
  ) {
    schemaNode.required = raw['required'] as string[];
  }

  // $defs / definitions (def key names - support both Draft 2020-12 and Draft-07)
  const defsFrom$defs = extractStringKeys(raw, '$defs');
  const defsFromDefinitions = extractStringKeys(raw, 'definitions');
  if (defsFrom$defs || defsFromDefinitions) {
    schemaNode.defs = [
      ...(defsFrom$defs ?? []),
      ...(defsFromDefinitions ?? []),
    ];
    // Track which keyword was used so unused-def detection can build correct pointers
    schemaNode.defsKeyword =
      defsFrom$defs && defsFromDefinitions
        ? 'both'
        : defsFrom$defs
          ? '$defs'
          : 'definitions';
  }

  // $ref
  if (typeof raw['$ref'] === 'string') {
    schemaNode.ref = raw['$ref'];
  }

  // format
  if (typeof raw['format'] === 'string') {
    schemaNode.format = raw['format'];
  }

  // combinators
  const combinators: SchemaNode['combinators'] = {};
  let hasCombinator = false;

  // allOf, anyOf, oneOf - record child pointers
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    const arr = raw[key];
    if (Array.isArray(arr)) {
      const childPointers: string[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (isPlainObject(arr[i])) {
          childPointers.push(`${schemaNode.pointer}/${key}/${i}`);
        }
      }
      if (childPointers.length > 0) {
        combinators[key] = childPointers;
        hasCombinator = true;
      }
    }
  }

  // not, if, then, else - record single child pointer
  for (const key of ['not', 'if', 'then', 'else'] as const) {
    if (isPlainObject(raw[key])) {
      combinators[key] = `${schemaNode.pointer}/${key}`;
      hasCombinator = true;
    }
  }

  if (hasCombinator) {
    schemaNode.combinators = combinators;
  }
}

import { encodePointer } from './pointer';

export interface TraversalEntry {
  pointer: string;
  node: unknown;
  depth: number;
  parent?: string;
}

const UNSUPPORTED_KEYWORDS = ['$dynamicRef', '$dynamicAnchor', '$recursiveRef'] as const;

const COMBINATOR_ARRAY_KEYS = ['allOf', 'anyOf', 'oneOf'] as const;
const COMBINATOR_OBJECT_KEYS = ['not', 'if', 'then', 'else'] as const;
const OBJECT_DICT_KEYS = ['properties', 'patternProperties', '$defs', 'definitions'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface StackFrame {
  pointer: string;
  node: unknown;
  depth: number;
  parent?: string;
}

/**
 * Module-level collection of unsupported keywords encountered during the
 * most recent `walkSchema` call. Reset at the start of each invocation.
 */
export let unsupportedKeywordsFound: string[] = [];

/**
 * Walk every subschema in `schema` using iterative DFS.
 *
 * Returns an array of `TraversalEntry` objects - one per subschema.
 * The order is DFS pre-order (parent before children), though the exact
 * sibling order within a node is not guaranteed to be stable.
 */
export function walkSchema(schema: unknown): TraversalEntry[] {
  // Reset module-level state
  unsupportedKeywordsFound = [];
  const unsupportedSet = new Set<string>();

  const result: TraversalEntry[] = [];
  const stack: StackFrame[] = [{ pointer: '#', node: schema, depth: 0 }];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const { pointer, node, depth, parent } = frame;

    result.push({ pointer, node, depth, parent });

    if (!isPlainObject(node)) continue;

    // Check for unsupported keywords (log but do NOT push children)
    for (const kw of UNSUPPORTED_KEYWORDS) {
      if (kw in node && !unsupportedSet.has(kw)) {
        unsupportedSet.add(kw);
      }
    }

    // We push children in reverse order so that-after popping-the first
    // child is processed first (stable DFS pre-order).
    const children: StackFrame[] = [];

    for (const key of OBJECT_DICT_KEYS) {
      const dict = node[key];
      if (!isPlainObject(dict)) continue;
      const keys = Object.keys(dict);
      for (const k of keys) {
        const child = dict[k];
        if (!isPlainObject(child)) continue;
        children.push({
          pointer: encodePointer([...decodeTokens(pointer), key, k]),
          node: child,
          depth: depth + 1,
          parent: pointer,
        });
      }
    }

    if (isPlainObject(node['additionalProperties'])) {
      children.push({
        pointer: encodePointer([...decodeTokens(pointer), 'additionalProperties']),
        node: node['additionalProperties'],
        depth: depth + 1,
        parent: pointer,
      });
    }

    if (isPlainObject(node['items'])) {
      children.push({
        pointer: encodePointer([...decodeTokens(pointer), 'items']),
        node: node['items'],
        depth: depth + 1,
        parent: pointer,
      });
    }

    for (const key of COMBINATOR_ARRAY_KEYS) {
      const arr = node[key];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (!isPlainObject(el)) continue;
        children.push({
          pointer: encodePointer([...decodeTokens(pointer), key, String(i)]),
          node: el,
          depth: depth + 1,
          parent: pointer,
        });
      }
    }

    for (const key of COMBINATOR_OBJECT_KEYS) {
      const sub = node[key];
      if (!isPlainObject(sub)) continue;
      children.push({
        pointer: encodePointer([...decodeTokens(pointer), key]),
        node: sub,
        depth: depth + 1,
        parent: pointer,
      });
    }

    // Push in reverse so first child is popped first
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  unsupportedKeywordsFound = [...unsupportedSet];
  return result;
}

/**
 * Quick token extraction from a pointer string.
 * '#' → [], '#/a/b' → ['a','b']
 */
function decodeTokens(pointer: string): string[] {
  if (pointer === '#' || pointer === '') return [];
  return pointer.slice(2).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

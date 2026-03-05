import type { StructuralModel, SchemaNode } from '../../types';
import type { FormatContext } from './types';

/**
 * Build a minimal reproducible JSON Schema from a format context.
 * The output schema preserves:
 *   - The format node itself
 *   - All ancestor structure
 *   - All $ref targets in the chain
 *   - Combinator structure
 *   - Draft version ($schema)
 */
export function buildMinimalReproducer(
  context: FormatContext,
  model: StructuralModel,
): Record<string, unknown> {
  const { nodes, edges } = model;
  const targetNode = nodes[context.pointer];
  if (targetNode === undefined) {
    // Return bare format schema if node not found
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'string',
      format: context.format,
    };
  }

  // Step 1: Collect required pointers via BFS
  const requiredPointers = collectRequiredPointers(context.pointer, nodes, edges);

  // Step 2: Reconstruct schema from required pointers
  const schema = reconstructSchema(requiredPointers, nodes, context.format);

  return schema;
}

/**
 * Collect all pointers required for the minimal reproducer.
 * BFS up from target, then collect ref targets and necessary children.
 */
function collectRequiredPointers(
  targetPointer: string,
  nodes: Record<string, SchemaNode>,
  _edges: Array<{ from: string; to: string; status: string }>,
): Set<string> {
  const required = new Set<string>();

  // Always include the root
  if (nodes['#'] !== undefined) {
    required.add('#');
  }

  // 1. Walk up from target to root (ancestors)
  let current: string | undefined = targetPointer;
  while (current !== undefined) {
    required.add(current);
    const node: SchemaNode | undefined = nodes[current];
    if (node === undefined) break;
    current = node.parent;
  }

  // 2. Collect all ref targets needed by required nodes
  // Use a queue to follow ref chains iteratively
  const refQueue: string[] = [];
  for (const p of required) {
    const node = nodes[p];
    if (node !== undefined && node.ref !== undefined) {
      refQueue.push(node.ref);
    }
  }

  const visitedRefs = new Set<string>();
  while (refQueue.length > 0) {
    const refTarget = refQueue.shift()!;
    if (visitedRefs.has(refTarget)) continue;
    visitedRefs.add(refTarget);

    if (nodes[refTarget] === undefined) continue;
    required.add(refTarget);

    // Include ancestors of ref target up to a def boundary
    let ancestor: string | undefined = nodes[refTarget].parent;
    while (ancestor !== undefined) {
      required.add(ancestor);
      const ancestorNode = nodes[ancestor];
      if (ancestorNode === undefined) break;
      // Stop if we've reached root or a $defs container
      if (ancestor === '#') break;
      ancestor = ancestorNode.parent;
    }

    // Follow further refs from this target
    const targetNode = nodes[refTarget];
    if (targetNode.ref !== undefined && !visitedRefs.has(targetNode.ref)) {
      refQueue.push(targetNode.ref);
    }
  }

  // 3. Include combinator children that are on the path to the target
  for (const p of Array.from(required)) {
    const node = nodes[p];
    if (node === undefined) continue;

    if (node.combinators !== undefined) {
      const c = node.combinators;
      // Include combinator children that are ancestors of or are the target
      const combChildren = [
        ...(c.allOf ?? []),
        ...(c.anyOf ?? []),
        ...(c.oneOf ?? []),
        ...(c.not !== undefined ? [c.not] : []),
        ...(c.if !== undefined ? [c.if] : []),
        ...(c.then !== undefined ? [c.then] : []),
        ...(c.else !== undefined ? [c.else] : []),
      ];

      for (let i = 0; i < combChildren.length; i++) {
        const child = combChildren[i];
        if (required.has(child)) continue;
        // Include all combinator children for structural validity
        if (nodes[child] !== undefined) {
          required.add(child);
        }
      }
    }
  }

  return required;
}

/**
 * Reconstruct a minimal JSON Schema object from the collected pointers.
 * Builds the schema tree top-down from required pointers.
 */
function reconstructSchema(
  requiredPointers: Set<string>,
  nodes: Record<string, SchemaNode>,
  format: string,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
  };

  const rootNode = nodes['#'];
  if (rootNode === undefined) {
    schema.type = 'string';
    schema.format = format;
    return schema;
  }

  // Build schema by processing required pointers sorted by depth (shallowest first)
  const sortedPointers = Array.from(requiredPointers).sort((a, b) => {
    const da = nodes[a]?.depth ?? 0;
    const db = nodes[b]?.depth ?? 0;
    if (da !== db) return da - db;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // Build nested structure
  const built = new Map<string, Record<string, unknown>>();
  built.set('#', schema);

  for (let i = 0; i < sortedPointers.length; i++) {
    const pointer = sortedPointers[i];
    if (pointer === '#') {
      // Process root node
      applyNodeToSchema(schema, rootNode, requiredPointers, nodes);
      continue;
    }

    const node = nodes[pointer];
    if (node === undefined) continue;

    // Build this node's schema fragment
    const fragment: Record<string, unknown> = {};
    applyNodeToSchema(fragment, node, requiredPointers, nodes);

    built.set(pointer, fragment);

    // Place into parent
    placeInParent(pointer, fragment, built, nodes);
  }

  return schema;
}

/**
 * Apply a SchemaNode's relevant properties to a schema fragment.
 */
function applyNodeToSchema(
  fragment: Record<string, unknown>,
  node: SchemaNode,
  requiredPointers: Set<string>,
  _nodes: Record<string, SchemaNode>,
): void {
  if (node.type !== undefined) {
    fragment.type = node.type;
  }

  if (node.format !== undefined) {
    fragment.format = node.format;
  }

  if (node.ref !== undefined) {
    fragment.$ref = node.ref;
  }

  if (node.required !== undefined && node.required.length > 0) {
    // Only include required properties that are in our required set
    const relevantRequired: string[] = [];
    for (let i = 0; i < node.required.length; i++) {
      const propPointer = `${node.pointer}/properties/${node.required[i]}`;
      if (requiredPointers.has(propPointer)) {
        relevantRequired.push(node.required[i]);
      }
    }
    if (relevantRequired.length > 0) {
      fragment.required = relevantRequired;
    }
  }
}

/**
 * Place a schema fragment into its parent container at the correct key.
 */
function placeInParent(
  pointer: string,
  fragment: Record<string, unknown>,
  built: Map<string, Record<string, unknown>>,
  nodes: Record<string, SchemaNode>,
): void {
  const node = nodes[pointer];
  if (node === undefined || node.parent === undefined) return;

  const parentFragment = built.get(node.parent);
  if (parentFragment === undefined) return;

  // Determine the key from the pointer
  const segments = pointer.split('/');
  if (segments.length < 2) return;

  const key = segments[segments.length - 1];
  const parentKey = segments.length >= 3 ? segments[segments.length - 2] : undefined;

  if (parentKey === 'properties') {
    // Place under properties object
    if (parentFragment.properties === undefined) {
      parentFragment.properties = {};
    }
    (parentFragment.properties as Record<string, unknown>)[key] = fragment;
  } else if (parentKey === '$defs') {
    // Place under $defs object
    if (parentFragment.$defs === undefined) {
      parentFragment.$defs = {};
    }
    (parentFragment.$defs as Record<string, unknown>)[key] = fragment;
  } else if (parentKey === 'definitions') {
    if (parentFragment.definitions === undefined) {
      parentFragment.definitions = {};
    }
    (parentFragment.definitions as Record<string, unknown>)[key] = fragment;
  } else if (parentKey === 'patternProperties') {
    if (parentFragment.patternProperties === undefined) {
      parentFragment.patternProperties = {};
    }
    (parentFragment.patternProperties as Record<string, unknown>)[key] = fragment;
  } else if (parentKey === 'oneOf' || parentKey === 'anyOf' || parentKey === 'allOf') {
    // Array combinator
    if (parentFragment[parentKey] === undefined) {
      parentFragment[parentKey] = [];
    }
    const arr = parentFragment[parentKey] as unknown[];
    const idx = parseInt(key, 10);
    if (!isNaN(idx)) {
      // Ensure array is large enough
      while (arr.length <= idx) arr.push({});
      arr[idx] = fragment;
    }
  } else if (key === 'not' || key === 'if' || key === 'then' || key === 'else') {
    parentFragment[key] = fragment;
  } else if (key === 'properties' || key === '$defs' || key === 'definitions' || key === 'patternProperties') {
    // Container node - skip, handled by children
  } else {
    // Fallback: place directly under parent key
    parentFragment[key] = fragment;
  }
}

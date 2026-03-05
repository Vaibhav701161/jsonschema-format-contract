import type { StructuralModel, SchemaNode } from '../../types';
import type { FormatStructuralContext } from './types';

/**
 * Extract all format structural contexts from a StructuralModel.
 * Returns contexts sorted by pointer (deterministic).
 */
export function extractFormatStructuralContexts(
  model: StructuralModel,
): FormatStructuralContext[] {
  const { nodes, edges, cycles, unsupportedKeywords } = model;

  // Pre-compute sets
  const cyclicPointers = buildCyclicPointerSet(cycles);
  const recursiveReachable = buildRecursiveReachableSet(nodes, cyclicPointers);
  const refDepthMap = computeRefDepthMap(edges, nodes);
  const hasDynamicRef = checkDynamicKeywords(unsupportedKeywords);

  // Pre-compute which pointers are ref targets
  const refTargetSet = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    refTargetSet.add(edges[i].to);
  }

  // Collect format nodes
  const results: FormatStructuralContext[] = [];
  const pointers = Object.keys(nodes);
  for (let i = 0; i < pointers.length; i++) {
    const ptr = pointers[i];
    const node = nodes[ptr];
    if (node.format === undefined) continue;

    const ctx = classifyNode(
      node,
      nodes,
      cyclicPointers,
      recursiveReachable,
      refDepthMap,
      hasDynamicRef,
      refTargetSet,
    );
    results.push(ctx);
  }

  // Deterministic sort by pointer
  results.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));
  return results;
}

function classifyNode(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
  cyclicPointers: Set<string>,
  recursiveReachable: Set<string>,
  refDepthMap: Map<string, number>,
  hasDynamicRef: boolean,
  refTargetSet: Set<string>,
): FormatStructuralContext {
  const pointer = node.pointer;
  const format = node.format!;

  // Walk ancestors to gather structural context
  const ancestorInfo = walkAncestors(pointer, nodes);

  // Ref classification
  const underRef = isUnderRef(pointer, nodes, refTargetSet);
  const refChainDepth = refDepthMap.get(pointer) ?? 0;
  const insideRecursiveCycle = cyclicPointers.has(pointer) || recursiveReachable.has(pointer);

  // Union type
  const underUnionType = Array.isArray(node.type) && node.type.length > 1;
  const unionTypes = underUnionType ? (node.type as string[]).slice() : undefined;

  // Required property
  const requiredProperty = checkRequired(pointer, nodes);

  return {
    pointer,
    format,
    underRef,
    refChainDepth,
    underDynamicRef: hasDynamicRef,
    insideRecursiveCycle,
    underCombinator: ancestorInfo.underCombinator,
    combinatorTypes: ancestorInfo.combinatorTypes,
    combinatorDepth: ancestorInfo.combinatorDepth,
    underConditional: ancestorInfo.underConditional,
    underIf: ancestorInfo.underIf,
    underThen: ancestorInfo.underThen,
    underElse: ancestorInfo.underElse,
    underUnionType,
    unionTypes,
    underPatternProperties: ancestorInfo.underPatternProperties,
    underUnevaluatedProperties: ancestorInfo.underUnevaluatedProperties,
    requiredProperty,
    maxAncestorDepth: node.depth,
  };
}

interface AncestorInfo {
  underCombinator: boolean;
  combinatorTypes: string[];
  combinatorDepth: number;
  underConditional: boolean;
  underIf: boolean;
  underThen: boolean;
  underElse: boolean;
  underPatternProperties: boolean;
  underUnevaluatedProperties: boolean;
}

function walkAncestors(
  pointer: string,
  nodes: Record<string, SchemaNode>,
): AncestorInfo {
  const combinatorTypesSet = new Set<string>();
  let combinatorDepth = 0;
  let underConditional = false;
  let underIf = false;
  let underThen = false;
  let underElse = false;
  let underPatternProperties = false;
  let underUnevaluatedProperties = false;

  // Check pointer segments for positional context
  const segments = pointer.split('/');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === 'if') underIf = true;
    if (seg === 'then') underThen = true;
    if (seg === 'else') underElse = true;
    if (seg === 'patternProperties') underPatternProperties = true;
    if (seg === 'unevaluatedProperties') underUnevaluatedProperties = true;
  }
  underConditional = underIf || underThen || underElse;

  // Walk up parent chain for combinator info
  let current: string | undefined = pointer;
  const visited = new Set<string>();
  while (current !== undefined) {
    if (visited.has(current)) break;
    visited.add(current);

    const n: SchemaNode | undefined = nodes[current];
    if (n === undefined) break;

    if (n.combinators !== undefined) {
      const c = n.combinators;
      if (c.allOf !== undefined && c.allOf.length > 0) combinatorTypesSet.add('allOf');
      if (c.anyOf !== undefined && c.anyOf.length > 0) combinatorTypesSet.add('anyOf');
      if (c.oneOf !== undefined && c.oneOf.length > 0) combinatorTypesSet.add('oneOf');
      if (c.not !== undefined) combinatorTypesSet.add('not');
      // Also check if/then/else from combinators on ancestors
      if (c.if !== undefined) { underConditional = true; }
      if (c.then !== undefined) { underConditional = true; }
      if (c.else !== undefined) { underConditional = true; }
    }

    // Check ancestor for patternProperties / unevaluatedProperties
    if (n.patternProperties !== undefined && n.patternProperties.length > 0) {
      underPatternProperties = true;
    }

    current = n.parent;
  }

  // Compute combinator depth: count combinator-containing ancestors
  const combinatorTypes = Array.from(combinatorTypesSet).sort();
  combinatorDepth = combinatorTypes.length;

  return {
    underCombinator: combinatorTypes.length > 0,
    combinatorTypes,
    combinatorDepth,
    underConditional,
    underIf,
    underThen,
    underElse,
    underPatternProperties,
    underUnevaluatedProperties,
  };
}

/**
 * Check if a pointer is under a $ref - i.e. the pointer itself is a ref target
 * or an ancestor has a ref pointing to it.
 */
function isUnderRef(
  pointer: string,
  nodes: Record<string, SchemaNode>,
  refTargetSet: Set<string>,
): boolean {
  // Walk up the parent chain; if any ancestor is a ref target, we're under ref
  let current: string | undefined = pointer;
  const visited = new Set<string>();
  while (current !== undefined) {
    if (visited.has(current)) break;
    visited.add(current);
    if (refTargetSet.has(current)) return true;
    const n: SchemaNode | undefined = nodes[current];
    if (n === undefined) break;
    // Also check if this node itself has a ref pointing to it
    if (n.ref !== undefined) return true;
    current = n.parent;
  }
  return false;
}

/**
 * Check if a node's property name is in its grandparent's required list.
 */
function checkRequired(
  pointer: string,
  nodes: Record<string, SchemaNode>,
): boolean {
  const segments = pointer.split('/');
  if (segments.length < 3) return false;

  const propertyName = segments[segments.length - 1];
  const parentKey = segments[segments.length - 2];
  if (parentKey !== 'properties') return false;

  // Find the object that owns properties
  const ownerPointer = segments.slice(0, -2).join('/');
  const owner = nodes[ownerPointer];
  if (owner === undefined || owner.required === undefined) return false;

  return owner.required.indexOf(propertyName) !== -1;
}

/**
 * Build set of all pointers that are on a cycle path.
 */
function buildCyclicPointerSet(cycles: string[][]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    for (let j = 0; j < cycle.length; j++) {
      s.add(cycle[j]);
    }
  }
  return s;
}

/**
 * Build set of pointers reachable from cyclic nodes via parent chain.
 * A node is recursively reachable if it or any of its ancestors is cyclic.
 */
function buildRecursiveReachableSet(
  nodes: Record<string, SchemaNode>,
  cyclicPointers: Set<string>,
): Set<string> {
  if (cyclicPointers.size === 0) return new Set();

  const reachable = new Set<string>();
  const pointers = Object.keys(nodes);
  for (let i = 0; i < pointers.length; i++) {
    const ptr = pointers[i];
    if (reachable.has(ptr)) continue;

    // Walk up; if we hit a cyclic pointer, mark everything in the chain
    const chain: string[] = [];
    let current: string | undefined = ptr;
    let found = false;
    const visited = new Set<string>();
    while (current !== undefined) {
      if (visited.has(current)) break;
      visited.add(current);
      chain.push(current);
      if (cyclicPointers.has(current)) { found = true; break; }
      if (reachable.has(current)) { found = true; break; }
      const n: SchemaNode | undefined = nodes[current];
      if (n === undefined) break;
      current = n.parent;
    }

    if (found) {
      for (let j = 0; j < chain.length; j++) {
        reachable.add(chain[j]);
      }
    }
  }
  return reachable;
}

/**
 * Compute ref depth for every node via BFS over edges.
 * refDepth = number of $ref hops needed to reach this node.
 */
function computeRefDepthMap(
  edges: Array<{ from: string; to: string; status: string }>,
  nodes: Record<string, SchemaNode>,
): Map<string, number> {
  const depthMap = new Map<string, number>();

  // Build adjacency: from → to[]
  const adj = new Map<string, string[]>();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.status === 'missing') continue;
    let list = adj.get(e.from);
    if (list === undefined) { list = []; adj.set(e.from, list); }
    list.push(e.to);
  }

  // BFS from root
  depthMap.set('#', 0);
  const queue: string[] = ['#'];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthMap.get(current)!;

    const targets = adj.get(current);
    if (targets === undefined) continue;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (depthMap.has(t)) continue;
      depthMap.set(t, currentDepth + 1);
      queue.push(t);
    }
  }

  // For format nodes not directly ref targets, inherit from nearest ancestor ref target
  const pointers = Object.keys(nodes);
  for (let i = 0; i < pointers.length; i++) {
    const ptr = pointers[i];
    if (depthMap.has(ptr)) continue;

    // Walk up to find nearest ancestor with a ref depth
    let current: string | undefined = nodes[ptr]?.parent;
    const visited = new Set<string>();
    while (current !== undefined) {
      if (visited.has(current)) break;
      visited.add(current);
      if (depthMap.has(current)) {
        // Inherit parent's depth if parent itself has a ref
        const parentNode = nodes[current];
        if (parentNode !== undefined && parentNode.ref !== undefined) {
          depthMap.set(ptr, depthMap.get(current)!);
        }
        break;
      }
      const n: SchemaNode | undefined = nodes[current];
      if (n === undefined) break;
      current = n.parent;
    }
  }

  return depthMap;
}

/**
 * Check if the schema uses dynamic ref keywords.
 */
function checkDynamicKeywords(unsupportedKeywords: string[]): boolean {
  for (let i = 0; i < unsupportedKeywords.length; i++) {
    const kw = unsupportedKeywords[i];
    if (kw === '$dynamicRef' || kw === '$recursiveRef' || kw === '$dynamicAnchor') {
      return true;
    }
  }
  return false;
}

import type { StructuralModel, SchemaNode } from '../../types';
import type { FormatContext } from './types';

/**
 * Extract all format-bearing nodes from a StructuralModel and enrich
 * with full structural context.
 */
export function extractFormatContexts(model: StructuralModel): FormatContext[] {
  const { nodes, edges, cycles, unsupportedKeywords } = model;
  const pointers = Object.keys(nodes);
  const result: FormatContext[] = [];

  // Pre-compute ref depth per pointer
  const refDepthMap = computeRefDepthMap(model);

  // Pre-compute set of pointers on cycles for O(1) lookup
  const cyclicPointers = buildCyclicPointerSet(cycles);

  // Pre-compute whether dynamic context exists
  const hasDynamic = checkDynamicContext(unsupportedKeywords);

  // Pre-compute ref reachability from cyclic nodes
  const recursiveReachable = buildRecursiveReachableSet(nodes, edges, cyclicPointers);

  for (let i = 0; i < pointers.length; i++) {
    const pointer = pointers[i];
    const node = nodes[pointer];

    if (node.format === undefined) continue;

    const combinatorInfo = computeCombinatorInfo(node, nodes);
    const conditionalContext = checkConditionalContext(node, nodes);
    const recursiveContext = recursiveReachable.has(pointer);
    const unionType = Array.isArray(node.type) && node.type.length > 1;
    const required = isPropertyRequired(node, nodes);
    const patternPropertyContext = checkPatternPropertyContext(node, nodes);
    const refDepth = refDepthMap[pointer] ?? 0;

    result.push({
      pointer,
      format: node.format,
      depth: node.depth,
      refDepth,
      combinatorDepth: combinatorInfo.depth,
      combinatorTypes: combinatorInfo.types,
      conditionalContext,
      recursiveContext,
      dynamicContext: hasDynamic,
      unionType,
      required,
      patternPropertyContext,
    });
  }

  // Sort by pointer for deterministic output
  result.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));

  return result;
}

interface CombinatorInfo {
  depth: number;
  types: string[];
}

/**
 * Walk up from node and collect combinator info:
 *   - depth = count of ancestor nodes with any combinator
 *   - types = unique combinator keywords from ancestors (root-first)
 */
function computeCombinatorInfo(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): CombinatorInfo {
  const types: string[] = [];
  const seen = new Set<string>();
  let depth = 0;
  let current = node.parent;

  while (current !== undefined) {
    const parent = nodes[current];
    if (parent === undefined) break;

    if (parent.combinators !== undefined) {
      depth++;
      const c = parent.combinators;
      if (c.oneOf !== undefined && !seen.has('oneOf')) { seen.add('oneOf'); types.push('oneOf'); }
      if (c.anyOf !== undefined && !seen.has('anyOf')) { seen.add('anyOf'); types.push('anyOf'); }
      if (c.allOf !== undefined && !seen.has('allOf')) { seen.add('allOf'); types.push('allOf'); }
      if (c.not !== undefined && !seen.has('not')) { seen.add('not'); types.push('not'); }
      if (c.if !== undefined && !seen.has('if')) { seen.add('if'); types.push('if'); }
      if (c.then !== undefined && !seen.has('then')) { seen.add('then'); types.push('then'); }
      if (c.else !== undefined && !seen.has('else')) { seen.add('else'); types.push('else'); }
    }

    current = parent.parent;
  }

  // Reverse so root-level combinators come first
  types.reverse();

  return { depth, types };
}

/**
 * Check if node is inside an if/then/else structure.
 * Walks up parents looking for if, then, or else in pointer segments
 * or in parent combinator keywords.
 */
function checkConditionalContext(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): boolean {
  // Check pointer segments for if/then/else
  const segments = node.pointer.split('/');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === 'if' || seg === 'then' || seg === 'else') return true;
  }

  // Also check parent combinators
  let current = node.parent;
  while (current !== undefined) {
    const parent = nodes[current];
    if (parent === undefined) break;
    if (parent.combinators !== undefined) {
      const c = parent.combinators;
      if (c.if !== undefined || c.then !== undefined || c.else !== undefined) {
        return true;
      }
    }
    current = parent.parent;
  }

  return false;
}

/**
 * Check if a node is a required property in its parent's required list.
 */
function isPropertyRequired(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): boolean {
  if (node.parent === undefined) return false;

  const parent = nodes[node.parent];
  if (parent === undefined || parent.required === undefined) return false;

  const segments = node.pointer.split('/');
  if (segments.length < 2) return false;

  const lastSegment = segments[segments.length - 1];
  const secondLast = segments[segments.length - 2];

  if (secondLast !== 'properties') return false;

  return parent.required.includes(lastSegment);
}

/**
 * Check if node is under patternProperties or has patternProperties.
 */
function checkPatternPropertyContext(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): boolean {
  // Check if in pointer path
  if (node.pointer.includes('/patternProperties/')) return true;

  // Check if self or any ancestor has patternProperties
  if (node.patternProperties !== undefined && node.patternProperties.length > 0) {
    return true;
  }

  let current = node.parent;
  while (current !== undefined) {
    const parent = nodes[current];
    if (parent === undefined) break;
    if (parent.patternProperties !== undefined && parent.patternProperties.length > 0) {
      return true;
    }
    current = parent.parent;
  }

  return false;
}

/**
 * Check if the schema uses dynamic references ($dynamicRef or $recursiveRef).
 */
function checkDynamicContext(unsupportedKeywords: string[]): boolean {
  for (let i = 0; i < unsupportedKeywords.length; i++) {
    const kw = unsupportedKeywords[i];
    if (kw === '$dynamicRef' || kw === '$recursiveRef' || kw === '$dynamicAnchor') {
      return true;
    }
  }
  return false;
}

/**
 * Build a Set of all pointers that appear in any cycle.
 */
function buildCyclicPointerSet(cycles: string[][]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    for (let j = 0; j < cycle.length; j++) {
      set.add(cycle[j]);
    }
  }
  return set;
}

/**
 * Build a Set of all pointers reachable from cyclic nodes.
 * Uses iterative BFS from each cyclic pointer, following
 * children and ref edges.
 */
function buildRecursiveReachableSet(
  nodes: Record<string, SchemaNode>,
  _edges: Array<{ from: string; to: string; status: string }>,
  cyclicPointers: Set<string>,
): Set<string> {
  if (cyclicPointers.size === 0) return new Set();

  // Also include any node that is a descendant (via parent chain) of a cyclic node
  const reachable = new Set<string>();

  // Add all cyclic pointers themselves
  for (const p of cyclicPointers) {
    reachable.add(p);
  }

  // For each node, walk up parent chain to see if any ancestor is cyclic
  const allPointers = Object.keys(nodes);
  for (let i = 0; i < allPointers.length; i++) {
    const pointer = allPointers[i];
    if (reachable.has(pointer)) continue;

    let current: string | undefined = pointer;
    const chain: string[] = [];
    let foundCyclic = false;

    while (current !== undefined) {
      if (reachable.has(current)) {
        foundCyclic = true;
        break;
      }
      chain.push(current);
      const node: SchemaNode | undefined = nodes[current];
      if (node === undefined) break;

      // Check if reachable via ref edge to a cyclic target
      if (node.ref !== undefined && cyclicPointers.has(node.ref)) {
        foundCyclic = true;
        break;
      }

      current = node.parent;
    }

    if (foundCyclic) {
      for (let j = 0; j < chain.length; j++) {
        reachable.add(chain[j]);
      }
    }
  }

  return reachable;
}

/**
 * Compute ref chain depth for every pointer.
 * Iterative BFS approach - no recursion.
 */
function computeRefDepthMap(model: StructuralModel): Record<string, number> {
  const depthMap: Record<string, number> = Object.create(null);
  const { nodes, edges } = model;

  // Build adjacency: from → to (only normal/cycle edges)
  const refTargets: Record<string, string[]> = Object.create(null);
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.status === 'missing') continue;
    if (refTargets[edge.from] === undefined) {
      refTargets[edge.from] = [];
    }
    refTargets[edge.from].push(edge.to);
  }

  // Initialize all pointers to depth 0
  const allPointers = Object.keys(nodes);
  for (let i = 0; i < allPointers.length; i++) {
    depthMap[allPointers[i]] = 0;
  }

  // BFS: propagate depths through ref edges
  const queue: string[] = [];
  for (let i = 0; i < allPointers.length; i++) {
    const p = allPointers[i];
    const node = nodes[p];
    if (node.ref !== undefined) {
      queue.push(p);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const targets = refTargets[current];
    if (targets === undefined) continue;

    const currentDepth = depthMap[current] ?? 0;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const newDepth = currentDepth + 1;
      if (newDepth > (depthMap[target] ?? 0)) {
        depthMap[target] = newDepth;
        if (!visited.has(target)) {
          queue.push(target);
        }
      }
    }
  }

  return depthMap;
}

import type { StructuralModel, SchemaNode } from '../types';
import type { FormatNode } from './types';

/**
 * Extract all format nodes from a structural model.
 * Returns a sorted array of FormatNode (sorted by pointer for determinism).
 */
export function extractFormatNodes(model: StructuralModel): FormatNode[] {
  const nodes = model.nodes;
  const pointers = Object.keys(nodes);
  const result: FormatNode[] = [];

  // Pre-compute ref chain depth per pointer using iterative walk
  const refDepthMap = computeRefDepthMap(model);

  for (let i = 0; i < pointers.length; i++) {
    const pointer = pointers[i];
    const node = nodes[pointer];

    if (node.format === undefined) continue;

    const combinatorContext = computeCombinatorContext(node, nodes);
    const required = isPropertyRequired(node, nodes);
    const refDepth = refDepthMap[pointer] ?? 0;

    result.push({
      pointer: node.pointer,
      format: node.format,
      type: node.type,
      depth: node.depth,
      refDepth,
      combinatorContext,
      required,
    });
  }

  // Sort by pointer for deterministic output
  result.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));

  return result;
}

/**
 * Walk up from node through parents and collect combinator keywords.
 * Returns list like ["oneOf", "if", "allOf"] - ancestor combinators
 * that affect this node.
 */
function computeCombinatorContext(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): string[] {
  const context: string[] = [];
  let current = node.parent;

  while (current !== undefined) {
    const parent = nodes[current];
    if (parent === undefined) break;

    if (parent.combinators !== undefined) {
      const c = parent.combinators;
      if (c.oneOf !== undefined) context.push('oneOf');
      if (c.anyOf !== undefined) context.push('anyOf');
      if (c.allOf !== undefined) context.push('allOf');
      if (c.not !== undefined) context.push('not');
      if (c.if !== undefined) context.push('if');
      if (c.then !== undefined) context.push('then');
      if (c.else !== undefined) context.push('else');
    }

    current = parent.parent;
  }

  // Reverse so root-level combinators come first
  context.reverse();
  return context;
}

/**
 * Check if a node is a required property by inspecting its parent's
 * required list.
 */
function isPropertyRequired(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): boolean {
  if (node.parent === undefined) return false;

  const parent = nodes[node.parent];
  if (parent === undefined || parent.required === undefined) return false;

  // Extract property name from pointer
  // e.g. "#/properties/email" → "email"
  const segments = node.pointer.split('/');
  if (segments.length < 2) return false;

  const lastSegment = segments[segments.length - 1];
  const secondLast = segments[segments.length - 2];

  // Only consider nodes under "properties"
  if (secondLast !== 'properties') return false;

  return parent.required.includes(lastSegment);
}

/**
 * Compute the ref chain depth for every pointer.
 * A node's ref depth is the max number of $ref hops to reach it
 * from a non-ref path.
 *
 * Uses iterative BFS approach - no recursion.
 */
function computeRefDepthMap(model: StructuralModel): Record<string, number> {
  const depthMap: Record<string, number> = Object.create(null);
  const edges = model.edges;

  // Build adjacency: target → list of sources
  // We want: for each node, what is the longest chain of refs leading to it?
  const incomingRefs: Record<string, string[]> = Object.create(null);
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.status === 'normal' || edge.status === 'cycle') {
      if (incomingRefs[edge.to] === undefined) {
        incomingRefs[edge.to] = [];
      }
      incomingRefs[edge.to].push(edge.from);
    }
  }

  // For each node, count the ref chain depth by following ref edges backwards
  const pointers = Object.keys(model.nodes);
  for (let i = 0; i < pointers.length; i++) {
    const pointer = pointers[i];
    const node = model.nodes[pointer];
    if (node.ref === undefined) {
      depthMap[pointer] = 0;
      continue;
    }

    // Count how many hops through refs to reach a definition
    let depth = 0;
    let current: string | undefined = pointer;
    const visited = new Set<string>();

    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const refNode: SchemaNode | undefined = model.nodes[current];
      if (refNode === undefined || refNode.ref === undefined) break;

      // Resolve the ref target
      const target: string | undefined = refNode.ref.startsWith('#') ? refNode.ref : undefined;
      if (target === undefined) break;

      depth++;
      current = target;
    }

    depthMap[pointer] = depth;
  }

  return depthMap;
}

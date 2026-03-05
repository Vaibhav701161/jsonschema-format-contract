import type { StructuralModel, SchemaNode } from '../types';
import type { FormatSurfaceReport, FormatRiskWeights } from './types';
import { DEFAULT_FORMAT_RISK_WEIGHTS } from './types';
import { extractFormatNodes } from './extractFormatNodes';

function countBranches(node: SchemaNode): number {
  if (node.combinators === undefined) return 0;
  const c = node.combinators;
  let count = 0;
  if (c.allOf !== undefined) count += c.allOf.length;
  if (c.anyOf !== undefined) count += c.anyOf.length;
  if (c.oneOf !== undefined) count += c.oneOf.length;
  if (c.if !== undefined) count += 1;
  if (c.then !== undefined) count += 1;
  if (c.else !== undefined) count += 1;
  return count;
}

/**
 * Analyze the format surface of a schema.
 * Returns sorted array of FormatSurfaceReport (by pointer).
 */
export function analyzeFormatSurface(
  model: StructuralModel,
  weights: FormatRiskWeights = DEFAULT_FORMAT_RISK_WEIGHTS,
): FormatSurfaceReport[] {
  const formatNodes = extractFormatNodes(model);
  if (formatNodes.length === 0) return [];

  // Pre-compute fan-out map: target pointer → incoming edge count
  const fanOutMap = computeFanOutMap(model);

  const result: FormatSurfaceReport[] = [];

  for (let i = 0; i < formatNodes.length; i++) {
    const fn = formatNodes[i];
    const node = model.nodes[fn.pointer];
    if (node === undefined) continue;

    const branchDepth = computeBranchDepth(node, model.nodes);
    const combinatorDepth = computeCombinatorDepth(node, model.nodes);
    const fanOut = computeNodeFanOut(node, model.nodes, fanOutMap);

    const riskScore = computeRiskScore(
      branchDepth,
      fn.refDepth,
      combinatorDepth,
      fanOut,
      weights,
    );

    result.push({
      format: fn.format,
      pointer: fn.pointer,
      branchDepth,
      refDepth: fn.refDepth,
      combinatorDepth,
      fanOut,
      riskScore,
    });
  }

  // Sort by pointer for deterministic output
  result.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));

  return result;
}

/**
 * Count combinator branching that affects this node.
 * Walks up the parent chain counting branches from all ancestor
 * combinators.
 */
function computeBranchDepth(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): number {
  let total = 0;

  // Count branches at this node
  total += countBranches(node);

  // Walk up and accumulate ancestor branch counts from combinators
  let current = node.parent;
  while (current !== undefined) {
    const parent = nodes[current];
    if (parent === undefined) break;

    if (parent.combinators !== undefined) {
      const c = parent.combinators;
      if (c.oneOf !== undefined) total += c.oneOf.length;
      if (c.anyOf !== undefined) total += c.anyOf.length;
      if (c.allOf !== undefined && c.allOf.length > 1) total += c.allOf.length;
      if (c.if !== undefined) total += 1;
      if (c.then !== undefined) total += 1;
      if (c.else !== undefined) total += 1;
    }

    current = parent.parent;
  }

  return total;
}

/**
 * Max combinator nesting depth above a node.
 * Counts how many ancestor nodes have combinators.
 */
function computeCombinatorDepth(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
): number {
  let depth = 0;
  let current = node.parent;

  while (current !== undefined) {
    const parent = nodes[current];
    if (parent === undefined) break;

    if (parent.combinators !== undefined) {
      depth++;
    }

    current = parent.parent;
  }

  return depth;
}

/**
 * Pre-compute the fan-out map: for each definition target,
 * how many edges point to it.
 */
function computeFanOutMap(model: StructuralModel): Record<string, number> {
  const map: Record<string, number> = Object.create(null);
  for (let i = 0; i < model.edges.length; i++) {
    const edge = model.edges[i];
    if (edge.status === 'normal' || edge.status === 'cycle') {
      map[edge.to] = (map[edge.to] ?? 0) + 1;
    }
  }
  return map;
}

/**
 * Compute fan-out for a specific node.
 * If the node is inside a $defs block, count how many edges point
 * to its nearest definition ancestor.
 */
function computeNodeFanOut(
  node: SchemaNode,
  nodes: Record<string, SchemaNode>,
  fanOutMap: Record<string, number>,
): number {
  // Check if this node itself or any ancestor is a definition target
  let current: string | undefined = node.pointer;

  while (current !== undefined) {
    if (fanOutMap[current] !== undefined) {
      return fanOutMap[current];
    }
    const n: SchemaNode | undefined = nodes[current];
    if (n === undefined) break;
    current = n.parent;
  }

  return 0;
}

/**
 * Compute weighted risk score, capped at 100.
 */
function computeRiskScore(
  branchDepth: number,
  refDepth: number,
  combinatorDepth: number,
  fanOut: number,
  weights: FormatRiskWeights,
): number {
  const raw =
    branchDepth * weights.branchDepthWeight +
    refDepth * weights.refDepthWeight +
    combinatorDepth * weights.combinatorDepthWeight +
    fanOut * weights.fanOutWeight;

  return Math.min(100, Math.round(raw));
}

import type { RefEdge, StructuralModel } from '../types';

type Color = 'white' | 'gray' | 'black';

/**
 * Returns true if `pointer` is the same as `ancestor` or is a structural
 * descendant (i.e., `ancestor` is a proper prefix segment).
 */
function isDescendantOrSelf(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(ancestor + '/');
}

/**
 * Detect cycles in the ref graph using iterative 3-color DFS.
 *
 * Returns a new `StructuralModel` with `cycles` populated and
 * cycle-forming edges annotated with `status: 'cycle'`.
 */
export function detectCycles(model: StructuralModel): StructuralModel {
  const normalEdges = model.edges.filter((e) => e.status === 'normal');

  if (normalEdges.length === 0) {
    return { ...model, cycles: [] };
  }

  // Collect all unique ref targets - these are the nodes of the logical graph
  const refTargets = new Set<string>();
  for (const edge of normalEdges) {
    refTargets.add(edge.to);
  }

  // Build logical adjacency: refTarget → [refTargets reachable from its subtree]
  // Also track which actual RefEdge(s) implement each logical edge
  const adjacency: Record<string, string[]> = {};
  const edgeMap: Record<string, RefEdge[]> = {}; // "from->to" → actual edges

  for (const target of refTargets) {
    const neighbors: string[] = [];
    for (const edge of normalEdges) {
      if (isDescendantOrSelf(edge.from, target)) {
        neighbors.push(edge.to);
        const key = `${target}->${edge.to}`;
        if (!edgeMap[key]) edgeMap[key] = [];
        edgeMap[key].push(edge);
      }
    }
    adjacency[target] = neighbors;
  }

  const color: Record<string, Color> = {};
  for (const node of refTargets) {
    color[node] = 'white';
  }

  const parentMap: Record<string, string | undefined> = {};
  const cycles: string[][] = [];
  const cycleActualEdges = new Set<RefEdge>();

  interface StackFrame {
    node: string;
    phase: 'enter' | 'exit';
  }

  for (const startNode of refTargets) {
    if (color[startNode] !== 'white') continue;

    const stack: StackFrame[] = [{ node: startNode, phase: 'enter' }];

    while (stack.length > 0) {
      const frame = stack.pop()!;

      if (frame.phase === 'exit') {
        color[frame.node] = 'black';
        continue;
      }

      if (color[frame.node] !== 'white') continue;

      color[frame.node] = 'gray';
      stack.push({ node: frame.node, phase: 'exit' });

      const neighbors = adjacency[frame.node] || [];
      for (const neighbor of neighbors) {
        if (color[neighbor] === 'gray') {
          const cyclePath = extractCyclePath(
            frame.node,
            neighbor,
            parentMap,
          );
          cycles.push(cyclePath);

          // Mark ALL actual edges along the cycle path
          for (let i = 0; i < cyclePath.length; i++) {
            const from = cyclePath[i];
            const to = cyclePath[(i + 1) % cyclePath.length];
            const key = `${from}->${to}`;
            for (const edge of edgeMap[key] || []) {
              cycleActualEdges.add(edge);
            }
          }
        } else if (color[neighbor] === 'white') {
          parentMap[neighbor] = frame.node;
          stack.push({ node: neighbor, phase: 'enter' });
        }
      }
    }
  }

  const updatedEdges: RefEdge[] = model.edges.map((edge) => {
    if (cycleActualEdges.has(edge)) {
      return { ...edge, status: 'cycle' as const };
    }
    return edge;
  });

  return {
    ...model,
    edges: updatedEdges,
    cycles,
  };
}

/**
 * Extract the cycle path by walking the parent chain from `current`
 * back to `cycleTarget`.
 *
 * Returns e.g. `[A, B]` for the cycle A → B → A (the closing edge
 * back to A is implied).
 */
function extractCyclePath(
  current: string,
  cycleTarget: string,
  parentMap: Record<string, string | undefined>,
): string[] {
  const path: string[] = [current];
  let node = current;

  while (node !== cycleTarget && parentMap[node] !== undefined) {
    node = parentMap[node]!;
    path.push(node);
  }

  // For a self-loop (current === cycleTarget), path is just [current]
  path.reverse();
  return path;
}

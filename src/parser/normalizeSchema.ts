import type { SchemaNode, StructuralModel } from '../types';
import { unsupportedKeywordsFound } from '../utils/traversal';

/**
 * Validate structural integrity of the node map.
 *
 * Checks:
 * 1. No orphaned children - every pointer in `children` exists in the map
 * 2. No duplicate pointers - inherently guaranteed by Record keys
 * 3. Every non-root node's parent exists in the map
 */
function validateIntegrity(nodes: Record<string, SchemaNode>): void {
  for (const [pointer, node] of Object.entries(nodes)) {
    // Check that parent exists (unless root)
    if (node.parent !== undefined && !(node.parent in nodes)) {
      throw new Error(
        `Integrity error: node "${pointer}" references parent "${node.parent}" which does not exist in the index`,
      );
    }

    // Check that all children exist
    for (const child of node.children) {
      if (!(child in nodes)) {
        throw new Error(
          `Integrity error: node "${pointer}" lists child "${child}" which does not exist in the index`,
        );
      }
    }
  }
}

/**
 * Build a `StructuralModel` skeleton from the pointer index.
 *
 * The returned model has `edges`, `cycles`, and `missingTargets` empty -
 * those are populated by Phase 2 (ref graph + cycle detection).
 */
export function normalizeSchema(
  nodes: Record<string, SchemaNode>,
): StructuralModel {
  validateIntegrity(nodes);

  return {
    nodes,
    edges: [],
    cycles: [],
    missingTargets: [],
    unsupportedKeywords: [...unsupportedKeywordsFound],
  };
}

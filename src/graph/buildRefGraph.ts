import type { RefEdge, StructuralModel } from '../types';
import { isInternalRef } from '../utils/pointer';

/**
 * Build the ref edge array from all `$ref` values in the node map.
 *
 * Returns a new `StructuralModel` with `edges` and `missingTargets` populated.
 */
export function buildRefGraph(model: StructuralModel): StructuralModel {
  const edges: RefEdge[] = [];
  const missingTargets: string[] = [];
  const unsupportedKeywords = [...model.unsupportedKeywords];

  for (const node of Object.values(model.nodes)) {
    if (node.ref === undefined) continue;

    // Skip non-internal refs - log them
    if (!isInternalRef(node.ref)) {
      if (!unsupportedKeywords.includes(node.ref)) {
        unsupportedKeywords.push(node.ref);
      }
      continue;
    }

    const targetPointer = node.ref;

    if (targetPointer in model.nodes) {
      // Target exists - normal edge
      edges.push({
        from: node.pointer,
        to: targetPointer,
        status: 'normal',
      });
    } else {
      // Target missing - record missing edge and target
      edges.push({
        from: node.pointer,
        to: targetPointer,
        status: 'missing',
      });
      if (!missingTargets.includes(targetPointer)) {
        missingTargets.push(targetPointer);
      }
    }
  }

  return {
    ...model,
    edges,
    missingTargets,
    unsupportedKeywords,
  };
}

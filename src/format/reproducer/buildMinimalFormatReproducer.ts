import type { StructuralModel, SchemaNode } from '../../types';
import type { FormatReproducerResult } from './types';

export function buildMinimalFormatReproducer(
  model: StructuralModel,
  contextPointer: string,
): FormatReproducerResult | null {
  const { nodes, edges } = model;
  const targetNode = nodes[contextPointer];
  if (!targetNode || !targetNode.format) return null;

  // 1. Collect ancestor chain (iterative)
  const ancestorPointers: string[] = [];
  const included = new Set<string>();
  included.add(contextPointer);

  let current: string | undefined = contextPointer;
  while (current !== undefined) {
    const node: SchemaNode | undefined = nodes[current];
    if (!node) break;
    if (current !== contextPointer) {
      ancestorPointers.push(current);
    }
    included.add(current);
    current = node.parent;
  }

  // 2. Collect ref targets from included nodes (BFS over edges)
  const refQueue: string[] = Array.from(included);
  const visited = new Set<string>(included);
  while (refQueue.length > 0) {
    const ptr = refQueue.shift()!;
    const node = nodes[ptr];
    if (!node) continue;

    // Direct ref
    if (node.ref && nodes[node.ref] && !visited.has(node.ref)) {
      visited.add(node.ref);
      included.add(node.ref);
      refQueue.push(node.ref);
    }
  }

  // Also include ref edge targets
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (included.has(edge.from) && !included.has(edge.to) && nodes[edge.to]) {
      included.add(edge.to);
    }
  }

  // 3. Include required siblings - for each ancestor, if it has required,
  //    include those property nodes if they exist
  const extraPointers: string[] = [];
  for (const ptr of included) {
    const node = nodes[ptr];
    if (!node || !node.required) continue;
    for (let i = 0; i < node.required.length; i++) {
      const propPointer = `${ptr}/properties/${node.required[i]}`;
      if (nodes[propPointer] && !included.has(propPointer)) {
        extraPointers.push(propPointer);
      }
    }
  }
  for (let i = 0; i < extraPointers.length; i++) {
    included.add(extraPointers[i]);
  }

  // 4. Sort for determinism
  const sortedPointers = Array.from(included).sort();

  // 5. Rebuild minimal schema
  const schema = rebuildSchema(model, targetNode, sortedPointers);

  return {
    targetPointer: contextPointer,
    format: targetNode.format,
    schema,
    includedPointers: sortedPointers,
  };
}

function rebuildSchema(
  model: StructuralModel,
  target: SchemaNode,
  includedPointers: string[],
): Record<string, unknown> {
  const { nodes } = model;

  // Start with root node if included, else build from target
  const root = nodes['#'] || nodes[''];
  const schema: Record<string, unknown> = {};

  // Preserve $schema from root if available
  if (root) {
    // Look for $schema in unsupported keywords or infer 2020-12
    schema['$schema'] = 'https://json-schema.org/draft/2020-12/schema';
  }

  // Build included set for fast lookup
  const includedSet = new Set(includedPointers);

  // Check if we need $defs
  const defsNeeded: Record<string, unknown> = {};
  let hasDefsContent = false;

  for (let i = 0; i < includedPointers.length; i++) {
    const ptr = includedPointers[i];
    // Check if this is under $defs or definitions
    const defsMatch = ptr.match(/^#\/\$defs\/([^/]+)/);
    const definitionsMatch = ptr.match(/^#\/definitions\/([^/]+)/);
    if (defsMatch && ptr === `#/$defs/${defsMatch[1]}`) {
      defsNeeded[defsMatch[1]] = buildNodeSchema(nodes[ptr], includedSet, nodes);
      hasDefsContent = true;
    } else if (definitionsMatch && ptr === `#/definitions/${definitionsMatch[1]}`) {
      defsNeeded[definitionsMatch[1]] = buildNodeSchema(nodes[ptr], includedSet, nodes);
      hasDefsContent = true;
    }
  }

  if (hasDefsContent) {
    // Determine keyword from root node
    const defsKeyword = root?.defsKeyword === 'definitions' ? 'definitions' : '$defs';
    schema[defsKeyword] = defsNeeded;
  }

  // Build the main schema body from the root
  if (root && includedSet.has('#')) {
    Object.assign(schema, buildNodeSchema(root, includedSet, nodes));
  } else if (root && includedSet.has('')) {
    Object.assign(schema, buildNodeSchema(root, includedSet, nodes));
  } else {
    // Target is top-level or we need to build path down
    Object.assign(schema, buildPathToTarget(target, includedSet, nodes));
  }

  return schema;
}

function buildNodeSchema(
  node: SchemaNode,
  included: Set<string>,
  allNodes: Record<string, SchemaNode>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // type
  if (node.type) result['type'] = node.type;

  // format
  if (node.format) result['format'] = node.format;

  // $ref
  if (node.ref) result['$ref'] = node.ref;

  // properties
  if (node.properties && node.properties.length > 0) {
    const props: Record<string, unknown> = {};
    let hasProps = false;
    for (let i = 0; i < node.properties.length; i++) {
      const propPtr = `${node.pointer}/properties/${node.properties[i]}`;
      if (included.has(propPtr) && allNodes[propPtr]) {
        props[node.properties[i]] = buildNodeSchema(allNodes[propPtr], included, allNodes);
        hasProps = true;
      }
    }
    if (hasProps) result['properties'] = props;
  }

  // patternProperties
  if (node.patternProperties && node.patternProperties.length > 0) {
    const pprops: Record<string, unknown> = {};
    let hasPP = false;
    for (let i = 0; i < node.patternProperties.length; i++) {
      const ppPtr = `${node.pointer}/patternProperties/${node.patternProperties[i]}`;
      if (included.has(ppPtr) && allNodes[ppPtr]) {
        pprops[node.patternProperties[i]] = buildNodeSchema(allNodes[ppPtr], included, allNodes);
        hasPP = true;
      }
    }
    if (hasPP) result['patternProperties'] = pprops;
  }

  // required
  if (node.required && node.required.length > 0) {
    result['required'] = [...node.required].sort();
  }

  // combinators
  if (node.combinators) {
    const c = node.combinators;
    if (c.allOf) {
      const items = buildCombinatorItems(node.pointer, 'allOf', c.allOf, included, allNodes);
      if (items.length > 0) result['allOf'] = items;
    }
    if (c.anyOf) {
      const items = buildCombinatorItems(node.pointer, 'anyOf', c.anyOf, included, allNodes);
      if (items.length > 0) result['anyOf'] = items;
    }
    if (c.oneOf) {
      const items = buildCombinatorItems(node.pointer, 'oneOf', c.oneOf, included, allNodes);
      if (items.length > 0) result['oneOf'] = items;
    }
    if (c.if) {
      const ifPtr = c.if;
      if (included.has(ifPtr) && allNodes[ifPtr]) {
        result['if'] = buildNodeSchema(allNodes[ifPtr], included, allNodes);
      }
    }
    if (c.then) {
      const thenPtr = c.then;
      if (included.has(thenPtr) && allNodes[thenPtr]) {
        result['then'] = buildNodeSchema(allNodes[thenPtr], included, allNodes);
      }
    }
    if (c.else) {
      const elsePtr = c.else;
      if (included.has(elsePtr) && allNodes[elsePtr]) {
        result['else'] = buildNodeSchema(allNodes[elsePtr], included, allNodes);
      }
    }
  }

  return result;
}

function buildCombinatorItems(
  _parentPointer: string,
  _keyword: string,
  itemPointers: string[],
  included: Set<string>,
  allNodes: Record<string, SchemaNode>,
): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < itemPointers.length; i++) {
    if (included.has(itemPointers[i]) && allNodes[itemPointers[i]]) {
      items.push(buildNodeSchema(allNodes[itemPointers[i]], included, allNodes));
    }
  }
  return items;
}

function buildPathToTarget(
  target: SchemaNode,
  included: Set<string>,
  allNodes: Record<string, SchemaNode>,
): Record<string, unknown> {
  // Simple fallback: just output the target node's schema
  return buildNodeSchema(target, included, allNodes);
}

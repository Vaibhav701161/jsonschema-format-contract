
export interface SchemaNode {
  pointer: string;
  parent?: string;
  children: string[];
  depth: number;
  type?: string | string[];
  properties?: string[];
  patternProperties?: string[];
  required?: string[];
  defs?: string[];
  defsKeyword?: '$defs' | 'definitions' | 'both';
  combinators?: {
    allOf?: string[];
    anyOf?: string[];
    oneOf?: string[];
    not?: string;
    if?: string;
    then?: string;
    else?: string;
  };
  ref?: string;
  format?: string;
}

export interface RefEdge {
  from: string;
  to: string;
  status: 'normal' | 'cycle' | 'missing';
}

export interface StructuralModel {
  nodes: Record<string, SchemaNode>;
  edges: RefEdge[];
  cycles: string[][];
  missingTargets: string[];
  unsupportedKeywords: string[];
}

export type SchemaDraft =
  | 'Draft-04'
  | 'Draft-06'
  | 'Draft-07'
  | 'Draft 2019-09'
  | 'Draft 2020-12'
  | 'Unknown';

/**
 * Complete structural classification of a single format occurrence
 * within a JSON Schema's StructuralModel.
 */
export interface FormatStructuralContext {
  /** JSON Pointer to the node containing `format` */
  pointer: string;
  /** The format value (e.g. "email", "uri", "date-time") */
  format: string;

  /** Whether this node is reachable via at least one $ref */
  underRef: boolean;
  /** Number of $ref hops to reach this node from root */
  refChainDepth: number;
  /** Whether a $dynamicRef or $recursiveRef is in scope */
  underDynamicRef: boolean;
  /** Whether this node participates in a ref cycle */
  insideRecursiveCycle: boolean;

  /** Whether any ancestor is a combinator (allOf/anyOf/oneOf/not) */
  underCombinator: boolean;
  /** List of combinator types in ancestor chain */
  combinatorTypes: string[];
  /** Max nesting depth of combinators above this node */
  combinatorDepth: number;

  /** Whether under any if/then/else context */
  underConditional: boolean;
  /** Whether specifically under an `if` branch */
  underIf: boolean;
  /** Whether specifically under a `then` branch */
  underThen: boolean;
  /** Whether specifically under an `else` branch */
  underElse: boolean;

  /** Whether the node has a union type (type is array) */
  underUnionType: boolean;
  /** The union types if type is an array */
  unionTypes?: string[];

  /** Whether under patternProperties */
  underPatternProperties: boolean;
  /** Whether under unevaluatedProperties */
  underUnevaluatedProperties: boolean;
  /** Whether this property appears in parent's required list */
  requiredProperty: boolean;

  /** Maximum ancestor depth from root */
  maxAncestorDepth: number;
}

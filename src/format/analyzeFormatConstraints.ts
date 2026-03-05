import type { StructuralModel, SchemaNode } from '../types';
import type { FormatConstraint, FormatContractSummary, FormatRisk } from './contractTypes';
import { extractFormatStructuralContexts } from './context/extractFormatStructuralContexts';
import { classifyAllFormatRisks } from './risk/classifyFormatRisk';

/**
 * Extract all format constraints from a model.
 * Each constraint describes WHERE a format keyword sits structurally,
 * what co-located constraints exist, and what testing obligations follow.
 */
export function analyzeFormatConstraints(
  model: StructuralModel,
): FormatConstraint[] {
  const rawContexts = extractFormatStructuralContexts(model);
  const { nodes } = model;

  const constraints: FormatConstraint[] = [];
  for (let i = 0; i < rawContexts.length; i++) {
    const ctx = rawContexts[i];
    const strictness = detectStrictness(ctx.pointer, nodes);
    constraints.push({
      pointer: ctx.pointer,
      format: ctx.format,
      depth: ctx.maxAncestorDepth,
      underRef: ctx.underRef,
      refChainDepth: ctx.refChainDepth,
      underDynamicRef: ctx.underDynamicRef,
      insideRecursiveCycle: ctx.insideRecursiveCycle,
      underCombinator: ctx.underCombinator,
      combinatorTypes: ctx.combinatorTypes,
      combinatorDepth: ctx.combinatorDepth,
      underConditional: ctx.underConditional,
      underIf: ctx.underIf,
      underThen: ctx.underThen,
      underElse: ctx.underElse,
      underUnionType: ctx.underUnionType,
      unionTypes: ctx.unionTypes,
      underPatternProperties: ctx.underPatternProperties,
      underUnevaluatedProperties: ctx.underUnevaluatedProperties,
      requiredProperty: ctx.requiredProperty,
      hasMinLength: strictness.hasMinLength,
      hasMaxLength: strictness.hasMaxLength,
      hasPattern: strictness.hasPattern,
      maxAncestorDepth: ctx.maxAncestorDepth,
    });
  }

  return constraints;
}

/**
 * Compute format risk for each constraint.
 * Returns sorted by pointer.
 */
export function computeFormatRisks(
  model: StructuralModel,
): FormatRisk[] {
  const rawContexts = extractFormatStructuralContexts(model);
  const rawRisks = classifyAllFormatRisks(rawContexts);
  const { nodes } = model;

  const risks: FormatRisk[] = [];
  for (let i = 0; i < rawRisks.length; i++) {
    const r = rawRisks[i];
    const riskLevel: 'low' | 'medium' | 'high' =
      r.riskScore >= 50 ? 'high' :
      r.riskScore >= 25 ? 'medium' : 'low';
    const testObligation = estimateTestObligation(r.pointer, r.riskScore, nodes);
    risks.push({
      pointer: r.pointer,
      format: r.format,
      riskLevel,
      riskScore: r.riskScore,
      riskFactors: r.riskFactors,
      testObligationEstimate: testObligation,
    });
  }

  return risks;
}

/**
 * Produce per-format-value summaries for maintainer output.
 * Groups by format name, reports highest risk and total obligations.
 */
export function buildFormatContractSummaries(
  constraints: FormatConstraint[],
  risks: FormatRisk[],
): FormatContractSummary[] {
  // Map risks by pointer for fast lookup
  const riskByPointer = new Map<string, FormatRisk>();
  for (let i = 0; i < risks.length; i++) {
    riskByPointer.set(risks[i].pointer, risks[i]);
  }

  // Group by format name
  const byFormat = new Map<string, {
    count: number;
    maxRisk: 'low' | 'medium' | 'high';
    maxRiskScore: number;
    totalObligation: number;
    hasMinLength: boolean;
    hasMaxLength: boolean;
    hasPattern: boolean;
  }>();

  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i];
    const r = riskByPointer.get(c.pointer);
    const riskLevel = r?.riskLevel ?? 'low';
    const riskScore = r?.riskScore ?? 0;
    const obligation = r?.testObligationEstimate ?? 5;

    const existing = byFormat.get(c.format);
    if (existing) {
      existing.count++;
      existing.totalObligation += obligation;
      if (riskScore > existing.maxRiskScore) {
        existing.maxRiskScore = riskScore;
        existing.maxRisk = riskLevel;
      }
      if (c.hasMinLength) existing.hasMinLength = true;
      if (c.hasMaxLength) existing.hasMaxLength = true;
      if (c.hasPattern) existing.hasPattern = true;
    } else {
      byFormat.set(c.format, {
        count: 1,
        maxRisk: riskLevel,
        maxRiskScore: riskScore,
        totalObligation: obligation,
        hasMinLength: c.hasMinLength,
        hasMaxLength: c.hasMaxLength,
        hasPattern: c.hasPattern,
      });
    }
  }

  // Convert to sorted array
  const summaries: FormatContractSummary[] = [];
  const formatNames = Array.from(byFormat.keys()).sort();
  for (let i = 0; i < formatNames.length; i++) {
    const name = formatNames[i];
    const data = byFormat.get(name)!;
    summaries.push({
      formatName: name,
      occurrenceCount: data.count,
      riskLevel: data.maxRisk,
      strictnessProfile: {
        hasMinLength: data.hasMinLength || undefined,
        hasMaxLength: data.hasMaxLength || undefined,
        hasPattern: data.hasPattern || undefined,
      },
      testObligationEstimate: data.totalObligation,
    });
  }

  return summaries;
}

interface StrictnessInfo {
  hasMinLength: boolean;
  hasMaxLength: boolean;
  hasPattern: boolean;
}

/**
 * Detect co-located string constraints on the same node.
 * Uses resolvePointer to check the raw schema, or walks the node structure.
 */
function detectStrictness(
  pointer: string,
  nodes: Record<string, SchemaNode>,
): StrictnessInfo {
  // We check siblings in the node tree - parent node's children may carry
  // minLength/maxLength/pattern. Since SchemaNode doesn't store these directly,
  // we check if sibling pointers like pointer+"/minLength" exist in nodes
  // or if the pointer path segments hint at constraint co-location.
  //
  // For now, we use a heuristic: check if the format-bearing node or its
  // parent has children with these keywords in their pointer segments.
  const node = nodes[pointer];
  if (!node) return { hasMinLength: false, hasMaxLength: false, hasPattern: false };

  // Check siblings - if parent has properties, look for minLength/maxLength/pattern
  // as sibling keywords. Since SchemaNode is the unit, we look at the parent node
  // for structural hints.
  let hasMinLength = false;
  let hasMaxLength = false;
  let hasPattern = false;

  // Check child pointers for constraint keywords
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const lastSegment = child.split('/').pop() ?? '';
      if (lastSegment === 'minLength') hasMinLength = true;
      if (lastSegment === 'maxLength') hasMaxLength = true;
      if (lastSegment === 'pattern') hasPattern = true;
    }
  }

  return { hasMinLength, hasMaxLength, hasPattern };
}

/**
 * Estimate test obligation based on risk score and structural position.
 * Base: 5 tests per format occurrence.
 * Multiplied by structural complexity factors.
 */
function estimateTestObligation(
  pointer: string,
  riskScore: number,
  nodes: Record<string, SchemaNode>,
): number {
  const base = 5;
  const node = nodes[pointer];
  if (!node) return base;

  let multiplier = 1;

  // Combinator branches add multiplicative test obligations
  if (node.combinators) {
    const c = node.combinators;
    if (c.oneOf && c.oneOf.length > 1) multiplier *= c.oneOf.length;
    if (c.anyOf && c.anyOf.length > 1) multiplier *= c.anyOf.length;
    if (c.if) multiplier *= 2; // if/then/else paths
  }

  // Union types multiply
  if (Array.isArray(node.type) && node.type.length > 1) {
    multiplier *= node.type.length;
  }

  // Risk score adds linear test cases above threshold
  const riskExtra = riskScore > 25 ? Math.ceil(riskScore / 10) : 0;

  return Math.min(100000, base * multiplier + riskExtra);
}

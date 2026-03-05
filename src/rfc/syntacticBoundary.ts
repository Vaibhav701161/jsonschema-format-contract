/**
 * Syntactic/semantic boundary detector.
 *
 * Core principle: a rule is SYNTACTIC if its validity can be
 * determined by parsing the string alone, without external
 * knowledge (DNS lookups, calendar math, runtime state).
 *
 * Rules classified as semantic produce documentation notes
 * rather than validation test cases.
 */

import type { ProductionRule } from './productionModel';
import { buildFormatProductionGraph } from './productionModel';
import { classifyRule, type RequirementLevel } from './requirementClassifier';

export interface BoundaryDecision {
  ruleName: string;
  isSyntactic: boolean;
  reason: string;
  level: RequirementLevel;
  /** If semantic, what external knowledge is needed */
  externalDependency?: string;
}

export interface BoundaryReport {
  format: string;
  rfc: string;
  decisions: BoundaryDecision[];
  syntacticCount: number;
  semanticCount: number;
  syntacticPercent: number;
}

/**
 * Rules that require external/runtime knowledge to fully validate.
 * Maps rule name → description of external dependency.
 */
const EXTERNAL_DEPENDENCIES: Record<string, string> = {
  'date-mday': 'Calendar: requires month+year to validate day range',
  'time-second': 'UTC context: leap second (60) valid only at specific UTC times',
  'toplabel': 'DNS/IANA: valid TLDs change over time',
  'domainlabel': 'IDN tables: internationalized label validity requires Unicode tables',
  'dec-octet': 'Network policy: reserved/private ranges are context-dependent',
  'reg-name': 'DNS resolution: whether a name resolves is runtime-dependent',
};

/**
 * Determine if a single production rule is syntactic.
 *
 * A rule is syntactic if its validity can be determined by
 * parsing the string alone. This means:
 * - It has a clear ABNF definition
 * - It doesn't require external lookups
 * - Its classification is MUST_SYNTAX or SHOULD_SYNTAX
 */
export function isSyntactic(rule: ProductionRule): boolean {
  // Check if it requires external knowledge
  if (EXTERNAL_DEPENDENCIES[rule.name]) return false;

  // Use the classification system
  const classified = classifyRule(rule);
  return classified.level === 'MUST_SYNTAX' || classified.level === 'SHOULD_SYNTAX';
}

/**
 * Get a detailed boundary decision for a production rule.
 */
export function decideBoundary(rule: ProductionRule): BoundaryDecision {
  const classified = classifyRule(rule);
  const syntactic = isSyntactic(rule);
  const externalDep = EXTERNAL_DEPENDENCIES[rule.name];

  let reason: string;
  if (syntactic) {
    reason = `Parseable from string alone: ${rule.definition}`;
  } else if (externalDep) {
    reason = `Requires external knowledge: ${externalDep}`;
  } else if (classified.level === 'AMBIGUOUS') {
    reason = `Ambiguous: ${classified.reason}`;
  } else {
    reason = classified.reason;
  }

  return {
    ruleName: rule.name,
    isSyntactic: syntactic,
    reason,
    level: classified.level,
    externalDependency: externalDep,
  };
}

/**
 * Analyze syntactic/semantic boundaries for all rules in a format.
 */
export function analyzeBoundaries(format: string): BoundaryReport | undefined {
  const graph = buildFormatProductionGraph(format);
  if (!graph) return undefined;

  const decisions: BoundaryDecision[] = [];

  for (const name of graph.sortedNames) {
    const rule = graph.rules.get(name);
    if (rule) {
      decisions.push(decideBoundary(rule));
    }
  }

  const syntacticCount = decisions.filter((d) => d.isSyntactic).length;
  const semanticCount = decisions.filter((d) => !d.isSyntactic).length;
  const total = decisions.length;
  const syntacticPercent = total === 0 ? 100 : Math.round((syntacticCount / total) * 100);

  return {
    format,
    rfc: graph.rfc,
    decisions,
    syntacticCount,
    semanticCount,
    syntacticPercent,
  };
}

/**
 * Get only the syntactic rules for a format (suitable for test generation).
 */
export function getSyntacticRules(format: string): BoundaryDecision[] {
  const report = analyzeBoundaries(format);
  if (!report) return [];
  return report.decisions.filter((d) => d.isSyntactic);
}

/**
 * Get only the semantic rules for a format (produce documentation only).
 */
export function getSemanticRules(format: string): BoundaryDecision[] {
  const report = analyzeBoundaries(format);
  if (!report) return [];
  return report.decisions.filter((d) => !d.isSyntactic);
}

/**
 * Requirement classifier: assigns a 5-tier classification
 * to every production rule based on its testability.
 *
 * The hierarchy determines which rules generate validation tests
 * vs documentation vs nothing at all:
 *
 * 1. MUST_SYNTAX   — Explicit ABNF grammar rules. Testable via string parsing.
 * 2. SHOULD_SYNTAX  — RFC prose that affects syntax (e.g. "SHOULD normalize").
 * 3. AMBIGUOUS      — Multiple valid interpretations exist across implementations.
 * 4. SEMANTIC       — Requires runtime/external knowledge (DNS lookup, calendar math).
 * 5. OUT_OF_SCOPE   — Transport, delivery, or application-layer concerns.
 */

import type { ProductionRule } from './productionModel';
import { buildFormatProductionGraph } from './productionModel';

export type RequirementLevel =
  | 'MUST_SYNTAX'
  | 'SHOULD_SYNTAX'
  | 'AMBIGUOUS'
  | 'SEMANTIC'
  | 'OUT_OF_SCOPE';

export interface ClassifiedRule {
  /** Production rule name */
  ruleName: string;
  /** Classification level */
  level: RequirementLevel;
  /** Human-readable reason for the classification */
  reason: string;
  /** Whether this rule should generate a test case */
  testable: boolean;
  /** RFC section reference */
  rfcSection: string;
}

export interface ClassificationReport {
  format: string;
  rfc: string;
  rules: ClassifiedRule[];
  summary: ClassificationSummary;
}

export interface ClassificationSummary {
  total: number;
  mustSyntax: number;
  shouldSyntax: number;
  ambiguous: number;
  semantic: number;
  outOfScope: number;
  testableCount: number;
  testablePercent: number;
}

/**
 * Known semantic rules that require runtime knowledge.
 * Key: rule name pattern, Value: reason.
 */
const SEMANTIC_RULES: Record<string, string> = {
  'date-mday': 'Day validity depends on month and leap year (calendar math)',
  'date-month': 'Month range is syntactic (01-12) but leap year interaction is semantic',
  'time-second': 'Leap second (60) validity depends on UTC midnight context',
  'dec-octet': 'Syntactic range is 0-255, but reserved addresses are semantic',
  'toplabel': 'Label validity may require DNS or IANA TLD lookup',
  'domainlabel': 'Label length limits (63 chars) are syntactic, but IDN rules are semantic',
};

/**
 * Known ambiguous rules where implementations disagree.
 */
const AMBIGUOUS_RULES: Record<string, string> = {
  'time-secfrac': 'Precision limits vary: some accept arbitrary digits, others limit to 3-9',
  'IPvFuture': 'Rarely implemented; validators disagree on acceptance',
  'domain-literal': 'Email domain literals: some validators reject, others accept',
  'quoted-string': 'Quoted local-part in email: inconsistent support across validators',
  'IP-literal': 'Zone ID handling varies across implementations',
};

/**
 * Rules considered out of scope for format validation.
 */
const OUT_OF_SCOPE_RULES = new Set([
  'userinfo', // Contains credentials — application-layer concern
]);

/**
 * Classify a single production rule into the 5-tier hierarchy.
 */
export function classifyRule(rule: ProductionRule): ClassifiedRule {
  const name = rule.name;

  // Check OUT_OF_SCOPE first
  if (OUT_OF_SCOPE_RULES.has(name)) {
    return {
      ruleName: name,
      level: 'OUT_OF_SCOPE',
      reason: 'Transport/delivery/application-layer concern',
      testable: false,
      rfcSection: rule.rfcSection,
    };
  }

  // Check known AMBIGUOUS rules
  if (AMBIGUOUS_RULES[name]) {
    return {
      ruleName: name,
      level: 'AMBIGUOUS',
      reason: AMBIGUOUS_RULES[name],
      testable: true,
      rfcSection: rule.rfcSection,
    };
  }

  // Check known SEMANTIC rules
  if (SEMANTIC_RULES[name]) {
    return {
      ruleName: name,
      level: 'SEMANTIC',
      reason: SEMANTIC_RULES[name],
      testable: false,
      rfcSection: rule.rfcSection,
    };
  }

  // MUST_SYNTAX: has explicit ABNF definition with parseable structure
  if (hasExplicitAbnf(rule)) {
    return {
      ruleName: name,
      level: 'MUST_SYNTAX',
      reason: `Explicit ABNF grammar: ${rule.definition}`,
      testable: true,
      rfcSection: rule.rfcSection,
    };
  }

  // SHOULD_SYNTAX: has definition but it's prose-like or uses core rules only
  return {
    ruleName: name,
    level: 'SHOULD_SYNTAX',
    reason: 'RFC prose or convention affecting syntax',
    testable: true,
    rfcSection: rule.rfcSection,
  };
}

/**
 * Check if a rule has explicit ABNF structure (not just prose).
 */
function hasExplicitAbnf(rule: ProductionRule): boolean {
  const def = rule.definition.trim();
  if (def.length === 0) return false;

  // Has quoted literals, numeric values, or child rule references
  if (/"[^"]*"/.test(def)) return true;
  if (/%[xdbo]/.test(def)) return true;
  if (/[A-Za-z][A-Za-z0-9-]*/.test(def)) return true;

  return false;
}

/**
 * Classify all production rules for a format.
 */
export function classifyFormat(format: string): ClassificationReport | undefined {
  const graph = buildFormatProductionGraph(format);
  if (!graph) return undefined;

  const rules: ClassifiedRule[] = [];

  for (const name of graph.sortedNames) {
    const rule = graph.rules.get(name);
    if (rule) {
      rules.push(classifyRule(rule));
    }
  }

  const summary = computeSummary(rules);

  return {
    format,
    rfc: graph.rfc,
    rules,
    summary,
  };
}

/**
 * Compute classification summary statistics.
 */
function computeSummary(rules: ClassifiedRule[]): ClassificationSummary {
  const total = rules.length;
  const mustSyntax = rules.filter((r) => r.level === 'MUST_SYNTAX').length;
  const shouldSyntax = rules.filter((r) => r.level === 'SHOULD_SYNTAX').length;
  const ambiguous = rules.filter((r) => r.level === 'AMBIGUOUS').length;
  const semantic = rules.filter((r) => r.level === 'SEMANTIC').length;
  const outOfScope = rules.filter((r) => r.level === 'OUT_OF_SCOPE').length;
  const testableCount = rules.filter((r) => r.testable).length;
  const testablePercent = total === 0 ? 100 : Math.round((testableCount / total) * 100);

  return {
    total,
    mustSyntax,
    shouldSyntax,
    ambiguous,
    semantic,
    outOfScope,
    testableCount,
    testablePercent,
  };
}

/**
 * Get only the testable (MUST_SYNTAX + SHOULD_SYNTAX + AMBIGUOUS) rules for a format.
 */
export function getTestableRules(format: string): ClassifiedRule[] {
  const report = classifyFormat(format);
  if (!report) return [];
  return report.rules.filter((r) => r.testable);
}

/**
 * Get rules that should produce documentation notes instead of tests.
 */
export function getDocumentationRules(format: string): ClassifiedRule[] {
  const report = classifyFormat(format);
  if (!report) return [];
  return report.rules.filter((r) => r.level === 'SEMANTIC' || r.level === 'OUT_OF_SCOPE');
}

/**
 * Get ambiguous rules that need explicit decision documentation.
 */
export function getAmbiguousRules(format: string): ClassifiedRule[] {
  const report = classifyFormat(format);
  if (!report) return [];
  return report.rules.filter((r) => r.level === 'AMBIGUOUS');
}

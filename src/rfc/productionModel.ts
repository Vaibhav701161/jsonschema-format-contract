/**
 * Production rule model: builds a typed production rule graph from
 * ABNF grammars, annotated with RFC section references, allowed ranges,
 * and rule classification metadata.
 *
 * Every production rule traces back to a specific RFC section and ABNF
 * definition, enabling full traceability from test cases to specifications.
 */

import { parseAbnf } from './abnfParser';
import { getFormatSpec } from './formatRegistry';

export type RuleType = 'terminal' | 'sequence' | 'alternation' | 'optional' | 'repeat';

export interface AllowedRange {
  min: number;
  max: number;
  hex: boolean;
}

export interface ProductionRule {
  /** Rule name from the ABNF grammar (e.g. "time-second") */
  name: string;
  /** Raw ABNF definition (e.g. "2DIGIT") */
  definition: string;
  /** RFC section reference (e.g. "RFC3339 §5.6") */
  rfcSection: string;
  /** Classified rule type */
  ruleType: RuleType;
  /** Names of child rules referenced in this rule's definition */
  children: string[];
  /** Allowed numeric ranges extracted from the definition */
  allowedRanges: AllowedRange[];
  /** Whether this is a leaf/core rule or a composite rule */
  isTerminal: boolean;
}

export interface ProductionGraph {
  /** Format name */
  format: string;
  /** RFC identifier */
  rfc: string;
  /** All production rules indexed by name */
  rules: Map<string, ProductionRule>;
  /** Root rule names (entry points) */
  roots: string[];
  /** Topologically sorted rule names (leaves first) */
  sortedNames: string[];
}

/** Well-known ABNF core rules (RFC 5234) that are always terminal */
const CORE_RULES = new Set([
  'ALPHA', 'DIGIT', 'HEXDIG', 'DQUOTE', 'SP', 'HTAB', 'WSP',
  'LWSP', 'VCHAR', 'CHAR', 'OCTET', 'CTL', 'CR', 'LF', 'CRLF', 'BIT',
]);

/** Known RFC section mappings for common format productions */
const RFC_SECTION_MAP: Record<string, Record<string, string>> = {
  'RFC 3339': {
    'date-time': '§5.6',
    'full-date': '§5.6',
    'full-time': '§5.6',
    'partial-time': '§5.6',
    'date-fullyear': '§5.6',
    'date-month': '§5.6',
    'date-mday': '§5.6',
    'time-hour': '§5.6',
    'time-minute': '§5.6',
    'time-second': '§5.6',
    'time-secfrac': '§5.6',
    'time-offset': '§5.6',
    'time-numoffset': '§5.6',
    'duration': '§Appendix A',
    'dur-date': '§Appendix A',
    'dur-time': '§Appendix A',
    'dur-week': '§Appendix A',
    'dur-day': '§Appendix A',
    'dur-hour': '§Appendix A',
    'dur-minute': '§Appendix A',
    'dur-second': '§Appendix A',
  },
  'RFC 3986': {
    'URI': '§3',
    'hier-part': '§3',
    'scheme': '§3.1',
    'authority': '§3.2',
    'host': '§3.2.2',
    'port': '§3.2.3',
    'IP-literal': '§3.2.2',
    'IPv4address': '§3.2.2',
    'IPv6address': '§3.2.2',
    'IPvFuture': '§3.2.2',
    'path-abempty': '§3.3',
    'path-absolute': '§3.3',
    'path-rootless': '§3.3',
    'path-empty': '§3.3',
    'query': '§3.4',
    'fragment': '§3.5',
    'userinfo': '§3.2.1',
    'reg-name': '§3.2.2',
    'segment': '§3.3',
    'pchar': '§3.3',
  },
  'RFC 5321/5322': {
    'addr-spec': '§3.4.1',
    'local-part': '§3.4.1',
    'domain': '§3.4.1',
    'dot-atom': '§3.2.3',
    'quoted-string': '§3.2.4',
    'domain-literal': '§3.4.1',
    'atext': '§3.2.3',
  },
  'RFC 4122': {
    'UUID': '§3',
    'time-low': '§4.1.2',
    'time-mid': '§4.1.2',
    'time-high-and-version': '§4.1.2',
    'clock-seq-and-reserved': '§4.1.2',
    'clock-seq-low': '§4.1.2',
    'node': '§4.1.2',
    'hexOctet': '§3',
  },
  'RFC 6901': {
    'json-pointer': '§3',
    'reference-token': '§3',
    'escaped': '§3',
    'unescaped': '§3',
  },
  'RFC 1123': {
    'hostname': '§2.1',
    'domainlabel': '§2.1',
    'toplabel': '§2.1',
  },
  'RFC 2673': {
    'IPv4address': '§3.2',
    'dec-octet': '§3.2',
  },
  'RFC 4291': {
    'IPv6address': '§2.2',
    'h16': '§2.2',
    'ls32': '§2.2',
  },
  'RFC 3987': {
    'IRI': '§2.2',
    'ihier-part': '§2.2',
    'iauthority': '§2.2',
    'ipath-abempty': '§2.2',
    'ipath-absolute': '§2.2',
    'ipath-rootless': '§2.2',
    'ipath-empty': '§2.2',
    'iquery': '§2.2',
    'ifragment': '§2.2',
  },
  'RFC 6570': {
    'URI-Template': '§2',
    'expression': '§2.2',
    'operator': '§2.2',
    'variable-list': '§2.3',
  },
  'RFC 6531': {
    'addr-spec': '§3.3',
    'local-part': '§3.3',
    'domain': '§3.3',
  },
  'RFC 5890': {
    'hostname': '§2.3.2.3',
    'domainlabel': '§2.3.2.3',
    'toplabel': '§2.3.2.3',
  },
  'ECMA-262': {
    'regex': '§21.2',
    'metachar': '§21.2',
    'quantifier': '§21.2',
    'group': '§21.2',
    'charclass': '§21.2',
  },
};

/**
 * Classify the type of an ABNF rule definition.
 */
function classifyRuleType(definition: string): RuleType {
  const trimmed = definition.trim();

  // Alternation: contains "/" at the top level
  if (trimmed.includes('/')) {
    const outsideBrackets = trimmed.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
    if (outsideBrackets.includes('/')) return 'alternation';
  }

  // Optional: entire definition is wrapped in [...]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return 'optional';

  // Repetition: starts with *N, N*, or N*N pattern
  if (/^\d*\*/.test(trimmed) || /^\d+[A-Z]/.test(trimmed)) return 'repeat';

  // Terminal: is a quoted string, numeric value, or core rule reference
  if (/^"[^"]*"$/.test(trimmed)) return 'terminal';
  if (/^%[xdbo]/.test(trimmed)) return 'terminal';
  if (CORE_RULES.has(trimmed)) return 'terminal';

  // Default: sequence of elements
  return 'sequence';
}

/**
 * Extract child rule names referenced in a rule's definition.
 */
function extractChildren(definition: string, knownRules: Set<string>): string[] {
  const children: string[] = [];
  // Remove quoted strings and numeric values
  const cleaned = definition.replace(/"[^"]*"/g, '').replace(/%[xdbo][0-9A-Fa-f.-]+/g, '');
  // Extract identifiers
  const identifiers = cleaned.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  const seen = new Set<string>();
  for (const id of identifiers) {
    if (!seen.has(id) && (knownRules.has(id) || CORE_RULES.has(id))) {
      children.push(id);
      seen.add(id);
    }
  }
  return children;
}

/**
 * Extract numeric ranges from a rule definition.
 */
function extractRanges(definition: string): AllowedRange[] {
  const ranges: AllowedRange[] = [];
  const hexRe = /%x([0-9A-Fa-f]+)-([0-9A-Fa-f]+)/g;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(definition)) !== null) {
    ranges.push({
      min: parseInt(m[1], 16),
      max: parseInt(m[2], 16),
      hex: true,
    });
  }
  const decRe = /%d(\d+)-(\d+)/g;
  while ((m = decRe.exec(definition)) !== null) {
    ranges.push({
      min: parseInt(m[1], 10),
      max: parseInt(m[2], 10),
      hex: false,
    });
  }
  return ranges;
}

/**
 * Look up the RFC section for a given rule name and RFC identifier.
 */
function lookupRfcSection(ruleName: string, rfc: string): string {
  const sections = RFC_SECTION_MAP[rfc];
  if (sections?.[ruleName]) return `${rfc} ${sections[ruleName]}`;
  // Fallback: just reference the RFC
  return rfc;
}

/**
 * Topologically sort rule names (dependencies first).
 */
function topoSort(rules: Map<string, ProductionRule>): string[] {
  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const rule = rules.get(name);
    if (!rule) return;
    for (const child of rule.children) {
      visit(child);
    }
    sorted.push(name);
  }

  for (const name of rules.keys()) {
    visit(name);
  }

  return sorted;
}

/**
 * Build a production rule graph from an ABNF grammar string.
 */
export function buildProductionGraph(
  grammar: string,
  rfc: string,
): ProductionGraph {
  const parsed = parseAbnf(grammar);
  const knownRuleNames = new Set(parsed.rules.map((r) => r.name));

  const rules = new Map<string, ProductionRule>();
  let firstRuleName: string | undefined;

  for (const abnfRule of parsed.rules) {
    if (!firstRuleName) firstRuleName = abnfRule.name;

    const ruleType = classifyRuleType(abnfRule.definition);
    const children = extractChildren(abnfRule.definition, knownRuleNames);
    const allowedRanges = extractRanges(abnfRule.definition);
    const isTerminal = ruleType === 'terminal' || children.length === 0;

    rules.set(abnfRule.name, {
      name: abnfRule.name,
      definition: abnfRule.definition,
      rfcSection: lookupRfcSection(abnfRule.name, rfc),
      ruleType,
      children,
      allowedRanges,
      isTerminal,
    });
  }

  const roots = firstRuleName ? [firstRuleName] : [];
  const sortedNames = topoSort(rules);

  return {
    format: '',
    rfc,
    rules,
    roots,
    sortedNames,
  };
}

/**
 * Build a production graph for a registered format.
 */
export function buildFormatProductionGraph(format: string): ProductionGraph | undefined {
  const spec = getFormatSpec(format);
  if (!spec) return undefined;

  const graph = buildProductionGraph(spec.grammar, spec.rfc);
  graph.format = format;
  return graph;
}

/**
 * Get a flat list of all production rules for a format.
 */
export function getProductionRules(format: string): ProductionRule[] {
  const graph = buildFormatProductionGraph(format);
  if (!graph) return [];
  return graph.sortedNames
    .map((name) => graph.rules.get(name))
    .filter((r): r is ProductionRule => r !== undefined);
}

/**
 * Get production rule metadata suitable for test citation.
 */
export function getProductionMetadata(
  format: string,
  ruleName: string,
): { production: string; rule: string; rfcSection: string; allowedRange?: string } | undefined {
  const graph = buildFormatProductionGraph(format);
  if (!graph) return undefined;

  const rule = graph.rules.get(ruleName);
  if (!rule) return undefined;

  const rangeStr = rule.allowedRanges.length > 0
    ? rule.allowedRanges.map((r) => `${r.min}-${r.max}`).join(', ')
    : undefined;

  return {
    production: rule.name,
    rule: rule.definition,
    rfcSection: rule.rfcSection,
    allowedRange: rangeStr,
  };
}

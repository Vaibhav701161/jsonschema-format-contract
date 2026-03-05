/**
 * Lightweight ABNF grammar parser.
 *
 * Extracts structural features from ABNF grammar strings
 * (repetition, alternation, optional elements, numeric ranges)
 * to identify edge cases that need testing.
 *
 * This is NOT a full ABNF interpreter — it extracts enough
 * structural info to drive test-case generation.
 */

export interface AbnfRule {
  name: string;
  definition: string;
}

export interface AbnfFeatures {
  rules: AbnfRule[];
  alternations: string[];
  optionalElements: string[];
  repetitions: string[];
  numericRanges: string[];
  totalBranches: number;
}

const RULE_RE = /^([A-Za-z][A-Za-z0-9-]*)\s*=\/?(.*)$/;

const OPTIONAL_RE = /\[([^\]]+)\]/g;
const REPETITION_RE = /(\d*\*\d*|\d+)/;
const NUMERIC_RE = /%x([0-9A-Fa-f]+)-([0-9A-Fa-f]+)/g;

export function parseAbnf(grammar: string): AbnfFeatures {
  const lines = grammar.split('\n');
  const rules: AbnfRule[] = [];
  const alternations: string[] = [];
  const optionalElements: string[] = [];
  const repetitions: string[] = [];
  const numericRanges: string[] = [];

  let currentRule: AbnfRule | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith(';')) continue;

    const match = RULE_RE.exec(line);
    if (match) {
      currentRule = { name: match[1], definition: match[2].trim() };
      rules.push(currentRule);
    } else if (currentRule && (line.startsWith('/') || line.startsWith(' '))) {
      currentRule.definition += ' ' + line.trim();
    }
  }

  for (const rule of rules) {
    const def = rule.definition;

    // Detect alternations
    const altParts = def.split('/').map((s) => s.trim()).filter(Boolean);
    if (altParts.length > 1) {
      for (const part of altParts) {
        alternations.push(`${rule.name}: ${part}`);
      }
    }

    // Detect optional elements
    let optMatch: RegExpExecArray | null;
    const optRe = new RegExp(OPTIONAL_RE.source, 'g');
    while ((optMatch = optRe.exec(def)) !== null) {
      optionalElements.push(`${rule.name}: [${optMatch[1]}]`);
    }

    // Detect repetitions
    const tokens = def.split(/\s+/);
    for (const token of tokens) {
      if (REPETITION_RE.test(token) && token.includes('*')) {
        repetitions.push(`${rule.name}: ${token}`);
      }
    }

    // Detect numeric ranges
    let numMatch: RegExpExecArray | null;
    const numRe = new RegExp(NUMERIC_RE.source, 'g');
    while ((numMatch = numRe.exec(def)) !== null) {
      const lo = parseInt(numMatch[1], 16);
      const hi = parseInt(numMatch[2], 16);
      numericRanges.push(`${rule.name}: ${lo}-${hi}`);
    }
  }

  const totalBranches = alternations.length +
    optionalElements.length * 2 +
    repetitions.length * 3;

  return {
    rules,
    alternations,
    optionalElements,
    repetitions,
    numericRanges,
    totalBranches,
  };
}

export function countGrammarBranches(features: AbnfFeatures): number {
  return features.totalBranches;
}

export function extractEdgeCaseHints(features: AbnfFeatures): string[] {
  const hints: string[] = [];

  for (const opt of features.optionalElements) {
    hints.push(`optional-present: ${opt}`);
    hints.push(`optional-absent: ${opt}`);
  }

  for (const rep of features.repetitions) {
    hints.push(`repetition-zero: ${rep}`);
    hints.push(`repetition-one: ${rep}`);
    hints.push(`repetition-many: ${rep}`);
  }

  for (const range of features.numericRanges) {
    hints.push(`range-min: ${range}`);
    hints.push(`range-max: ${range}`);
    hints.push(`range-below-min: ${range}`);
    hints.push(`range-above-max: ${range}`);
  }

  for (const alt of features.alternations) {
    hints.push(`alternation-branch: ${alt}`);
  }

  return hints.sort();
}

/**
 * Grammar analyzer: uses the ABNF parser + format registry
 * to produce structured analysis of which grammar branches
 * need testing for a given format.
 */

import { parseAbnf, extractEdgeCaseHints, type AbnfFeatures } from './abnfParser';
import { getFormatSpec, type FormatSpec } from './formatRegistry';

export interface GrammarBranch {
  label: string;
  category: 'alternation' | 'optional' | 'repetition' | 'range';
}

export interface GrammarAnalysis {
  format: string;
  rfc: string;
  totalBranches: number;
  branches: GrammarBranch[];
  edgeCaseHints: string[];
  abnfFeatures: AbnfFeatures;
}

export function analyzeFormatGrammar(format: string): GrammarAnalysis | undefined {
  const spec = getFormatSpec(format);
  if (!spec) return undefined;
  return analyzeGrammarFromSpec(spec);
}

export function analyzeGrammarFromSpec(spec: FormatSpec): GrammarAnalysis {
  const features = parseAbnf(spec.grammar);
  const hints = extractEdgeCaseHints(features);

  const branches: GrammarBranch[] = [];

  for (const alt of features.alternations) {
    branches.push({ label: alt, category: 'alternation' });
  }
  for (const opt of features.optionalElements) {
    branches.push({ label: `${opt} present`, category: 'optional' });
    branches.push({ label: `${opt} absent`, category: 'optional' });
  }
  for (const rep of features.repetitions) {
    branches.push({ label: `${rep} zero`, category: 'repetition' });
    branches.push({ label: `${rep} one`, category: 'repetition' });
    branches.push({ label: `${rep} many`, category: 'repetition' });
  }
  for (const range of features.numericRanges) {
    branches.push({ label: `${range} min`, category: 'range' });
    branches.push({ label: `${range} max`, category: 'range' });
  }

  return {
    format: spec.name,
    rfc: spec.rfc,
    totalBranches: branches.length,
    branches,
    edgeCaseHints: hints,
    abnfFeatures: features,
  };
}

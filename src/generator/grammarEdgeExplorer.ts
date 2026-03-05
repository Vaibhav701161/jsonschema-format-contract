/**
 * Grammar edge explorer: walks ABNF grammar structure to find
 * untested branches and suggest concrete test values.
 *
 * Builds on the grammar analysis to produce a prioritized list
 * of grammar areas that lack test coverage.
 */

import { analyzeFormatGrammar, type GrammarBranch } from '../rfc';
import { getFormatSpec, type FormatEdgeCase } from '../rfc';

export interface UncoveredArea {
  branch: GrammarBranch;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface GrammarExplorationResult {
  format: string;
  totalBranches: number;
  coveredCount: number;
  uncoveredCount: number;
  coveragePercent: number;
  uncoveredAreas: UncoveredArea[];
}

/**
 * Explore grammar branches for a format and compute which
 * branches are covered by existing edge cases.
 */
export function exploreGrammarEdges(format: string): GrammarExplorationResult | undefined {
  const spec = getFormatSpec(format);
  const analysis = analyzeFormatGrammar(format);

  if (!spec || !analysis) return undefined;

  const coveredLabels = new Set<string>();
  const uncoveredAreas: UncoveredArea[] = [];

  for (const branch of analysis.branches) {
    if (isBranchCovered(branch, spec.edgeCases)) {
      coveredLabels.add(branch.label);
    } else {
      uncoveredAreas.push({
        branch,
        priority: prioritizeBranch(branch),
        suggestion: suggestTest(branch, format),
      });
    }
  }

  const totalBranches = analysis.branches.length;
  const coveredCount = coveredLabels.size;
  const uncoveredCount = uncoveredAreas.length;
  const coveragePercent = totalBranches === 0 ? 100 : Math.round((coveredCount / totalBranches) * 100);

  return {
    format,
    totalBranches,
    coveredCount,
    uncoveredCount,
    coveragePercent,
    uncoveredAreas: uncoveredAreas.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    }),
  };
}

function isBranchCovered(branch: GrammarBranch, edgeCases: FormatEdgeCase[]): boolean {
  const label = branch.label.toLowerCase();

  // Check if any edge case description references this branch concept
  return edgeCases.some((ec) => {
    const desc = ec.description.toLowerCase();
    // Check for direct keyword matches based on branch category
    switch (branch.category) {
      case 'alternation':
        return desc.includes(extractKeyword(label));
      case 'optional':
        return desc.includes(extractKeyword(label));
      case 'repetition':
        return desc.includes('empty') || desc.includes('long') || desc.includes('many');
      case 'range':
        return (
          desc.includes('min') ||
          desc.includes('max') ||
          desc.includes('boundary') ||
          desc.includes('zero') ||
          desc.includes('255')
        );
      default:
        return false;
    }
  });
}

function extractKeyword(label: string): string {
  // Extract the meaningful part after the colon
  const parts = label.split(':');
  const keyword = (parts[1] ?? parts[0]).trim().toLowerCase();
  // Take first word
  return keyword.split(/\s+/)[0] ?? keyword;
}

function prioritizeBranch(branch: GrammarBranch): 'high' | 'medium' | 'low' {
  switch (branch.category) {
    case 'range':
      return 'high'; // Boundary values are critical
    case 'alternation':
      return 'high'; // Each alternation must be tested
    case 'optional':
      return 'medium'; // Optional presence/absence matters
    case 'repetition':
      return 'low'; // Repetition count is lower priority
    default:
      return 'low';
  }
}

function suggestTest(branch: GrammarBranch, _format: string): string {
  switch (branch.category) {
    case 'alternation':
      return `Add test case targeting alternation: ${branch.label}`;
    case 'optional':
      return branch.label.includes('absent')
        ? `Add test case with the optional element omitted: ${branch.label}`
        : `Add test case with the optional element included: ${branch.label}`;
    case 'repetition':
      if (branch.label.includes('zero')) return `Add test with zero repetitions: ${branch.label}`;
      if (branch.label.includes('many')) return `Add test with multiple repetitions: ${branch.label}`;
      return `Add test with single repetition: ${branch.label}`;
    case 'range':
      if (branch.label.includes('min')) return `Add test at minimum range value: ${branch.label}`;
      if (branch.label.includes('max')) return `Add test at maximum range value: ${branch.label}`;
      return `Add boundary test for range: ${branch.label}`;
    default:
      return `Add test for: ${branch.label}`;
  }
}

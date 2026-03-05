import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  detectFormatCoverageGapsUnified,
  analyzeFormatConstraints,
  computeFormatRisks,
} from '../../src/format';
import type { ExistingTestCoverage } from '../../src/format/contractTypes';
import { exploreGrammarEdges, type GrammarExplorationResult } from '../../src/generator';
import { classifyFormat } from '../../src/rfc';
import { loadSchema, buildModel } from '../utils/buildModel';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED, EXIT_CI_VIOLATION } from '../utils/exitCodes';

interface CoverageOptions {
  json?: boolean;
  ci?: boolean;
  tests?: string;
}

function loadTestMetadata(filePath: string): ExistingTestCoverage {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Test metadata file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  const data = JSON.parse(raw) as {
    coveredCategories?: string[];
    coveredFormats?: string[];
  };

  return {
    coveredCategories: new Set(data.coveredCategories ?? []),
    coveredFormats: new Set(data.coveredFormats ?? []),
  };
}

export function runCoverage(schemaPath: string, options: CoverageOptions): void {
  try {
    const schema = loadSchema(schemaPath);
    const model = buildModel(schema);

    const constraints = analyzeFormatConstraints(model);
    const risks = computeFormatRisks(model);

    if (constraints.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ totalFormats: 0, gaps: [] }, null, 2));
      } else {
        console.log(chalk.yellow('No format keywords found in this schema.'));
      }
      process.exit(EXIT_SUCCESS);
    }

    const existingTests: ExistingTestCoverage = options.tests
      ? loadTestMetadata(options.tests)
      : { coveredCategories: new Set(), coveredFormats: new Set() };

    const report = detectFormatCoverageGapsUnified(model, existingTests);

    // Grammar branch analysis for each unique format in the schema
    const uniqueFormats = [...new Set(constraints.map((c) => c.format))].sort();
    const grammarExplorations: GrammarExplorationResult[] = [];
    for (const fmt of uniqueFormats) {
      const exploration = exploreGrammarEdges(fmt);
      if (exploration) grammarExplorations.push(exploration);
    }

    const totalGrammarBranches = grammarExplorations.reduce((s, e) => s + e.totalBranches, 0);
    const coveredGrammarBranches = grammarExplorations.reduce((s, e) => s + e.coveredCount, 0);
    const uncoveredGrammarBranches = grammarExplorations.reduce((s, e) => s + e.uncoveredCount, 0);

    const hasGaps =
      report.missingRecursionCoverage ||
      report.missingDynamicCoverage ||
      report.missingConditionalCoverage ||
      report.missingCombinatorCoverage ||
      report.missingAnnotationCoverage ||
      report.suggestedStressCases.length > 0 ||
      uncoveredGrammarBranches > 0;

    // Classification-level coverage per format
    const classificationCoverage = uniqueFormats.map((fmt) => {
      const classification = classifyFormat(fmt);
      if (!classification) return { format: fmt, summary: null };
      return {
        format: fmt,
        summary: classification.summary,
      };
    }).filter((c) => c.summary !== null);

    const result = {
      totalFormats: report.totalFormats,
      interactionTypes: report.interactionTypesDetected.sort(),
      highRiskPointers: report.highRiskPointers.sort(),
      gaps: {
        recursion: report.missingRecursionCoverage,
        dynamic: report.missingDynamicCoverage,
        conditional: report.missingConditionalCoverage,
        combinator: report.missingCombinatorCoverage,
        annotation: report.missingAnnotationCoverage,
      },
      grammarBranches: {
        total: totalGrammarBranches,
        covered: coveredGrammarBranches,
        uncovered: uncoveredGrammarBranches,
        byFormat: grammarExplorations.map((e) => ({
          format: e.format,
          total: e.totalBranches,
          covered: e.coveredCount,
          uncovered: e.uncoveredCount,
          coveragePercent: e.coveragePercent,
          missingScenarios: e.uncoveredAreas.map((a) => ({
            branch: a.branch.label,
            category: a.branch.category,
            priority: a.priority,
            suggestion: a.suggestion,
          })),
        })),
      },
      classificationCoverage,
      suggestedStressCases: report.suggestedStressCases.sort(),
      risks: risks.map((r) => ({
        pointer: r.pointer,
        format: r.format,
        level: r.riskLevel,
        score: Number(r.riskScore.toFixed(2)),
        factors: r.riskFactors,
        obligations: r.testObligationEstimate,
      })),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      if (options.ci && hasGaps) {
        process.exit(EXIT_CI_VIOLATION);
      }
      process.exit(EXIT_SUCCESS);
    }

    // Pretty print
    console.log(chalk.bold.underline('Format Coverage Analysis\n'));

    console.log(chalk.bold('Summary'));
    console.log(`  Total formats:     ${result.totalFormats}`);
    console.log(`  Interaction types: ${result.interactionTypes.length}`);
    console.log(`  High-risk:         ${result.highRiskPointers.length}`);
    console.log();

    // Coverage gaps
    const gapEntries = Object.entries(result.gaps).filter(([, missing]) => missing);
    if (gapEntries.length > 0) {
      console.log(chalk.bold.yellow('Missing Coverage'));
      for (const [category] of gapEntries) {
        console.log(`  ${chalk.yellow('!')} ${category}`);
      }
      console.log();
    } else {
      console.log(chalk.green('All coverage categories satisfied.\n'));
    }

    // Suggested stress cases
    if (result.suggestedStressCases.length > 0) {
      console.log(chalk.bold('Suggested Stress Cases'));
      for (const s of result.suggestedStressCases) {
        console.log(`  - ${s}`);
      }
      console.log();
    }

    // Grammar branch coverage
    if (result.grammarBranches.total > 0) {
      const pct = result.grammarBranches.total > 0
        ? Math.round((result.grammarBranches.covered / result.grammarBranches.total) * 100)
        : 100;
      const pctColor = pct === 100 ? chalk.green : pct >= 70 ? chalk.yellow : chalk.red;
      console.log(chalk.bold('Grammar Branch Coverage'));
      console.log(`  Total branches:   ${result.grammarBranches.total}`);
      console.log(`  Covered:          ${result.grammarBranches.covered}`);
      console.log(`  Uncovered:        ${result.grammarBranches.uncovered}`);
      console.log(`  Coverage:         ${pctColor(`${pct}%`)}`);
      console.log();

      for (const fmt of result.grammarBranches.byFormat) {
        if (fmt.missingScenarios.length > 0) {
          const fmtPct = fmt.coveragePercent;
          const fmtColor = fmtPct === 100 ? chalk.green : fmtPct >= 70 ? chalk.yellow : chalk.red;
          console.log(`  ${chalk.cyan(fmt.format)} ${fmtColor(`${fmtPct}%`)} (${fmt.covered}/${fmt.total})`);
          for (const s of fmt.missingScenarios.slice(0, 3)) {
            const prioColor = s.priority === 'high' ? chalk.red : s.priority === 'medium' ? chalk.yellow : chalk.dim;
            console.log(`    ${prioColor(`[${s.priority}]`)} ${s.suggestion}`);
          }
          if (fmt.missingScenarios.length > 3) {
            console.log(chalk.dim(`    ... and ${fmt.missingScenarios.length - 3} more`));
          }
        }
      }
      console.log();
    }

    // Classification coverage
    if (result.classificationCoverage.length > 0) {
      console.log(chalk.bold('Requirement Classification Coverage'));
      for (const c of result.classificationCoverage) {
        if (!c.summary) continue;
        const s = c.summary;
        console.log(`  ${chalk.cyan(c.format)}: ${s.testableCount}/${s.total} testable (${s.testablePercent}%)`);
        const parts: string[] = [];
        if (s.mustSyntax > 0) parts.push(chalk.green(`${s.mustSyntax} MUST`));
        if (s.shouldSyntax > 0) parts.push(chalk.blue(`${s.shouldSyntax} SHOULD`));
        if (s.ambiguous > 0) parts.push(chalk.yellow(`${s.ambiguous} AMBIG`));
        if (s.semantic > 0) parts.push(chalk.magenta(`${s.semantic} SEM`));
        if (s.outOfScope > 0) parts.push(chalk.dim(`${s.outOfScope} OOS`));
        console.log(`    ${parts.join(' | ')}`);
      }
      console.log();
    }

    // Risk details
    if (result.risks.length > 0) {
      console.log(chalk.bold('Format Risk Details'));
      for (const r of result.risks) {
        const color =
          r.level === 'high' ? chalk.red : r.level === 'medium' ? chalk.yellow : chalk.green;
        console.log(`  ${chalk.dim(r.pointer)}`);
        console.log(`    format=${chalk.cyan(r.format)} risk=${color(`${r.level} (${r.score})`)} obligations=${r.obligations}`);
        if (r.factors.length > 0) {
          console.log(`    factors: ${r.factors.join(', ')}`);
        }
      }
      console.log();
    }

    if (options.ci && hasGaps) {
      console.log(chalk.red(`CI: Coverage gaps detected.`));
      process.exit(EXIT_CI_VIOLATION);
    }

    process.exit(EXIT_SUCCESS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(chalk.red(`Error: ${message}`));
    }
    process.exit(EXIT_ANALYSIS_FAILED);
  }
}

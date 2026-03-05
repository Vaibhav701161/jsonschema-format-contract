import chalk from 'chalk';
import {
  analyzeFormatConstraints,
  computeFormatRisks,
  buildFormatContractSummaries,
  analyzeFormatSurface,
  computeFormatRiskAggregate,
} from '../../src/format';
import { loadSchema, buildModel } from '../utils/buildModel';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED } from '../utils/exitCodes';

interface AnalyzeOptions {
  json?: boolean;
  ci?: boolean;
}

export function runAnalyze(schemaPath: string, options: AnalyzeOptions): void {
  try {
    const schema = loadSchema(schemaPath);
    const model = buildModel(schema);

    const constraints = analyzeFormatConstraints(model);
    const risks = computeFormatRisks(model);
    const summaries = buildFormatContractSummaries(constraints, risks);
    const surface = analyzeFormatSurface(model);
    const riskSummary = computeFormatRiskAggregate(surface);

    if (constraints.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ formats: [], summaries: [], risk: null }, null, 2));
      } else {
        console.log(chalk.yellow('No format keywords found in this schema.'));
      }
      process.exit(EXIT_SUCCESS);
    }

    const result = {
      formats: constraints.map((c) => ({
        pointer: c.pointer,
        format: c.format,
        depth: c.depth,
        underRef: c.underRef,
        refChainDepth: c.refChainDepth,
        underDynamicRef: c.underDynamicRef,
        insideRecursiveCycle: c.insideRecursiveCycle,
        underCombinator: c.underCombinator,
        combinatorTypes: c.combinatorTypes,
        combinatorDepth: c.combinatorDepth,
        underConditional: c.underConditional,
        underUnionType: c.underUnionType,
        underPatternProperties: c.underPatternProperties,
        requiredProperty: c.requiredProperty,
        risk: risks.find((r) => r.pointer === c.pointer)
          ? {
              level: risks.find((r) => r.pointer === c.pointer)!.riskLevel,
              score: Number(risks.find((r) => r.pointer === c.pointer)!.riskScore.toFixed(2)),
              factors: risks.find((r) => r.pointer === c.pointer)!.riskFactors,
            }
          : null,
      })),
      summaries: summaries.map((s) => ({
        format: s.formatName,
        occurrences: s.occurrenceCount,
        riskLevel: s.riskLevel,
        testObligation: s.testObligationEstimate,
      })),
      risk: {
        totalFormats: riskSummary.totalFormats,
        highRiskFormats: riskSummary.highRiskFormats,
        averageRisk: Number(riskSummary.averageRiskScore.toFixed(2)),
        maxRisk: Number(riskSummary.maxRiskScore.toFixed(2)),
      },
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(EXIT_SUCCESS);
    }

    // Pretty print
    console.log(chalk.bold.underline('Format Contract Analysis\n'));

    console.log(chalk.bold('Risk Summary'));
    console.log(`  Total formats:    ${result.risk.totalFormats}`);
    console.log(`  High-risk:        ${result.risk.highRiskFormats}`);
    console.log(`  Average risk:     ${result.risk.averageRisk}`);
    console.log(`  Max risk:         ${result.risk.maxRisk}`);
    console.log();

    console.log(chalk.bold('Format Summaries'));
    for (const s of result.summaries) {
      const riskColor =
        s.riskLevel === 'high' ? chalk.red : s.riskLevel === 'medium' ? chalk.yellow : chalk.green;
      console.log(
        `  ${chalk.cyan(s.format)} (${s.occurrences}x) ${riskColor(s.riskLevel)} test-obligation=${s.testObligation}`,
      );
    }
    console.log();

    console.log(chalk.bold('Format Occurrences'));
    for (const f of result.formats) {
      const risk = f.risk;
      const riskStr = risk
        ? (() => {
            const color =
              risk.level === 'high' ? chalk.red : risk.level === 'medium' ? chalk.yellow : chalk.green;
            return color(`${risk.level} (${risk.score})`);
          })()
        : chalk.dim('n/a');
      console.log(`  ${chalk.dim(f.pointer)}`);
      console.log(`    format=${chalk.cyan(f.format)} risk=${riskStr}`);

      const flags: string[] = [];
      if (f.underRef) flags.push('ref');
      if (f.underCombinator) flags.push(`combinator(${f.combinatorTypes.join(',')})`);
      if (f.underConditional) flags.push('conditional');
      if (f.insideRecursiveCycle) flags.push('recursive');
      if (f.underDynamicRef) flags.push('dynamic-ref');
      if (f.underPatternProperties) flags.push('pattern-props');
      if (f.underUnionType) flags.push('union-type');
      if (f.requiredProperty) flags.push('required');
      if (flags.length > 0) {
        console.log(`    context: ${flags.join(', ')}`);
      }
      if (risk && risk.factors.length > 0) {
        console.log(`    factors: ${risk.factors.join(', ')}`);
      }
    }

    if (options.ci && result.risk.highRiskFormats > 0) {
      console.log();
      console.log(chalk.red(`CI: ${result.risk.highRiskFormats} high-risk format(s) detected.`));
      process.exit(EXIT_ANALYSIS_FAILED);
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

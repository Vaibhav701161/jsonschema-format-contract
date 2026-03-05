import chalk from 'chalk';
import { getSupportedFormats, getFormatSpec } from '../../src/rfc';
import { buildFormatProductionGraph } from '../../src/rfc';
import { classifyFormat } from '../../src/rfc';
import { analyzeBoundaries } from '../../src/rfc';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED } from '../utils/exitCodes';

interface AnalyzeRfcOptions {
  json?: boolean;
}

export function runAnalyzeRfc(format: string, options: AnalyzeRfcOptions): void {
  try {
    const supported = getSupportedFormats();
    if (!supported.includes(format)) {
      const msg = `Unknown format "${format}". Supported: ${supported.join(', ')}`;
      if (options.json) {
        console.log(JSON.stringify({ error: msg }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${msg}`));
      }
      process.exit(EXIT_ANALYSIS_FAILED);
    }

    const spec = getFormatSpec(format)!;
    const graph = buildFormatProductionGraph(format);
    const classification = classifyFormat(format);
    const boundaries = analyzeBoundaries(format);

    const result = {
      format,
      rfc: spec.rfc,
      grammar: spec.grammar,
      productionRules: graph
        ? Array.from(graph.rules.values()).map((r) => ({
            name: r.name,
            definition: r.definition,
            rfcSection: r.rfcSection,
            ruleType: r.ruleType,
            children: r.children,
            isTerminal: r.isTerminal,
            allowedRanges: r.allowedRanges,
          }))
        : [],
      classification: classification
        ? {
            summary: classification.summary,
            rules: classification.rules.map((r) => ({
              ruleName: r.ruleName,
              level: r.level,
              reason: r.reason,
              testable: r.testable,
              rfcSection: r.rfcSection,
            })),
          }
        : null,
      boundaries: boundaries
        ? {
            syntacticCount: boundaries.syntacticCount,
            semanticCount: boundaries.semanticCount,
            syntacticPercent: boundaries.syntacticPercent,
            decisions: boundaries.decisions.map((d) => ({
              ruleName: d.ruleName,
              isSyntactic: d.isSyntactic,
              reason: d.reason,
              level: d.level,
              externalDependency: d.externalDependency,
            })),
          }
        : null,
      ambiguities: classification
        ? classification.rules
            .filter((r) => r.level === 'AMBIGUOUS')
            .map((r) => ({
              ruleName: r.ruleName,
              reason: r.reason,
              rfcSection: r.rfcSection,
            }))
        : [],
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(EXIT_SUCCESS);
    }

    // Pretty print
    console.log(chalk.bold.underline(`RFC Analysis: ${format} (${spec.rfc})\n`));

    // ABNF Grammar
    console.log(chalk.bold('ABNF Grammar:'));
    console.log(chalk.dim(spec.grammar));
    console.log();

    // Production Rules
    if (graph) {
      console.log(chalk.bold(`Production Rules (${graph.rules.size}):`));
      for (const name of graph.sortedNames) {
        const rule = graph.rules.get(name);
        if (!rule) continue;
        const typeColor = rule.isTerminal ? chalk.dim : chalk.cyan;
        console.log(`  ${typeColor(rule.name)} = ${rule.definition}`);
        console.log(`    ${chalk.dim(`[${rule.ruleType}] ${rule.rfcSection}`)}`);
        if (rule.allowedRanges.length > 0) {
          for (const range of rule.allowedRanges) {
            console.log(`    ${chalk.yellow(`range: ${range.min}-${range.max}`)}`);
          }
        }
      }
      console.log();
    }

    // Classification
    if (classification) {
      const s = classification.summary;
      console.log(chalk.bold('Requirement Classification:'));
      console.log(`  MUST_SYNTAX:   ${chalk.green(String(s.mustSyntax))}`);
      console.log(`  SHOULD_SYNTAX: ${chalk.blue(String(s.shouldSyntax))}`);
      console.log(`  AMBIGUOUS:     ${chalk.yellow(String(s.ambiguous))}`);
      console.log(`  SEMANTIC:      ${chalk.magenta(String(s.semantic))}`);
      console.log(`  OUT_OF_SCOPE:  ${chalk.dim(String(s.outOfScope))}`);
      console.log(`  Testable:      ${s.testableCount}/${s.total} (${s.testablePercent}%)`);
      console.log();

      for (const rule of classification.rules) {
        const levelColor =
          rule.level === 'MUST_SYNTAX' ? chalk.green :
          rule.level === 'SHOULD_SYNTAX' ? chalk.blue :
          rule.level === 'AMBIGUOUS' ? chalk.yellow :
          rule.level === 'SEMANTIC' ? chalk.magenta :
          chalk.dim;
        console.log(`  ${levelColor(`[${rule.level}]`)} ${rule.ruleName}`);
        console.log(`    ${chalk.dim(rule.reason)}`);
      }
      console.log();
    }

    // Syntactic/Semantic Boundary
    if (boundaries) {
      console.log(chalk.bold('Syntactic/Semantic Boundary:'));
      console.log(`  Syntactic: ${chalk.green(String(boundaries.syntacticCount))} (${boundaries.syntacticPercent}%)`);
      console.log(`  Semantic:  ${chalk.magenta(String(boundaries.semanticCount))}`);
      console.log();

      const semanticDecisions = boundaries.decisions.filter((d) => !d.isSyntactic);
      if (semanticDecisions.length > 0) {
        console.log(chalk.bold('Semantic Rules (documentation only):'));
        for (const d of semanticDecisions) {
          console.log(`  ${chalk.magenta(d.ruleName)}: ${d.reason}`);
          if (d.externalDependency) {
            console.log(`    ${chalk.dim(`External: ${d.externalDependency}`)}`);
          }
        }
        console.log();
      }
    }

    // Ambiguities
    if (result.ambiguities.length > 0) {
      console.log(chalk.bold.yellow('Ambiguous Rules:'));
      for (const a of result.ambiguities) {
        console.log(`  ${chalk.yellow('⚠')} ${a.ruleName} (${a.rfcSection})`);
        console.log(`    ${a.reason}`);
      }
      console.log();
    } else {
      console.log(chalk.green('No ambiguous rules detected.\n'));
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

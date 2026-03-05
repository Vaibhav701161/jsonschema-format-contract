import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { getSupportedFormats } from '../../src/rfc';
import { surveyFormat, surveyAll, surveyToCsv, type AdapterTestFn } from '../../src/survey';
import { aggregateResults } from '../../src/survey';
import { analyzeDivergences, summarizeDivergences } from '../../src/survey';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED, EXIT_CI_VIOLATION } from '../utils/exitCodes';

interface RunSurveyOptions {
  json?: boolean;
  csv?: string;
  ci?: boolean;
  all?: boolean;
}

export function runSurvey(format: string | undefined, options: RunSurveyOptions): void {
  try {
    const adapters = detectSurveyAdapters();

    if (adapters.size === 0) {
      const msg = 'No validator adapters available. Install ajv, python-jsonschema, or jsonschema-rs.';
      if (options.json) {
        console.log(JSON.stringify({ error: msg, adapters: [] }, null, 2));
      } else {
        console.error(chalk.yellow(`Warning: ${msg}`));
        console.log(chalk.dim('Survey requires at least one external validator.'));
        console.log(chalk.dim('Run without adapters to see expected results only.'));
      }
      // Still produce a report with zero adapters
    }

    if (options.all || !format) {
      const report = surveyAll(adapters);
      const aggregated = aggregateResults(report);
      const divergences = analyzeDivergences(report);

      if (options.csv) {
        const csvData = surveyToCsv(report);
        fs.writeFileSync(options.csv, csvData);
        if (!options.json) {
          console.log(chalk.green(`Survey results exported to ${options.csv}`));
        }
      }

      if (options.json) {
        console.log(JSON.stringify({
          summary: {
            totalFormats: aggregated.totalFormats,
            totalTests: aggregated.totalTests,
            adapters: aggregated.adapters,
            overallAgreement: aggregated.overallAgreement,
          },
          adapterSummaries: aggregated.adapterSummaries,
          formatResults: aggregated.formatResults,
          divergences: {
            total: divergences.totalDivergences,
            bySeverity: divergences.bySeverity,
            byCause: divergences.byCause,
            entries: divergences.entries.slice(0, 50),
          },
        }, null, 2));
      } else if (!options.csv) {
        printSurveyReport(aggregated, divergences);
      }

      if (options.ci && divergences.totalDivergences > 0) {
        const critical = divergences.bySeverity.critical;
        if (critical > 0) {
          console.log(chalk.red(`CI: ${critical} critical divergences detected.`));
          process.exit(EXIT_CI_VIOLATION);
        }
      }

      process.exit(EXIT_SUCCESS);
    }

    // Single format
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

    const result = surveyFormat(format, adapters);
    if (!result) {
      console.error(chalk.red(`Failed to survey format: ${format}`));
      process.exit(EXIT_ANALYSIS_FAILED);
    }

    // Build a minimal report for single format
    const singleReport = {
      formats: [result],
      adapters: Array.from(adapters.keys()),
      timestamp: result.timestamp,
      totalFormats: 1,
      totalTests: result.totalTests,
    };
    const aggregated = aggregateResults(singleReport);
    const divergences = analyzeDivergences(singleReport);

    if (options.json) {
      console.log(JSON.stringify({
        format,
        adapters: aggregated.adapters,
        results: aggregated.formatResults[0],
        divergences: divergences.entries,
      }, null, 2));
    } else {
      printSurveyReport(aggregated, divergences);
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

function printSurveyReport(
  aggregated: ReturnType<typeof aggregateResults>,
  divergences: ReturnType<typeof analyzeDivergences>,
): void {
  console.log(chalk.bold.underline('Validator Survey Report\n'));

  console.log(chalk.bold('Summary'));
  console.log(`  Formats surveyed: ${aggregated.totalFormats}`);
  console.log(`  Total tests:      ${aggregated.totalTests}`);
  console.log(`  Adapters:         ${aggregated.adapters.join(', ') || 'none'}`);
  console.log(`  Overall agreement: ${colorPercent(aggregated.overallAgreement)}`);
  console.log();

  // Adapter summaries
  if (aggregated.adapterSummaries.length > 0) {
    console.log(chalk.bold('Adapter Results'));
    for (const a of aggregated.adapterSummaries) {
      console.log(`  ${chalk.cyan(a.adapter)}: ${a.matches}/${a.total} match (${colorPercent(a.accuracy)})`);
      if (a.mismatches > 0) console.log(`    ${chalk.yellow(`${a.mismatches} mismatches`)}`);
      if (a.errors > 0) console.log(`    ${chalk.red(`${a.errors} errors`)}`);
    }
    console.log();
  }

  // Format results (worst agreement first)
  console.log(chalk.bold('Per-Format Results'));
  for (const f of aggregated.formatResults) {
    const icon = f.agreementRate === 100 ? chalk.green('✓') : chalk.yellow('⚠');
    console.log(`  ${icon} ${chalk.cyan(f.format)} (${f.rfc}): ${colorPercent(f.agreementRate)} agreement`);
  }
  console.log();

  // Divergences
  if (divergences.totalDivergences > 0) {
    console.log(chalk.bold.yellow(`Divergences (${divergences.totalDivergences})`));
    console.log(summarizeDivergences(divergences));
  } else {
    console.log(chalk.green('No divergences detected.'));
  }
}

function colorPercent(pct: number): string {
  if (pct === 100) return chalk.green(`${pct}%`);
  if (pct >= 80) return chalk.yellow(`${pct}%`);
  return chalk.red(`${pct}%`);
}

/**
 * Detect available validator adapters for survey mode.
 * Returns test functions that validate format strings.
 */
function detectSurveyAdapters(): Map<string, AdapterTestFn> {
  const adapters = new Map<string, AdapterTestFn>();

  // Try to detect AJV
  try {

    execSync('node -e "require(\'ajv\')"', { stdio: 'ignore' });
    adapters.set('ajv', createNodeAdapter('ajv'));
  } catch { /* not available */ }

  // Try to detect python-jsonschema
  try {
    execSync('python3 -c "import jsonschema"', { stdio: 'ignore' });
    adapters.set('python-jsonschema', createPythonAdapter());
  } catch { /* not available */ }

  return adapters;
}

function createNodeAdapter(_adapterName: string): AdapterTestFn {
  return (format: string, input: string) => {
    try {
      const script = `
        const Ajv = require('ajv');
        const addFormats = require('ajv-formats');
        const ajv = new Ajv();
        addFormats(ajv);
        const validate = ajv.compile({ format: ${JSON.stringify(format)} });
        const valid = validate(${JSON.stringify(input)});
        console.log(JSON.stringify({ valid }));
      `;
      const result = execSync(`node -e ${JSON.stringify(script)}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const parsed = JSON.parse(result.trim()) as { valid: boolean };
      return { valid: parsed.valid };
    } catch (err) {
      return { valid: null, error: err instanceof Error ? err.message : String(err) };
    }
  };
}

function createPythonAdapter(): AdapterTestFn {
  return (format: string, input: string) => {
    try {
      const script = `
import json, jsonschema
try:
    jsonschema.validate(instance=${JSON.stringify(input)}, schema={"format": ${JSON.stringify(format)}}, format_checker=jsonschema.FormatChecker())
    print(json.dumps({"valid": True}))
except jsonschema.ValidationError:
    print(json.dumps({"valid": False}))
except Exception as e:
    print(json.dumps({"valid": None, "error": str(e)}))
`;
      const result = execSync(`python3 -c ${JSON.stringify(script)}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const parsed = JSON.parse(result.trim()) as { valid: boolean | null; error?: string };
      return { valid: parsed.valid, error: parsed.error };
    } catch (err) {
      return { valid: null, error: err instanceof Error ? err.message : String(err) };
    }
  };
}

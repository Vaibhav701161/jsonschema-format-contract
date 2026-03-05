import chalk from 'chalk';
import { generateFormatTestSuite } from '../../src/generator';
import {
  detectAvailableAdapters,
  runCrossImplementation,
} from '../../src/implementations';
import { getSupportedFormats } from '../../src/rfc';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED, EXIT_CI_VIOLATION } from '../utils/exitCodes';

interface TestImplOptions {
  json?: boolean;
  ci?: boolean;
  adapter?: string;
}

export function runTestImplementations(format: string, options: TestImplOptions): void {
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

    const suite = generateFormatTestSuite(format);
    if (!suite) {
      console.error(chalk.red(`Failed to generate test suite for: ${format}`));
      process.exit(EXIT_ANALYSIS_FAILED);
    }

    const allTests = [...suite.validTests.tests, ...suite.invalidTests.tests];

    let adapters = detectAvailableAdapters();

    if (options.adapter) {
      adapters = adapters.filter((a) => a.name === options.adapter);
      if (adapters.length === 0) {
        const msg = `Adapter "${options.adapter}" not found or not available.`;
        if (options.json) {
          console.log(JSON.stringify({ error: msg }, null, 2));
        } else {
          console.error(chalk.red(`Error: ${msg}`));
        }
        process.exit(EXIT_ANALYSIS_FAILED);
      }
    }

    if (adapters.length === 0) {
      const msg = 'No implementation adapters available. Install ajv-cli, python-jsonschema, or jsonschema-rs.';
      if (options.json) {
        console.log(JSON.stringify({ error: msg, adapters: [] }, null, 2));
      } else {
        console.error(chalk.yellow(msg));
      }
      process.exit(EXIT_SUCCESS);
    }

    const report = runCrossImplementation(format, allTests, adapters);

    if (options.json) {
      console.log(JSON.stringify({
        format: report.format,
        adapters: report.adapters,
        reports: report.reports.map((r) => ({
          adapter: r.adapter,
          language: r.language,
          total: r.total,
          passed: r.passed,
          failed: r.failed,
          errors: r.errors,
        })),
        divergences: report.divergences,
      }, null, 2));

      if (options.ci && report.divergences.length > 0) {
        process.exit(EXIT_CI_VIOLATION);
      }
      process.exit(EXIT_SUCCESS);
    }

    // Pretty print
    console.log(chalk.bold.underline(`Implementation Test: ${format}\n`));
    console.log(`Adapters: ${report.adapters.join(', ')}\n`);

    for (const r of report.reports) {
      const passRate = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0;
      const color = passRate === 100 ? chalk.green : passRate >= 80 ? chalk.yellow : chalk.red;
      console.log(chalk.bold(`  ${r.adapter} (${r.language})`));
      console.log(`    ${color(`${r.passed}/${r.total} passed (${passRate}%)`)}`);
      if (r.failed > 0) console.log(`    ${chalk.red(`${r.failed} failed`)}`);
      if (r.errors > 0) console.log(`    ${chalk.yellow(`${r.errors} errors`)}`);
      console.log();
    }

    if (report.divergences.length > 0) {
      console.log(chalk.bold.red(`Divergences (${report.divergences.length}):\n`));
      for (const d of report.divergences) {
        console.log(`  ${chalk.dim(d.testDescription)}`);
        console.log(`    Input: ${JSON.stringify(d.input)}`);
        console.log(`    Expected: ${d.expected ? 'valid' : 'invalid'}`);
        for (const [adapter, result] of Object.entries(d.results)) {
          const match = result.actual === d.expected;
          const icon = match ? chalk.green('✓') : chalk.red('✗');
          console.log(`    ${icon} ${adapter}: ${result.actual ? 'valid' : 'invalid'}${result.error ? ` (${result.error})` : ''}`);
        }
        console.log();
      }
    } else {
      console.log(chalk.green('No divergences detected across implementations.'));
    }

    if (options.ci && report.divergences.length > 0) {
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  generateFormatTestSuite,
  generateAllFormatTestSuites,
  toTestSuiteJson,
} from '../../src/generator';
import { toCitedTestSuiteJson } from '../../src/generator';
import { getSupportedFormats } from '../../src/rfc';
import { exploreGrammarEdges } from '../../src/generator';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED, EXIT_CI_VIOLATION } from '../utils/exitCodes';

interface GenerateSuiteOptions {
  json?: boolean;
  outDir?: string;
  all?: boolean;
  ci?: boolean;
  cited?: boolean;
}

export function runGenerateSuite(format: string | undefined, options: GenerateSuiteOptions): void {
  try {
    if (options.all || !format) {
      generateAll(options);
      return;
    }

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
      console.error(chalk.red(`Failed to generate suite for format: ${format}`));
      process.exit(EXIT_ANALYSIS_FAILED);
    }

    if (options.outDir) {
      const testData = options.cited ? toCitedTestSuiteJson(format) : toTestSuiteJson(suite);
      writeSuiteToDir(suite.format, testData, options.outDir);
      if (!options.json) {
        console.log(chalk.green(`Generated test suite for "${format}" in ${options.outDir}`));
        printSuiteSummary(suite.format);
      }
    }

    if (options.json) {
      const testData = options.cited ? toCitedTestSuiteJson(format) : toTestSuiteJson(suite);
      console.log(JSON.stringify(testData, null, 2));
    } else if (!options.outDir) {
      // Print to stdout in readable format
      printSuiteReadable(suite.format);
    }

    // CI mode: fail if there are untested grammar branches
    if (options.ci) {
      const exploration = exploreGrammarEdges(format);
      if (exploration && exploration.uncoveredCount > 0) {
        console.log(chalk.red(`CI: ${exploration.uncoveredCount} untested grammar branches for "${format}".`));
        process.exit(EXIT_CI_VIOLATION);
      }
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

function generateAll(options: GenerateSuiteOptions): void {
  const suites = generateAllFormatTestSuites();

  if (options.outDir) {
    for (const suite of suites) {
      const testData = options.cited ? toCitedTestSuiteJson(suite.format) : toTestSuiteJson(suite);
      writeSuiteToDir(suite.format, testData, options.outDir);
    }
    if (!options.json) {
      console.log(chalk.green(`Generated ${suites.length} test suites in ${options.outDir}`));
      for (const suite of suites) {
        console.log(`  ${chalk.cyan(suite.format)}: ${suite.totalTests} tests`);
      }
    }
  }

  if (options.json) {
    const allSuiteData: Record<string, object[]> = {};
    for (const suite of suites) {
      allSuiteData[suite.format] = options.cited
        ? toCitedTestSuiteJson(suite.format)
        : toTestSuiteJson(suite);
    }
    console.log(JSON.stringify(allSuiteData, null, 2));
  } else if (!options.outDir) {
    for (const suite of suites) {
      printSuiteReadable(suite.format);
      console.log();
    }
  }

  process.exit(EXIT_SUCCESS);
}

function writeSuiteToDir(format: string, testGroups: object[], outDir: string): void {
  // Write to JSON Schema Test Suite directory structure:
  // tests/draft2020-12/optional/format/<format>.json
  const formatDir = path.join(outDir, 'tests', 'draft2020-12', 'optional', 'format');
  fs.mkdirSync(formatDir, { recursive: true });

  const filePath = path.join(formatDir, `${format}.json`);
  const json = JSON.stringify(testGroups, null, 2) + '\n';
  fs.writeFileSync(filePath, json);
}

function printSuiteReadable(format: string): void {
  const suite = generateFormatTestSuite(format);
  if (!suite) return;

  console.log(chalk.bold.underline(`Format: ${suite.format} (${suite.rfc})\n`));

  console.log(chalk.bold.green(`  Valid tests (${suite.validTests.tests.length}):`));
  for (const t of suite.validTests.tests) {
    console.log(`    ${chalk.green('✓')} ${t.description}`);
    console.log(`      ${chalk.dim(JSON.stringify(t.data))}`);
  }

  console.log(chalk.bold.red(`\n  Invalid tests (${suite.invalidTests.tests.length}):`));
  for (const t of suite.invalidTests.tests) {
    console.log(`    ${chalk.red('✗')} ${t.description}`);
    console.log(`      ${chalk.dim(JSON.stringify(t.data))}`);
  }

  printSuiteSummary(format);
}

function printSuiteSummary(format: string): void {
  const exploration = exploreGrammarEdges(format);
  if (exploration) {
    console.log(chalk.bold(`\n  Grammar coverage: ${exploration.coveragePercent}%`));
    console.log(`    Branches: ${exploration.coveredCount}/${exploration.totalBranches}`);
    if (exploration.uncoveredAreas.length > 0) {
      console.log(chalk.yellow(`    Uncovered (${exploration.uncoveredCount}):`));
      for (const area of exploration.uncoveredAreas.slice(0, 5)) {
        const color = area.priority === 'high' ? chalk.red : area.priority === 'medium' ? chalk.yellow : chalk.dim;
        console.log(`      ${color(`[${area.priority}]`)} ${area.suggestion}`);
      }
      if (exploration.uncoveredAreas.length > 5) {
        console.log(chalk.dim(`      ... and ${exploration.uncoveredAreas.length - 5} more`));
      }
    }
  }
}

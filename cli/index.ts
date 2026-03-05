#!/usr/bin/env node

import { Command } from 'commander';
import { runAnalyze } from './commands/analyze';
import { runDiff } from './commands/diff';
import { runCoverage } from './commands/coverage';
import { runGenerateSuite } from './commands/generateSuite';
import { runTestImplementations } from './commands/testImplementations';
import { runAnalyzeRfc } from './commands/analyzeRfc';
import { runGenerateBaseline } from './commands/generateBaseline';
import { runSurvey } from './commands/runSurvey';
import { runExportFramework } from './commands/exportFramework';

const program = new Command();

program
  .name('jsonschema-format-contract')
  .description('JSON Schema Format Contract & Coverage Engine')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze format contracts in a JSON Schema')
  .argument('<schema>', 'Path to JSON Schema file')
  .option('--json', 'Output as JSON')
  .option('--ci', 'Exit 1 if high-risk formats detected')
  .action((schema: string, options: { json?: boolean; ci?: boolean }) => {
    runAnalyze(schema, options);
  });

program
  .command('diff')
  .description('Detect format contract regressions between two schema versions')
  .argument('<old>', 'Path to old JSON Schema file')
  .argument('<new>', 'Path to new JSON Schema file')
  .option('--json', 'Output as JSON')
  .option('--ci', 'Exit 3 if breaking changes detected')
  .action((oldPath: string, newPath: string, options: { json?: boolean; ci?: boolean }) => {
    runDiff(oldPath, newPath, options);
  });

program
  .command('coverage')
  .description('Detect format test coverage gaps')
  .argument('<schema>', 'Path to JSON Schema file')
  .option('--json', 'Output as JSON')
  .option('--ci', 'Exit 3 if coverage gaps detected')
  .option('--tests <file>', 'Path to test metadata JSON file')
  .action((schema: string, options: { json?: boolean; ci?: boolean; tests?: string }) => {
    runCoverage(schema, options);
  });

program
  .command('generate-suite')
  .description('Generate format test suite in JSON Schema Test Suite format')
  .argument('[format]', 'Format to generate tests for (e.g. email, uri, date-time)')
  .option('--json', 'Output as JSON')
  .option('--out-dir <dir>', 'Write test files to directory')
  .option('--all', 'Generate tests for all supported formats')
  .option('--ci', 'Exit 3 if untested grammar branches exist')
  .option('--cited', 'Include RFC citations and specification metadata in output')
  .action((format: string | undefined, options: { json?: boolean; outDir?: string; all?: boolean; ci?: boolean; cited?: boolean }) => {
    runGenerateSuite(format, options);
  });

program
  .command('test-implementations')
  .description('Run format test cases against validator implementations')
  .argument('<format>', 'Format to test (e.g. email, uri, date-time)')
  .option('--json', 'Output as JSON')
  .option('--ci', 'Exit 3 if divergences detected')
  .option('--adapter <name>', 'Test only a specific adapter (ajv, python-jsonschema, rust-jsonschema)')
  .action((format: string, options: { json?: boolean; ci?: boolean; adapter?: string }) => {
    runTestImplementations(format, options);
  });

program
  .command('analyze-rfc')
  .description('Analyze RFC grammar, classify production rules, and detect ambiguities')
  .argument('<format>', 'Format to analyze (e.g. email, uri, date-time)')
  .option('--json', 'Output as JSON')
  .action((format: string, options: { json?: boolean }) => {
    runAnalyzeRfc(format, options);
  });

program
  .command('generate-baseline')
  .description('Generate per-format baseline document with ABNF, classification, and divergences')
  .argument('<format>', 'Format to generate baseline for (e.g. email, date-time)')
  .option('--json', 'Output as JSON')
  .option('--out-dir <dir>', 'Output directory (default: baseline/)')
  .action((format: string, options: { json?: boolean; outDir?: string }) => {
    runGenerateBaseline(format, options);
  });

program
  .command('run-survey')
  .description('Run format validation tests against available validator implementations')
  .argument('[format]', 'Format to survey (omit for all formats)')
  .option('--json', 'Output as JSON')
  .option('--csv <file>', 'Export results to CSV file')
  .option('--ci', 'Exit 3 if critical divergences detected')
  .option('--all', 'Survey all supported formats')
  .action((format: string | undefined, options: { json?: boolean; csv?: string; ci?: boolean; all?: boolean }) => {
    runSurvey(format, options);
  });

program
  .command('export-framework')
  .description('Export the formal decision framework as a markdown document')
  .option('--json', 'Output as JSON')
  .option('--output <file>', 'Output file path (default: decision-framework.md)')
  .action((options: { json?: boolean; output?: string }) => {
    runExportFramework(options);
  });

program.parse();

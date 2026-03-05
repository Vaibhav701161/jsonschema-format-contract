import chalk from 'chalk';
import {
  detectFormatContractChanges,
  compareFormatEvolution,
  analyzeFormatConstraints,
} from '../../src/format';
import { exploreGrammarEdges } from '../../src/generator';
import { loadSchema, buildModel } from '../utils/buildModel';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED, EXIT_CI_VIOLATION } from '../utils/exitCodes';

interface DiffOptions {
  json?: boolean;
  ci?: boolean;
}

export function runDiff(oldPath: string, newPath: string, options: DiffOptions): void {
  try {
    const oldSchema = loadSchema(oldPath);
    const newSchema = loadSchema(newPath);
    const oldModel = buildModel(oldSchema);
    const newModel = buildModel(newSchema);

    const contractDiff = detectFormatContractChanges(oldModel, newModel);
    const evolution = compareFormatEvolution(oldModel, newModel);

    // Compute testing obligation impact
    const oldConstraints = analyzeFormatConstraints(oldModel);
    const newConstraints = analyzeFormatConstraints(newModel);

    const oldFormats = [...new Set(oldConstraints.map((c) => c.format))].sort();
    const newFormats = [...new Set(newConstraints.map((c) => c.format))].sort();

    const addedFormatNames = newFormats.filter((f) => !oldFormats.includes(f));
    const removedFormatNames = oldFormats.filter((f) => !newFormats.includes(f));

    // Calculate grammar branch impact for new formats
    const obligationImpact: Array<{ format: string; action: string; branches: number; message: string }> = [];

    for (const fmt of addedFormatNames) {
      const exploration = exploreGrammarEdges(fmt);
      if (exploration) {
        obligationImpact.push({
          format: fmt,
          action: 'added',
          branches: exploration.totalBranches,
          message: `Format "${fmt}" added: +${exploration.totalBranches} grammar branches to test`,
        });
      }
    }
    for (const fmt of removedFormatNames) {
      const exploration = exploreGrammarEdges(fmt);
      if (exploration) {
        obligationImpact.push({
          format: fmt,
          action: 'removed',
          branches: exploration.totalBranches,
          message: `Format "${fmt}" removed: -${exploration.totalBranches} grammar branches`,
        });
      }
    }

    const result = {
      addedFormats: contractDiff.addedFormats,
      removedFormats: contractDiff.removedFormats,
      modifiedFormats: contractDiff.modifiedFormats,
      breakingChanges: contractDiff.breakingChanges.map((c) => ({
        category: c.category,
        ruleId: c.ruleId,
        pointer: c.pointer,
        message: c.message,
        ...(c.oldValue !== undefined ? { oldValue: c.oldValue } : {}),
        ...(c.newValue !== undefined ? { newValue: c.newValue } : {}),
      })),
      riskChanges: contractDiff.riskChanges.map((c) => ({
        category: c.category,
        ruleId: c.ruleId,
        pointer: c.pointer,
        message: c.message,
        ...(c.oldValue !== undefined ? { oldValue: c.oldValue } : {}),
        ...(c.newValue !== undefined ? { newValue: c.newValue } : {}),
      })),
      evolution: {
        addedFormats: evolution.addedFormats.length,
        removedFormats: evolution.removedFormats.length,
        modifiedFormats: evolution.modifiedFormats.length,
        breakingChanges: evolution.breakingChanges.length,
        riskChanges: evolution.riskChanges.length,
      },
      obligationImpact,
    };

    const hasBreaking = result.breakingChanges.length > 0;

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      if (options.ci && hasBreaking) {
        process.exit(EXIT_CI_VIOLATION);
      }
      process.exit(EXIT_SUCCESS);
    }

    // Pretty print
    console.log(chalk.bold.underline('Format Contract Diff\n'));

    // Summary
    const totalChanges =
      result.addedFormats.length +
      result.removedFormats.length +
      result.modifiedFormats.length;

    if (totalChanges === 0 && result.breakingChanges.length === 0 && result.riskChanges.length === 0) {
      console.log(chalk.green('No format contract changes detected.'));
      process.exit(EXIT_SUCCESS);
    }

    // Added formats
    if (result.addedFormats.length > 0) {
      console.log(chalk.bold('Added Formats'));
      for (const f of result.addedFormats) {
        console.log(`  ${chalk.green('+')} ${chalk.dim(f.pointer)} ${chalk.cyan(f.format)}`);
      }
      console.log();
    }

    // Removed formats
    if (result.removedFormats.length > 0) {
      console.log(chalk.bold('Removed Formats'));
      for (const f of result.removedFormats) {
        console.log(`  ${chalk.red('-')} ${chalk.dim(f.pointer)} ${chalk.cyan(f.format)}`);
      }
      console.log();
    }

    // Modified formats
    if (result.modifiedFormats.length > 0) {
      console.log(chalk.bold('Modified Formats'));
      for (const f of result.modifiedFormats) {
        console.log(
          `  ${chalk.yellow('~')} ${chalk.dim(f.pointer)} ${chalk.red(f.oldFormat)} -> ${chalk.green(f.newFormat)}`,
        );
      }
      console.log();
    }

    // Breaking changes
    if (result.breakingChanges.length > 0) {
      console.log(chalk.bold.red('Breaking Changes'));
      for (const c of result.breakingChanges) {
        console.log(`  ${chalk.red('!')} ${chalk.dim(c.pointer)}`);
        console.log(`    ${c.ruleId}: ${c.message}`);
      }
      console.log();
    }

    // Risk changes
    if (result.riskChanges.length > 0) {
      console.log(chalk.bold.yellow('Risk Changes'));
      for (const c of result.riskChanges) {
        console.log(`  ${chalk.yellow('~')} ${chalk.dim(c.pointer)}`);
        console.log(`    ${c.ruleId}: ${c.message}`);
      }
      console.log();
    }

    // Testing obligation impact
    if (result.obligationImpact.length > 0) {
      console.log(chalk.bold('Testing Obligation Impact'));
      for (const o of result.obligationImpact) {
        const icon = o.action === 'added' ? chalk.green('+') : chalk.red('-');
        console.log(`  ${icon} ${o.message}`);
      }
      console.log();
    }

    if (options.ci && hasBreaking) {
      console.log(chalk.red(`CI: ${result.breakingChanges.length} breaking change(s) detected.`));
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

import * as fs from 'node:fs';
import chalk from 'chalk';
import { getSupportedFormats, getFormatSpec } from '../../src/rfc';
import { classifyFormat, type ClassificationReport } from '../../src/rfc';
import { analyzeBoundaries } from '../../src/rfc';
import { validateTestConsistency } from '../../src/generator';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED } from '../utils/exitCodes';

interface ExportFrameworkOptions {
  json?: boolean;
  output?: string;
}

export function runExportFramework(options: ExportFrameworkOptions): void {
  try {
    const markdown = generateDecisionFramework();

    if (options.json) {
      console.log(JSON.stringify({ document: markdown }, null, 2));
      process.exit(EXIT_SUCCESS);
    }

    const outputPath = options.output ?? 'decision-framework.md';
    fs.writeFileSync(outputPath, markdown);
    console.log(chalk.green(`Decision framework exported to: ${outputPath}`));
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

function generateDecisionFramework(): string {
  const formats = getSupportedFormats();
  const lines: string[] = [];

  lines.push('# JSON Schema Format Validation Decision Framework');
  lines.push('');
  lines.push('This document describes the systematic methodology for determining which');
  lines.push('format validation behaviors are testable at the specification level.');
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('The framework follows a 5-step process for each format:');
  lines.push('');
  lines.push('1. **RFC Extraction** — Extract ABNF grammar from the governing RFC');
  lines.push('2. **Production Classification** — Classify each production rule into one of 5 tiers');
  lines.push('3. **Boundary Detection** — Determine syntactic vs semantic boundary');
  lines.push('4. **Test Derivation** — Generate tests for syntactic (testable) rules');
  lines.push('5. **Divergence Detection** — Identify where validators disagree');
  lines.push('');

  // Classification hierarchy
  lines.push('## Classification Hierarchy');
  lines.push('');
  lines.push('| Level | Description | Test Generation |');
  lines.push('|-------|-------------|-----------------|');
  lines.push('| MUST_SYNTAX | Explicit ABNF grammar rule | 1 valid + 1 invalid per rule |');
  lines.push('| SHOULD_SYNTAX | RFC prose affecting syntax | 1 test per interpretation |');
  lines.push('| AMBIGUOUS | Multiple valid interpretations | Document + test both sides |');
  lines.push('| SEMANTIC | Requires runtime knowledge | Documentation note only |');
  lines.push('| OUT_OF_SCOPE | Transport/delivery concern | No action |');
  lines.push('');

  // Syntactic boundary principle
  lines.push('## Syntactic Boundary Principle');
  lines.push('');
  lines.push('> A rule is **syntactic** if its validity can be determined by parsing');
  lines.push('> the string alone, without external knowledge (DNS lookups, calendar');
  lines.push('> math, runtime state).');
  lines.push('');
  lines.push('Semantic rules produce documentation notes, not validation tests.');
  lines.push('');

  // Per-format analysis
  lines.push('## Per-Format Analysis');
  lines.push('');

  for (const format of formats) {
    const spec = getFormatSpec(format);
    const classification = classifyFormat(format);
    const boundaries = analyzeBoundaries(format);

    if (!spec || !classification) continue;

    lines.push(`### ${format}`);
    lines.push('');
    lines.push(`**RFC:** ${spec.rfc} | **Category:** ${spec.category}`);
    lines.push('');
    lines.push(formatClassificationSummary(classification));
    lines.push('');

    if (boundaries) {
      lines.push(`**Boundary:** ${boundaries.syntacticCount} syntactic, ${boundaries.semanticCount} semantic (${boundaries.syntacticPercent}% testable)`);
      lines.push('');

      const semanticRules = boundaries.decisions.filter((d) => !d.isSyntactic);
      if (semanticRules.length > 0) {
        lines.push('**Semantic rules (not testable):**');
        for (const r of semanticRules) {
          lines.push(`- ${r.ruleName}: ${r.reason}`);
        }
        lines.push('');
      }
    }

    // Ambiguities
    const ambiguous = classification.rules.filter((r) => r.level === 'AMBIGUOUS');
    if (ambiguous.length > 0) {
      lines.push('**Ambiguities:**');
      for (const r of ambiguous) {
        lines.push(`- ${r.ruleName}: ${r.reason}`);
      }
      lines.push('');
    }
  }

  // Test consistency
  const consistency = validateTestConsistency();
  lines.push('## Test Suite Consistency');
  lines.push('');
  lines.push(`- Total formats: ${consistency.totalFormats}`);
  lines.push(`- Total tests: ${consistency.totalTests}`);
  lines.push(`- Issues: ${consistency.totalIssues} (${consistency.errors} errors, ${consistency.warnings} warnings)`);
  lines.push(`- Clean: ${consistency.clean ? 'Yes' : 'No'}`);
  lines.push('');

  if (consistency.issues.length > 0) {
    lines.push('### Issues');
    lines.push('');
    for (const issue of consistency.issues.slice(0, 20)) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      lines.push(`- ${icon} **${issue.format}** [${issue.type}]: ${issue.details}`);
    }
    if (consistency.issues.length > 20) {
      lines.push(`- ... and ${consistency.issues.length - 20} more`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`Generated by jsonschema-format-contract on ${new Date().toISOString()}`);

  return lines.join('\n');
}

function formatClassificationSummary(report: ClassificationReport): string {
  const s = report.summary;
  const parts: string[] = [];
  if (s.mustSyntax > 0) parts.push(`${s.mustSyntax} MUST_SYNTAX`);
  if (s.shouldSyntax > 0) parts.push(`${s.shouldSyntax} SHOULD_SYNTAX`);
  if (s.ambiguous > 0) parts.push(`${s.ambiguous} AMBIGUOUS`);
  if (s.semantic > 0) parts.push(`${s.semantic} SEMANTIC`);
  if (s.outOfScope > 0) parts.push(`${s.outOfScope} OUT_OF_SCOPE`);
  return `**Rules:** ${s.total} total (${parts.join(', ')}) — ${s.testablePercent}% testable`;
}

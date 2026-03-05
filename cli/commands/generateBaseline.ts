import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { getSupportedFormats, getFormatSpec } from '../../src/rfc';
import { buildFormatProductionGraph } from '../../src/rfc';
import { classifyFormat, type ClassifiedRule } from '../../src/rfc';
import { analyzeBoundaries } from '../../src/rfc';
import { EXIT_SUCCESS, EXIT_ANALYSIS_FAILED } from '../utils/exitCodes';

interface GenerateBaselineOptions {
  json?: boolean;
  outDir?: string;
}

export function runGenerateBaseline(format: string, options: GenerateBaselineOptions): void {
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

    const markdown = generateBaselineDocument(format);

    if (options.json) {
      console.log(JSON.stringify({ format, document: markdown }, null, 2));
      process.exit(EXIT_SUCCESS);
    }

    const outDir = options.outDir ?? 'baseline';
    fs.mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, `${format}.md`);
    fs.writeFileSync(filePath, markdown);
    console.log(chalk.green(`Generated baseline document: ${filePath}`));

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

function generateBaselineDocument(format: string): string {
  const spec = getFormatSpec(format)!;
  const graph = buildFormatProductionGraph(format);
  const classification = classifyFormat(format);
  const boundaries = analyzeBoundaries(format);

  const lines: string[] = [];

  // Header
  lines.push(`# Format Baseline: ${format}`);
  lines.push('');
  lines.push(`**RFC:** ${spec.rfc}`);
  lines.push(`**Category:** ${spec.category}`);
  lines.push(`**Description:** ${spec.description}`);
  lines.push('');

  // ABNF Extraction
  lines.push('## 1. ABNF Grammar Extraction');
  lines.push('');
  lines.push('```abnf');
  lines.push(spec.grammar);
  lines.push('```');
  lines.push('');

  // Production Rules
  if (graph) {
    lines.push('## 2. Production Rules');
    lines.push('');
    lines.push('| Rule | Type | RFC Section | Definition |');
    lines.push('|------|------|-------------|------------|');
    for (const name of graph.sortedNames) {
      const rule = graph.rules.get(name)!;
      lines.push(`| ${rule.name} | ${rule.ruleType} | ${rule.rfcSection} | \`${rule.definition}\` |`);
    }
    lines.push('');
  }

  // Classification Table
  if (classification) {
    lines.push('## 3. Requirement Classification');
    lines.push('');
    lines.push(`- **Total rules:** ${classification.summary.total}`);
    lines.push(`- **Testable:** ${classification.summary.testableCount} (${classification.summary.testablePercent}%)`);
    lines.push(`- **MUST_SYNTAX:** ${classification.summary.mustSyntax}`);
    lines.push(`- **SHOULD_SYNTAX:** ${classification.summary.shouldSyntax}`);
    lines.push(`- **AMBIGUOUS:** ${classification.summary.ambiguous}`);
    lines.push(`- **SEMANTIC:** ${classification.summary.semantic}`);
    lines.push(`- **OUT_OF_SCOPE:** ${classification.summary.outOfScope}`);
    lines.push('');
    lines.push('| Rule | Level | Testable | Reason |');
    lines.push('|------|-------|----------|--------|');
    for (const rule of classification.rules) {
      lines.push(`| ${rule.ruleName} | ${rule.level} | ${rule.testable ? 'Yes' : 'No'} | ${rule.reason} |`);
    }
    lines.push('');
  }

  // Syntactic/Semantic Boundary
  if (boundaries) {
    lines.push('## 4. Syntactic/Semantic Boundary');
    lines.push('');
    lines.push(`- **Syntactic rules:** ${boundaries.syntacticCount} (${boundaries.syntacticPercent}%)`);
    lines.push(`- **Semantic rules:** ${boundaries.semanticCount}`);
    lines.push('');

    const semanticDecisions = boundaries.decisions.filter((d) => !d.isSyntactic);
    if (semanticDecisions.length > 0) {
      lines.push('### Semantic Rules (documentation only, no validation tests)');
      lines.push('');
      for (const d of semanticDecisions) {
        lines.push(`- **${d.ruleName}**: ${d.reason}`);
        if (d.externalDependency) {
          lines.push(`  - External dependency: ${d.externalDependency}`);
        }
      }
      lines.push('');
    }
  }

  // Ambiguities
  if (classification) {
    const ambiguous = classification.rules.filter((r: ClassifiedRule) => r.level === 'AMBIGUOUS');
    lines.push('## 5. Known Ambiguities');
    lines.push('');
    if (ambiguous.length > 0) {
      for (const r of ambiguous) {
        lines.push(`### ${r.ruleName}`);
        lines.push('');
        lines.push(`- **RFC Section:** ${r.rfcSection}`);
        lines.push(`- **Issue:** ${r.reason}`);
        lines.push(`- **Impact:** Validators may disagree on acceptance/rejection`);
        lines.push('');
      }
    } else {
      lines.push('No ambiguous rules detected for this format.');
      lines.push('');
    }
  }

  // Known Divergences
  lines.push('## 6. Known Validator Divergences');
  lines.push('');
  const divergences = getKnownDivergences(format);
  if (divergences.length > 0) {
    lines.push('| Input | Expected | AJV | python-jsonschema | Notes |');
    lines.push('|-------|----------|-----|-------------------|-------|');
    for (const d of divergences) {
      lines.push(`| \`${d.input}\` | ${d.expected} | ${d.ajv} | ${d.python} | ${d.notes} |`);
    }
  } else {
    lines.push('No known divergences documented for this format.');
  }
  lines.push('');

  // Edge Cases
  lines.push('## 7. Edge Cases');
  lines.push('');
  lines.push(`Total edge cases: ${spec.edgeCases.length}`);
  lines.push('');
  lines.push('| Input | Valid | Description |');
  lines.push('|-------|-------|-------------|');
  for (const ec of spec.edgeCases) {
    const inputDisplay = ec.input.length > 50 ? ec.input.slice(0, 47) + '...' : ec.input;
    lines.push(`| \`${inputDisplay}\` | ${ec.valid ? 'Yes' : 'No'} | ${ec.description} |`);
  }
  lines.push('');

  // Non-goals
  lines.push('## 8. Non-Goals');
  lines.push('');
  lines.push('The following are explicitly out of scope for format validation:');
  lines.push('');
  lines.push('- Transport-layer concerns (SMTP delivery, HTTP transport)');
  lines.push('- Application-specific validation (e.g., does this email address actually exist?)');
  lines.push('- Implementation-specific extensions beyond the RFC');

  if (boundaries) {
    const semantic = boundaries.decisions.filter((d) => !d.isSyntactic);
    if (semantic.length > 0) {
      lines.push('- Semantic validation requiring runtime knowledge:');
      for (const s of semantic) {
        lines.push(`  - ${s.ruleName}: ${s.externalDependency ?? s.reason}`);
      }
    }
  }
  lines.push('');

  return lines.join('\n');
}

interface KnownDivergence {
  input: string;
  expected: string;
  ajv: string;
  python: string;
  notes: string;
}

function getKnownDivergences(format: string): KnownDivergence[] {
  const divergences: Record<string, KnownDivergence[]> = {
    'date-time': [
      { input: '2023-12-31T23:59:60Z', expected: 'valid (leap second)', ajv: 'rejects', python: 'accepts', notes: 'Leap second support varies' },
      { input: '2023-01-15t12:30:00z', expected: 'valid (case-insensitive)', ajv: 'accepts', python: 'accepts', notes: 'Lowercase T and Z' },
    ],
    email: [
      { input: '"quoted"@example.com', expected: 'valid', ajv: 'rejects', python: 'accepts', notes: 'Quoted local-part handling' },
      { input: 'user@[192.168.1.1]', expected: 'valid', ajv: 'rejects', python: 'rejects', notes: 'Domain literal support' },
    ],
    duration: [
      { input: 'PT0.5S', expected: 'valid (fractional)', ajv: 'rejects', python: 'N/A', notes: 'Fractional seconds in duration' },
    ],
    ipv6: [
      { input: 'fe80::1%eth0', expected: 'valid (zone ID)', ajv: 'rejects', python: 'rejects', notes: 'Zone ID (RFC 6874) support' },
    ],
  };

  return divergences[format] ?? [];
}

/**
 * Implementation runner: executes test cases against
 * format validator implementations and collects results.
 *
 * This module orchestrates running generated test suites
 * against multiple implementations to detect divergence.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getAllAdapters, type ImplementationAdapter } from './implementationAdapters';
import type { TestCase } from '../generator/formatTestGenerator';

export interface ImplementationTestResult {
  adapter: string;
  language: string;
  testDescription: string;
  input: string;
  expected: boolean;
  actual: boolean;
  match: boolean;
  error?: string;
}

export interface ImplementationReport {
  format: string;
  adapter: string;
  language: string;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  results: ImplementationTestResult[];
}

export interface CrossImplementationReport {
  format: string;
  adapters: string[];
  reports: ImplementationReport[];
  divergences: Divergence[];
}

export interface Divergence {
  testDescription: string;
  input: string;
  expected: boolean;
  results: Record<string, { actual: boolean; error?: string }>;
}

/**
 * Check which adapters are currently available on this system.
 */
export function detectAvailableAdapters(): ImplementationAdapter[] {
  const adapters = getAllAdapters();
  const available: ImplementationAdapter[] = [];

  for (const adapter of adapters) {
    const cmd = adapter.command.split(' ')[0];
    if (!cmd) continue;
    try {
      execSync(`which ${cmd} 2>/dev/null || command -v ${cmd} 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      available.push({ ...adapter, available: true });
    } catch {
      // Adapter not available
    }
  }

  return available;
}

/**
 * Run a single test case against an adapter.
 */
export function runSingleTest(
  adapter: ImplementationAdapter,
  format: string,
  test: TestCase,
): ImplementationTestResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmttest-'));

  try {
    const schemaFile = path.join(tmpDir, 'schema.json');
    const dataFile = path.join(tmpDir, 'data.json');

    fs.writeFileSync(schemaFile, JSON.stringify({ format }, null, 2));
    fs.writeFileSync(dataFile, JSON.stringify(test.data));

    const cmd = adapter.command
      .replace('{schema}', schemaFile)
      .replace('{data}', dataFile);

    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Non-zero exit often means invalid
      if (err && typeof err === 'object' && 'status' in err) {
        exitCode = (err as { status: number }).status;
        stdout = (err as { stdout?: string }).stdout ?? '';
      }
    }

    const result = adapter.parseResult(stdout);
    // For some adapters, non-zero exit means invalid
    const actual = exitCode === 0 ? result.valid : false;

    return {
      adapter: adapter.name,
      language: adapter.language,
      testDescription: test.description,
      input: test.data,
      expected: test.valid,
      actual,
      match: actual === test.valid,
    };
  } catch (err) {
    return {
      adapter: adapter.name,
      language: adapter.language,
      testDescription: test.description,
      input: test.data,
      expected: test.valid,
      actual: false,
      match: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Run all test cases against one adapter.
 */
export function runTestSuite(
  adapter: ImplementationAdapter,
  format: string,
  tests: TestCase[],
): ImplementationReport {
  const results: ImplementationTestResult[] = [];

  for (const test of tests) {
    results.push(runSingleTest(adapter, format, test));
  }

  return {
    format,
    adapter: adapter.name,
    language: adapter.language,
    total: results.length,
    passed: results.filter((r) => r.match).length,
    failed: results.filter((r) => !r.match && !r.error).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}

/**
 * Run test cases across all available adapters and detect divergences.
 */
export function runCrossImplementation(
  format: string,
  tests: TestCase[],
  adapters?: ImplementationAdapter[],
): CrossImplementationReport {
  const available = adapters ?? detectAvailableAdapters();
  const reports: ImplementationReport[] = [];

  for (const adapter of available) {
    reports.push(runTestSuite(adapter, format, tests));
  }

  // Detect divergences: tests where adapters disagree
  const divergences: Divergence[] = [];
  for (const test of tests) {
    const adapterResults: Record<string, { actual: boolean; error?: string }> = {};
    let hasDisagreement = false;
    let firstResult: boolean | undefined;

    for (const report of reports) {
      const result = report.results.find((r) => r.testDescription === test.description);
      if (result) {
        adapterResults[report.adapter] = { actual: result.actual, error: result.error };
        if (firstResult === undefined) {
          firstResult = result.actual;
        } else if (result.actual !== firstResult) {
          hasDisagreement = true;
        }
      }
    }

    if (hasDisagreement) {
      divergences.push({
        testDescription: test.description,
        input: test.data,
        expected: test.valid,
        results: adapterResults,
      });
    }
  }

  return {
    format,
    adapters: available.map((a) => a.name),
    reports,
    divergences,
  };
}

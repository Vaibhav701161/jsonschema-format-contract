#!/usr/bin/env node

/**
 * Benchmark script: runs the format contract analysis engine
 * against well-known large schemas to measure performance
 * and validate real-world applicability.
 *
 * Target schemas:
 * - Docker Bake (docker-bake.hcl JSON Schema)
 * - Kestra (workflow orchestration)
 * - Kubernetes CRDs
 *
 * Usage: npx tsx scripts/benchmark.ts [--json]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPointerIndex, normalizeSchema } from '../src/parser';
import { buildRefGraph, detectCycles } from '../src/graph';
import { analyzeFormatConstraints, computeFormatRisks } from '../src/format';
import { exploreGrammarEdges } from '../src/generator';
import type { StructuralModel } from '../src/types';

interface BenchmarkResult {
  name: string;
  file: string;
  sizeBytes: number;
  nodeCount: number;
  formatCount: number;
  uniqueFormats: string[];
  highRiskCount: number;
  grammarBranches: number;
  parseTimeMs: number;
  analyzeTimeMs: number;
  totalTimeMs: number;
}

function buildModel(schema: unknown): StructuralModel {
  const nodes = buildPointerIndex(schema);
  const normalized = normalizeSchema(nodes);
  const withRefs = buildRefGraph(normalized);
  return detectCycles(withRefs);
}

function benchmarkSchema(name: string, filePath: string): BenchmarkResult | null {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`  Skipping ${name}: file not found at ${resolved}`);
    return null;
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const sizeBytes = Buffer.byteLength(raw, 'utf-8');

  let schema: unknown;
  try {
    schema = JSON.parse(raw) as unknown;
  } catch {
    console.error(`  Skipping ${name}: invalid JSON`);
    return null;
  }

  const parseStart = performance.now();
  const model = buildModel(schema);
  const parseTimeMs = performance.now() - parseStart;

  const analyzeStart = performance.now();
  const constraints = analyzeFormatConstraints(model);
  const risks = computeFormatRisks(model);
  const analyzeTimeMs = performance.now() - analyzeStart;

  const uniqueFormats = [...new Set(constraints.map((c) => c.format))].sort();
  const highRiskCount = risks.filter((r) => r.riskLevel === 'high').length;

  let grammarBranches = 0;
  for (const fmt of uniqueFormats) {
    const exploration = exploreGrammarEdges(fmt);
    if (exploration) grammarBranches += exploration.totalBranches;
  }

  return {
    name,
    file: filePath,
    sizeBytes,
    nodeCount: Object.keys(model.nodes).length,
    formatCount: constraints.length,
    uniqueFormats,
    highRiskCount,
    grammarBranches,
    parseTimeMs: Number(parseTimeMs.toFixed(2)),
    analyzeTimeMs: Number(analyzeTimeMs.toFixed(2)),
    totalTimeMs: Number((parseTimeMs + analyzeTimeMs).toFixed(2)),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  // Default benchmark targets - paths relative to project root
  const targets = [
    { name: 'Docker Bake', file: 'benchmarks/docker-bake.json' },
    { name: 'Kestra', file: 'benchmarks/kestra.json' },
    { name: 'Kubernetes CRD', file: 'benchmarks/k8s-crd.json' },
  ];

  // Allow extra files from CLI
  const extraFiles = args.filter((a) => !a.startsWith('--'));
  for (const f of extraFiles) {
    targets.push({ name: path.basename(f, '.json'), file: f });
  }

  const results: BenchmarkResult[] = [];

  if (!jsonOutput) {
    console.log('Format Contract Engine Benchmark\n');
    console.log('Searching for benchmark schemas...\n');
  }

  for (const target of targets) {
    if (!jsonOutput) {
      process.stdout.write(`  ${target.name}... `);
    }
    const result = benchmarkSchema(target.name, target.file);
    if (result) {
      results.push(result);
      if (!jsonOutput) {
        console.log(`${result.formatCount} formats, ${result.totalTimeMs}ms`);
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ benchmarks: results }, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log('\nNo benchmark schemas found.');
    console.log('Place JSON Schema files in benchmarks/ or pass file paths as arguments.');
    console.log('Example: npx tsx scripts/benchmark.ts my-schema.json');
    return;
  }

  console.log('\n--- Results ---\n');
  for (const r of results) {
    console.log(`${r.name} (${(r.sizeBytes / 1024).toFixed(1)} KB)`);
    console.log(`  Nodes:            ${r.nodeCount}`);
    console.log(`  Format uses:      ${r.formatCount}`);
    console.log(`  Unique formats:   ${r.uniqueFormats.join(', ') || 'none'}`);
    console.log(`  High-risk:        ${r.highRiskCount}`);
    console.log(`  Grammar branches: ${r.grammarBranches}`);
    console.log(`  Parse time:       ${r.parseTimeMs}ms`);
    console.log(`  Analyze time:     ${r.analyzeTimeMs}ms`);
    console.log(`  Total:            ${r.totalTimeMs}ms`);
    console.log();
  }
}

main();

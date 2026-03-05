import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPointerIndex, normalizeSchema } from '../../src/parser';
import { buildRefGraph, detectCycles } from '../../src/graph';
import type { StructuralModel } from '../../src/types';

export function loadSchema(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${resolved}`);
  }
}

export function buildModel(schema: unknown): StructuralModel {
  const nodes = buildPointerIndex(schema);
  const normalized = normalizeSchema(nodes);
  const withRefs = buildRefGraph(normalized);
  return detectCycles(withRefs);
}

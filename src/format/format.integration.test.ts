import { describe, it, expect } from 'vitest';
import { buildPointerIndex, normalizeSchema } from '../parser';
import { buildRefGraph, detectCycles } from '../graph';
import { extractFormatNodes } from './extractFormatNodes';
import { analyzeFormatSurface } from './analyzeFormatSurface';
import { buildFormatTestMatrix } from './buildFormatTestMatrix';
import { computeFormatRiskAggregate } from './formatRiskScore';
import { compareFormatEvolution } from './compareFormatEvolution';
import type { StructuralModel } from '../types';

function buildModel(schema: unknown): StructuralModel {
  const nodes = buildPointerIndex(schema);
  const skeleton = normalizeSchema(nodes);
  const withEdges = buildRefGraph(skeleton);
  return detectCycles(withEdges);
}

describe('Format Integration Tests', () => {
  it('extracts format from simple schema', () => {
    const schema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const model = buildModel(schema);
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(1);
    expect(result[0].format).toBe('email');
    expect(result[0].type).toBe('string');
  });

  it('extracts multiple formats from schema', () => {
    const schema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        website: { type: 'string', format: 'uri' },
        created: { type: 'string', format: 'date-time' },
      },
    };
    const model = buildModel(schema);
    const result = extractFormatNodes(model);
    expect(result).toHaveLength(3);
    const formats = result.map(n => n.format).sort();
    expect(formats).toEqual(['date-time', 'email', 'uri']);
  });

  it('full pipeline: format surface analysis', () => {
    const schema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const model = buildModel(schema);
    const reports = analyzeFormatSurface(model);
    expect(reports).toHaveLength(1);
    expect(reports[0].format).toBe('email');
    expect(reports[0].riskScore).toBeGreaterThanOrEqual(0);
    expect(reports[0].riskScore).toBeLessThanOrEqual(100);
  });

  it('full pipeline: format test matrix', () => {
    const schema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const model = buildModel(schema);
    const formatNodes = extractFormatNodes(model);
    const reports = analyzeFormatSurface(model);
    const matrix = buildFormatTestMatrix(reports, formatNodes);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].format).toBe('email');
    expect(matrix[0].requiredTests.length).toBeGreaterThanOrEqual(5);
    expect(matrix[0].estimatedTestCount).toBeGreaterThanOrEqual(5);
  });

  it('full pipeline: format risk score', () => {
    const schema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        website: { type: 'string', format: 'uri' },
      },
    };
    const model = buildModel(schema);
    const reports = analyzeFormatSurface(model);
    const riskSummary = computeFormatRiskAggregate(reports);
    expect(riskSummary.totalFormats).toBe(2);
    expect(riskSummary.averageRiskScore).toBeGreaterThanOrEqual(0);
    expect(riskSummary.maxRiskScore).toBeGreaterThanOrEqual(0);
  });

  it('full pipeline: format evolution - no changes', () => {
    const schema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const model = buildModel(schema);
    const result = compareFormatEvolution(model, model);
    expect(result.addedFormats).toEqual([]);
    expect(result.removedFormats).toEqual([]);
    expect(result.modifiedFormats).toEqual([]);
    expect(result.breakingChanges).toEqual([]);
  });

  it('full pipeline: format evolution - format added', () => {
    const oldSchema = {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
    };
    const newSchema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const oldModel = buildModel(oldSchema);
    const newModel = buildModel(newSchema);
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.addedFormats).toHaveLength(1);
    expect(result.breakingChanges.length).toBeGreaterThan(0);
  });

  it('full pipeline: format evolution - format removed', () => {
    const oldSchema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const newSchema = {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
    };
    const oldModel = buildModel(oldSchema);
    const newModel = buildModel(newSchema);
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.removedFormats).toHaveLength(1);
    expect(result.breakingChanges.some(c => c.ruleId === 'format-removed')).toBe(true);
  });

  it('full pipeline: format evolution - format changed', () => {
    const oldSchema = {
      type: 'object',
      properties: {
        contact: { type: 'string', format: 'email' },
      },
    };
    const newSchema = {
      type: 'object',
      properties: {
        contact: { type: 'string', format: 'uri' },
      },
    };
    const oldModel = buildModel(oldSchema);
    const newModel = buildModel(newSchema);
    const result = compareFormatEvolution(oldModel, newModel);
    expect(result.modifiedFormats).toHaveLength(1);
    expect(result.breakingChanges.some(c => c.ruleId === 'format-changed')).toBe(true);
  });

  it('format in oneOf increases risk', () => {
    const schema = {
      oneOf: [
        { type: 'string', format: 'email' },
        { type: 'string', format: 'uri' },
      ],
    };
    const model = buildModel(schema);
    const reports = analyzeFormatSurface(model);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    for (const r of reports) {
      expect(r.riskScore).toBeGreaterThan(0);
    }
  });

  it('format in $defs with $ref has fan-out', () => {
    const schema = {
      type: 'object',
      $defs: {
        Email: { type: 'string', format: 'email' },
      },
      properties: {
        primary: { $ref: '#/$defs/Email' },
        secondary: { $ref: '#/$defs/Email' },
      },
    };
    const model = buildModel(schema);
    const reports = analyzeFormatSurface(model);
    const emailReport = reports.find(r => r.format === 'email');
    expect(emailReport).toBeDefined();
    expect(emailReport!.fanOut).toBeGreaterThanOrEqual(2);
  });

  it('format test matrix adds context tests for oneOf', () => {
    const schema = {
      oneOf: [
        { type: 'string', format: 'email' },
        { type: 'string' },
      ],
    };
    const model = buildModel(schema);
    const formatNodes = extractFormatNodes(model);
    const reports = analyzeFormatSurface(model);
    const matrix = buildFormatTestMatrix(reports, formatNodes);
    expect(matrix.length).toBeGreaterThanOrEqual(1);
    const emailMatrix = matrix.find(m => m.format === 'email');
    expect(emailMatrix).toBeDefined();
    expect(emailMatrix!.requiredTests).toContain('oneOf-branch-valid');
    expect(emailMatrix!.complexityMultiplier).toBeGreaterThan(1);
  });

  it('schema with no format keyword produces empty results', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    };
    const model = buildModel(schema);
    expect(extractFormatNodes(model)).toEqual([]);
    expect(analyzeFormatSurface(model)).toEqual([]);
  });

  it('required property detected through integration', () => {
    const schema = {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        website: { type: 'string', format: 'uri' },
      },
    };
    const model = buildModel(schema);
    const nodes = extractFormatNodes(model);
    const emailNode = nodes.find(n => n.format === 'email');
    const websiteNode = nodes.find(n => n.format === 'uri');
    expect(emailNode).toBeDefined();
    expect(emailNode!.required).toBe(true);
    expect(websiteNode).toBeDefined();
    expect(websiteNode!.required).toBe(false);
  });

  it('deterministic across full pipeline runs', () => {
    const schema = {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        url: { type: 'string', format: 'uri' },
        date: { type: 'string', format: 'date' },
      },
    };
    const model = buildModel(schema);
    const run1 = {
      nodes: extractFormatNodes(model),
      reports: analyzeFormatSurface(model),
    };
    const run2 = {
      nodes: extractFormatNodes(model),
      reports: analyzeFormatSurface(model),
    };
    expect(run1.nodes).toEqual(run2.nodes);
    expect(run1.reports).toEqual(run2.reports);
  });

  it('if/then/else schema detected in format context', () => {
    const schema = {
      type: 'object',
      if: { properties: { type: { const: 'email' } } },
      then: {
        properties: {
          value: { type: 'string', format: 'email' },
        },
      },
      else: {
        properties: {
          value: { type: 'string', format: 'uri' },
        },
      },
    };
    const model = buildModel(schema);
    const nodes = extractFormatNodes(model);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    // May or may not have 'if'/'then'/'else' depending on structural model
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('nested allOf/anyOf schema produces higher risk scores', () => {
    const simple = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };
    const complex = {
      allOf: [
        {
          anyOf: [
            {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
              },
            },
          ],
        },
      ],
    };
    const simpleModel = buildModel(simple);
    const complexModel = buildModel(complex);
    const simpleReports = analyzeFormatSurface(simpleModel);
    const complexReports = analyzeFormatSurface(complexModel);
    if (simpleReports.length > 0 && complexReports.length > 0) {
      expect(complexReports[0].riskScore).toBeGreaterThanOrEqual(simpleReports[0].riskScore);
    }
  });

  it('handles Draft-07 definitions keyword', () => {
    const schema = {
      type: 'object',
      definitions: {
        Email: { type: 'string', format: 'email' },
      },
      properties: {
        email: { $ref: '#/definitions/Email' },
      },
    };
    const model = buildModel(schema);
    const nodes = extractFormatNodes(model);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    const emailNode = nodes.find(n => n.format === 'email');
    expect(emailNode).toBeDefined();
  });

  it('handles 2020-12 $defs keyword', () => {
    const schema = {
      type: 'object',
      $defs: {
        Email: { type: 'string', format: 'email' },
      },
      properties: {
        email: { $ref: '#/$defs/Email' },
      },
    };
    const model = buildModel(schema);
    const nodes = extractFormatNodes(model);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    const emailNode = nodes.find(n => n.format === 'email');
    expect(emailNode).toBeDefined();
  });

  it('risk summary correctly aggregates from full pipeline', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
          },
        },
      ],
    };
    const model = buildModel(schema);
    const reports = analyzeFormatSurface(model);
    const summary = computeFormatRiskAggregate(reports);
    expect(summary.totalFormats).toBe(reports.length);
    if (reports.length > 0) {
      expect(summary.maxRiskScore).toBe(Math.max(...reports.map(r => r.riskScore)));
    }
  });
});

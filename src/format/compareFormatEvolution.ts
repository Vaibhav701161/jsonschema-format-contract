import type { StructuralModel } from '../types';
import type { DiffChange } from './types';
import type { FormatEvolutionResult, FormatChange, FormatNode } from './types';
import { extractFormatNodes } from './extractFormatNodes';
import { analyzeFormatSurface } from './analyzeFormatSurface';

/**
 * Compare format evolution between old and new schema versions.
 */
export function compareFormatEvolution(
  oldModel: StructuralModel,
  newModel: StructuralModel,
): FormatEvolutionResult {
  const oldFormats = extractFormatNodes(oldModel);
  const newFormats = extractFormatNodes(newModel);

  // Build lookup maps by pointer
  const oldMap: Record<string, FormatNode> = Object.create(null);
  for (let i = 0; i < oldFormats.length; i++) {
    oldMap[oldFormats[i].pointer] = oldFormats[i];
  }

  const newMap: Record<string, FormatNode> = Object.create(null);
  for (let i = 0; i < newFormats.length; i++) {
    newMap[newFormats[i].pointer] = newFormats[i];
  }

  // Classify changes
  const addedFormats: FormatNode[] = [];
  const removedFormats: FormatNode[] = [];
  const modifiedFormats: FormatChange[] = [];

  // Find added and modified
  const newPointers = Object.keys(newMap);
  for (let i = 0; i < newPointers.length; i++) {
    const pointer = newPointers[i];
    const newNode = newMap[pointer];
    const oldNode = oldMap[pointer];

    if (oldNode === undefined) {
      addedFormats.push(newNode);
    } else if (oldNode.format !== newNode.format) {
      modifiedFormats.push({
        pointer,
        oldFormat: oldNode.format,
        newFormat: newNode.format,
      });
    }
  }

  // Find removed
  const oldPointers = Object.keys(oldMap);
  for (let i = 0; i < oldPointers.length; i++) {
    const pointer = oldPointers[i];
    if (newMap[pointer] === undefined) {
      removedFormats.push(oldMap[pointer]);
    }
  }

  // Sort all arrays for deterministic output
  addedFormats.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
  removedFormats.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
  modifiedFormats.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);

  // Classify breaking and risk changes
  const breakingChanges: DiffChange[] = [];
  const riskChanges: DiffChange[] = [];

  classifyBreakingFormatChanges(
    oldModel,
    newModel,
    oldMap,
    newMap,
    removedFormats,
    addedFormats,
    modifiedFormats,
    breakingChanges,
  );

  classifyRiskFormatChanges(
    oldModel,
    newModel,
    oldMap,
    newMap,
    riskChanges,
  );

  return {
    addedFormats,
    removedFormats,
    modifiedFormats,
    breakingChanges,
    riskChanges,
  };
}

function classifyBreakingFormatChanges(
  oldModel: StructuralModel,
  newModel: StructuralModel,
  oldMap: Record<string, FormatNode>,
  newMap: Record<string, FormatNode>,
  removedFormats: FormatNode[],
  addedFormats: FormatNode[],
  modifiedFormats: FormatChange[],
  changes: DiffChange[],
): void {
  // 1. Format removed from existing pointer = breaking (relaxed constraint
  //    that consumers may depend on)
  for (let i = 0; i < removedFormats.length; i++) {
    const fn = removedFormats[i];
    // Only breaking if the node still exists (format removed, node remains)
    if (newModel.nodes[fn.pointer] !== undefined) {
      changes.push({
        category: 'breaking',
        ruleId: 'format-removed' as DiffChange['ruleId'],
        pointer: fn.pointer,
        message: `Format "${fn.format}" was removed from existing node`,
        oldValue: fn.format,
        newValue: undefined,
      });
    }
  }

  // 2. Format added to existing pointer = breaking (tightening constraint)
  for (let i = 0; i < addedFormats.length; i++) {
    const fn = addedFormats[i];
    // Only breaking if the node existed before (format added to existing node)
    if (oldModel.nodes[fn.pointer] !== undefined) {
      changes.push({
        category: 'breaking',
        ruleId: 'format-added' as DiffChange['ruleId'],
        pointer: fn.pointer,
        message: `Format "${fn.format}" was added to existing node (tightening constraint)`,
        oldValue: undefined,
        newValue: fn.format,
      });
    }
  }

  // 3. Format changed = breaking
  for (let i = 0; i < modifiedFormats.length; i++) {
    const fc = modifiedFormats[i];
    changes.push({
      category: 'breaking',
      ruleId: 'format-changed' as DiffChange['ruleId'],
      pointer: fc.pointer,
      message: `Format changed from "${fc.oldFormat}" to "${fc.newFormat}"`,
      oldValue: fc.oldFormat,
      newValue: fc.newFormat,
    });
  }

  // 4. Type narrowed but format preserved
  const newPointers = Object.keys(newMap);
  for (let i = 0; i < newPointers.length; i++) {
    const pointer = newPointers[i];
    const oldNode = oldMap[pointer];
    const newNode = newMap[pointer];
    if (oldNode === undefined || newNode === undefined) continue;
    if (oldNode.format !== newNode.format) continue; // already handled

    const oldTypes = normalizeType(oldNode.type);
    const newTypes = normalizeType(newNode.type);

    if (oldTypes.length > 0 && newTypes.length > 0 && newTypes.length < oldTypes.length) {
      const allNewInOld = newTypes.every(t => oldTypes.includes(t));
      if (allNewInOld) {
        changes.push({
          category: 'breaking',
          ruleId: 'format-type-narrowed' as DiffChange['ruleId'],
          pointer,
          message: `Type narrowed from [${oldTypes.join(', ')}] to [${newTypes.join(', ')}] while format "${newNode.format}" preserved`,
          oldValue: oldTypes.join(','),
          newValue: newTypes.join(','),
        });
      }
    }
  }

  // 5. Format moved under new combinator context
  for (let i = 0; i < newPointers.length; i++) {
    const pointer = newPointers[i];
    const oldNode = oldMap[pointer];
    const newNode = newMap[pointer];
    if (oldNode === undefined || newNode === undefined) continue;
    if (oldNode.format !== newNode.format) continue;

    const oldCtx = oldNode.combinatorContext.join(',');
    const newCtx = newNode.combinatorContext.join(',');

    if (oldCtx !== newCtx && newNode.combinatorContext.length > oldNode.combinatorContext.length) {
      changes.push({
        category: 'breaking',
        ruleId: 'format-combinator-context-changed' as DiffChange['ruleId'],
        pointer,
        message: `Format "${newNode.format}" moved under new combinator context: [${newNode.combinatorContext.join(', ')}]`,
      });
    }
  }
}

function classifyRiskFormatChanges(
  oldModel: StructuralModel,
  newModel: StructuralModel,
  oldMap: Record<string, FormatNode>,
  newMap: Record<string, FormatNode>,
  changes: DiffChange[],
): void {
  const oldReports = analyzeFormatSurface(oldModel);
  const newReports = analyzeFormatSurface(newModel);

  // Build report maps
  const oldReportMap: Record<string, typeof oldReports[0]> = Object.create(null);
  for (let i = 0; i < oldReports.length; i++) {
    oldReportMap[oldReports[i].pointer] = oldReports[i];
  }

  const newReportMap: Record<string, typeof newReports[0]> = Object.create(null);
  for (let i = 0; i < newReports.length; i++) {
    newReportMap[newReports[i].pointer] = newReports[i];
  }

  // Compare overlapping pointers
  const newPointers = Object.keys(newMap);
  for (let i = 0; i < newPointers.length; i++) {
    const pointer = newPointers[i];
    if (oldMap[pointer] === undefined) continue;

    const oldReport = oldReportMap[pointer];
    const newReport = newReportMap[pointer];
    if (oldReport === undefined || newReport === undefined) continue;

    // Combinator depth increased
    if (newReport.combinatorDepth > oldReport.combinatorDepth) {
      changes.push({
        category: 'risk',
        ruleId: 'format-combinator-depth-increased' as DiffChange['ruleId'],
        pointer,
        message: `Combinator depth increased from ${oldReport.combinatorDepth} to ${newReport.combinatorDepth} for format "${newMap[pointer].format}"`,
        oldValue: String(oldReport.combinatorDepth),
        newValue: String(newReport.combinatorDepth),
      });
    }

    // Ref depth increased
    if (newReport.refDepth > oldReport.refDepth) {
      changes.push({
        category: 'risk',
        ruleId: 'format-ref-depth-increased' as DiffChange['ruleId'],
        pointer,
        message: `Ref depth increased from ${oldReport.refDepth} to ${newReport.refDepth} for format "${newMap[pointer].format}"`,
        oldValue: String(oldReport.refDepth),
        newValue: String(newReport.refDepth),
      });
    }

    // Fan-out increased
    if (newReport.fanOut > oldReport.fanOut) {
      changes.push({
        category: 'risk',
        ruleId: 'format-fan-out-increased' as DiffChange['ruleId'],
        pointer,
        message: `Fan-out increased from ${oldReport.fanOut} to ${newReport.fanOut} for format "${newMap[pointer].format}"`,
        oldValue: String(oldReport.fanOut),
        newValue: String(newReport.fanOut),
      });
    }
  }
}

function normalizeType(t: string | string[] | undefined): string[] {
  if (t === undefined) return [];
  if (typeof t === 'string') return [t];
  return t.slice().sort();
}

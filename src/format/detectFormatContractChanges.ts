import type { StructuralModel } from '../types';
import type { FormatContractDiff, FormatContractChange } from './contractTypes';
import { analyzeFormatConstraints } from './analyzeFormatConstraints';

/**
 * Detect format contract changes between two schema versions.
 * Returns breaking changes, risk changes, and format add/remove/modify lists.
 */
export function detectFormatContractChanges(
  oldModel: StructuralModel,
  newModel: StructuralModel,
): FormatContractDiff {
  const oldConstraints = analyzeFormatConstraints(oldModel);
  const newConstraints = analyzeFormatConstraints(newModel);

  // Index by pointer
  const oldByPointer = new Map(oldConstraints.map(c => [c.pointer, c]));
  const newByPointer = new Map(newConstraints.map(c => [c.pointer, c]));

  const addedFormats: Array<{ pointer: string; format: string }> = [];
  const removedFormats: Array<{ pointer: string; format: string }> = [];
  const modifiedFormats: Array<{ pointer: string; oldFormat: string; newFormat: string }> = [];
  const breakingChanges: FormatContractChange[] = [];
  const riskChanges: FormatContractChange[] = [];

  // Find removed and modified formats
  for (const [ptr, oldC] of oldByPointer) {
    const newC = newByPointer.get(ptr);
    if (!newC) {
      // Format removed at this pointer - check if node still exists
      if (newModel.nodes[ptr]) {
        removedFormats.push({ pointer: ptr, format: oldC.format });
        breakingChanges.push({
          category: 'breaking',
          ruleId: 'format-removed',
          pointer: ptr,
          message: `Format "${oldC.format}" removed from existing node`,
          oldValue: oldC.format,
        });
      } else {
        removedFormats.push({ pointer: ptr, format: oldC.format });
      }
    } else if (oldC.format !== newC.format) {
      modifiedFormats.push({ pointer: ptr, oldFormat: oldC.format, newFormat: newC.format });
      breakingChanges.push({
        category: 'breaking',
        ruleId: 'format-changed',
        pointer: ptr,
        message: `Format changed from "${oldC.format}" to "${newC.format}"`,
        oldValue: oldC.format,
        newValue: newC.format,
      });
    } else {
      // Same format - check for constraint tightening/loosening
      detectConstraintChanges(oldC, newC, breakingChanges, riskChanges);
    }
  }

  // Find added formats
  for (const [ptr, newC] of newByPointer) {
    if (!oldByPointer.has(ptr)) {
      addedFormats.push({ pointer: ptr, format: newC.format });
      // Adding format to existing node is a tightening
      if (oldModel.nodes[ptr]) {
        breakingChanges.push({
          category: 'breaking',
          ruleId: 'format-added',
          pointer: ptr,
          message: `Format "${newC.format}" added to existing node (tightens contract)`,
          newValue: newC.format,
        });
      }
    }
  }

  // Sort all arrays for determinism
  addedFormats.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
  removedFormats.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
  modifiedFormats.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
  breakingChanges.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
  riskChanges.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);

  return {
    addedFormats,
    removedFormats,
    modifiedFormats,
    breakingChanges,
    riskChanges,
  };
}

function detectConstraintChanges(
  oldC: { pointer: string; format: string; hasMinLength: boolean; hasMaxLength: boolean; hasPattern: boolean; combinatorDepth: number; refChainDepth: number; underUnionType: boolean },
  newC: { pointer: string; format: string; hasMinLength: boolean; hasMaxLength: boolean; hasPattern: boolean; combinatorDepth: number; refChainDepth: number; underUnionType: boolean },
  breaking: FormatContractChange[],
  risk: FormatContractChange[],
): void {
  // Constraint tightening - adding minLength/maxLength/pattern is breaking
  if (!oldC.hasMinLength && newC.hasMinLength) {
    breaking.push({
      category: 'breaking',
      ruleId: 'constraint-tightened',
      pointer: newC.pointer,
      message: `minLength constraint added alongside format "${newC.format}" (tightens contract)`,
      oldValue: 'absent',
      newValue: 'present',
    });
  }
  if (!oldC.hasMaxLength && newC.hasMaxLength) {
    breaking.push({
      category: 'breaking',
      ruleId: 'constraint-tightened',
      pointer: newC.pointer,
      message: `maxLength constraint added alongside format "${newC.format}" (tightens contract)`,
      oldValue: 'absent',
      newValue: 'present',
    });
  }
  if (!oldC.hasPattern && newC.hasPattern) {
    breaking.push({
      category: 'breaking',
      ruleId: 'constraint-tightened',
      pointer: newC.pointer,
      message: `pattern constraint added alongside format "${newC.format}" (tightens contract)`,
      oldValue: 'absent',
      newValue: 'present',
    });
  }

  // Constraint loosening - removing constraints is a risk
  if (oldC.hasMinLength && !newC.hasMinLength) {
    risk.push({
      category: 'risk',
      ruleId: 'constraint-loosened',
      pointer: newC.pointer,
      message: `minLength constraint removed from format "${newC.format}" (loosens contract)`,
      oldValue: 'present',
      newValue: 'absent',
    });
  }
  if (oldC.hasMaxLength && !newC.hasMaxLength) {
    risk.push({
      category: 'risk',
      ruleId: 'constraint-loosened',
      pointer: newC.pointer,
      message: `maxLength constraint removed from format "${newC.format}" (loosens contract)`,
      oldValue: 'present',
      newValue: 'absent',
    });
  }
  if (oldC.hasPattern && !newC.hasPattern) {
    risk.push({
      category: 'risk',
      ruleId: 'constraint-loosened',
      pointer: newC.pointer,
      message: `pattern constraint removed from format "${newC.format}" (loosens contract)`,
      oldValue: 'present',
      newValue: 'absent',
    });
  }

  // Combinator context changes
  if (newC.combinatorDepth > oldC.combinatorDepth) {
    risk.push({
      category: 'risk',
      ruleId: 'combinator-context-changed',
      pointer: newC.pointer,
      message: `Combinator nesting depth increased from ${oldC.combinatorDepth} to ${newC.combinatorDepth} for format "${newC.format}"`,
      oldValue: String(oldC.combinatorDepth),
      newValue: String(newC.combinatorDepth),
    });
  }

  // Type narrowing
  if (oldC.underUnionType && !newC.underUnionType) {
    risk.push({
      category: 'risk',
      ruleId: 'format-type-narrowed',
      pointer: newC.pointer,
      message: `Union type collapsed for format "${newC.format}" (type narrowed)`,
    });
  }
}

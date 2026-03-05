import type {
  FormatInteractionProfile,
  ExistingTestMetadata,
  CoverageGapReport,
} from './types';
import { INTERACTION_TYPES } from './types';

/**
 * Detect coverage gaps by comparing interaction profiles against
 * existing test metadata.
 */
export function detectCoverageGaps(
  interactionProfiles: FormatInteractionProfile[],
  existingTestMetadata: ExistingTestMetadata,
): CoverageGapReport {
  const coveredInteractionSet = new Set(existingTestMetadata.coveredInteractions);
  const coveredFormatSet = new Set(existingTestMetadata.coveredFormats);

  // 1. Find missing interaction types
  const allDiscoveredInteractions = collectUniqueInteractionTypes(interactionProfiles);
  const missingInteractionTypes: string[] = [];
  for (let i = 0; i < allDiscoveredInteractions.length; i++) {
    if (!coveredInteractionSet.has(allDiscoveredInteractions[i])) {
      missingInteractionTypes.push(allDiscoveredInteractions[i]);
    }
  }

  // 2. Find missing format × context combos
  const missingFormatContexts = findMissingFormatContexts(
    interactionProfiles,
    coveredInteractionSet,
    coveredFormatSet,
  );

  // 3. Find missing stress scenarios
  const missingStressScenarios = findMissingStressScenarios(
    interactionProfiles,
    coveredInteractionSet,
    coveredFormatSet,
  );

  // Compute coverage stats
  const totalInteractions = countTotalInteractions(interactionProfiles);
  const coveredCount = totalInteractions - missingInteractionTypes.length -
    missingFormatContexts.length - missingStressScenarios.length;
  const adjustedCovered = Math.max(0, coveredCount);
  const coveragePercentage = totalInteractions > 0
    ? Math.round((adjustedCovered / totalInteractions) * 10000) / 100
    : 100;

  return {
    missingInteractionTypes: missingInteractionTypes.sort(),
    missingFormatContexts: missingFormatContexts.sort(),
    missingStressScenarios: missingStressScenarios.sort(),
    totalInteractions,
    coveredCount: adjustedCovered,
    coveragePercentage: Math.min(100, Math.max(0, coveragePercentage)),
  };
}

/**
 * Collect unique interaction types across all profiles. Sorted.
 */
function collectUniqueInteractionTypes(profiles: FormatInteractionProfile[]): string[] {
  const set = new Set<string>();
  for (let i = 0; i < profiles.length; i++) {
    const types = profiles[i].interactionTypes;
    for (let j = 0; j < types.length; j++) {
      set.add(types[j]);
    }
  }
  const result = Array.from(set);
  result.sort();
  return result;
}

/**
 * Find format × context combinations not covered.
 * A combo is "format:interactionType", e.g. "email:recursive-ref".
 */
function findMissingFormatContexts(
  profiles: FormatInteractionProfile[],
  coveredInteractionSet: Set<string>,
  coveredFormatSet: Set<string>,
): string[] {
  const discovered = new Set<string>();
  const missing: string[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const types = p.interactionTypes;
    for (let j = 0; j < types.length; j++) {
      const combo = `${p.format}:${types[j]}`;
      if (discovered.has(combo)) continue;
      discovered.add(combo);

      // Missing if either the format or the interaction isn't covered
      if (!coveredFormatSet.has(p.format) || !coveredInteractionSet.has(types[j])) {
        missing.push(combo);
      }
    }
  }

  return missing;
}

/**
 * Find missing stress scenarios based on profile flags.
 * Scenarios are named patterns, e.g. "recursive-format-email".
 */
function findMissingStressScenarios(
  profiles: FormatInteractionProfile[],
  coveredInteractionSet: Set<string>,
  coveredFormatSet: Set<string>,
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];

    // Recursive tests needed but not covered
    if (p.requiresRecursionTests && !coveredInteractionSet.has(INTERACTION_TYPES.RECURSIVE_REF)) {
      const key = `recursive-format-${p.format}`;
      if (!seen.has(key)) { seen.add(key); missing.push(key); }
    }

    // Conditional tests needed but not covered
    if (p.requiresConditionalTests && !coveredInteractionSet.has(INTERACTION_TYPES.CONDITIONAL_GATING)) {
      const key = `conditional-format-${p.format}`;
      if (!seen.has(key)) { seen.add(key); missing.push(key); }
    }

    // Dynamic scope tests needed but not covered by format
    if (p.requiresDynamicScopeTests && !coveredFormatSet.has(p.format)) {
      const key = `dynamic-scope-${p.format}`;
      if (!seen.has(key)) { seen.add(key); missing.push(key); }
    }

    // Combinator branch tests for uncovered format
    if (p.requiredBranches > 0 && !coveredFormatSet.has(p.format)) {
      const key = `combinator-stress-${p.format}`;
      if (!seen.has(key)) { seen.add(key); missing.push(key); }
    }
  }

  return missing;
}

/**
 * Count total distinct interactions across all profiles.
 */
function countTotalInteractions(profiles: FormatInteractionProfile[]): number {
  const all = new Set<string>();
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const types = p.interactionTypes;
    for (let j = 0; j < types.length; j++) {
      // Unique by format:interaction
      all.add(`${p.format}:${types[j]}`);
    }
  }
  return all.size;
}

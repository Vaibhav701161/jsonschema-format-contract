export { analyzeFormatConstraints, computeFormatRisks, buildFormatContractSummaries } from './analyzeFormatConstraints';
export { detectFormatContractChanges } from './detectFormatContractChanges';
export { generateFormatStressCases, detectFormatCoverageGapsUnified } from './generateFormatStressCases';
export { scoreFormatRisk, scoreAllFormatRisks, DEFAULT_CONTRACT_RISK_WEIGHTS, RISK_THRESHOLDS } from './computeFormatRiskScore';
export type {
  FormatConstraint,
  FormatRisk,
  FormatContractSummary,
  FormatContractChange,
  FormatContractDiff,
  FormatStressCase,
  FormatCoverageReport as UnifiedFormatCoverageReport,
  FormatReproducer,
  ExistingTestCoverage,
} from './contractTypes';

export { extractFormatNodes } from './extractFormatNodes';
export { analyzeFormatSurface } from './analyzeFormatSurface';
export { buildFormatTestMatrix } from './buildFormatTestMatrix';
export { compareFormatEvolution } from './compareFormatEvolution';
export { computeFormatRiskAggregate } from './formatRiskScore';
export type {
  FormatNode,
  FormatSurfaceReport,
  FormatRiskWeights,
  FormatTestMatrix,
  FormatChange,
  FormatEvolutionResult,
  FormatRiskSummary,
} from './types';
export { DEFAULT_FORMAT_RISK_WEIGHTS, DEFAULT_HIGH_RISK_THRESHOLD } from './types';

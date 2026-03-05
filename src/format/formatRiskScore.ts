import type { FormatSurfaceReport } from './types';
import type { FormatRiskSummary } from './types';
import { DEFAULT_HIGH_RISK_THRESHOLD } from './types';

/**
 * Compute aggregate risk summary from format surface reports.
 */
export function computeFormatRiskAggregate(
  reports: FormatSurfaceReport[],
  highRiskThreshold: number = DEFAULT_HIGH_RISK_THRESHOLD,
): FormatRiskSummary {
  if (reports.length === 0) {
    return {
      totalFormats: 0,
      highRiskFormats: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
    };
  }

  let totalScore = 0;
  let maxScore = 0;
  let highRiskCount = 0;

  for (let i = 0; i < reports.length; i++) {
    const score = reports[i].riskScore;
    totalScore += score;
    if (score > maxScore) maxScore = score;
    if (score > highRiskThreshold) highRiskCount++;
  }

  return {
    totalFormats: reports.length,
    highRiskFormats: highRiskCount,
    averageRiskScore: Math.round((totalScore / reports.length) * 100) / 100,
    maxRiskScore: maxScore,
  };
}

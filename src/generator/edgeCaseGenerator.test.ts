import { describe, it, expect } from 'vitest';
import { generateEdgeCases } from './edgeCaseGenerator';

describe('generateEdgeCases', () => {
  it('should generate edge cases for known format', () => {
    const result = generateEdgeCases('email');
    expect(result.format).toBe('email');
    expect(result.cases.length).toBeGreaterThan(0);
  });

  it('should include registry cases', () => {
    const result = generateEdgeCases('email');
    const registryCases = result.cases.filter((c) => c.description.startsWith('[registry]'));
    expect(registryCases.length).toBeGreaterThan(0);
  });

  it('should track covered and uncovered branches', () => {
    const result = generateEdgeCases('uri');
    // Should have some tracking
    expect(result.coveredBranches).toBeDefined();
    expect(result.uncoveredBranches).toBeDefined();
    expect(Array.isArray(result.coveredBranches)).toBe(true);
    expect(Array.isArray(result.uncoveredBranches)).toBe(true);
  });

  it('should return sorted branch lists', () => {
    const result = generateEdgeCases('date-time');
    expect(result.coveredBranches).toEqual([...result.coveredBranches].sort());
    expect(result.uncoveredBranches).toEqual([...result.uncoveredBranches].sort());
  });

  it('should handle unknown format', () => {
    const result = generateEdgeCases('nonexistent');
    expect(result.format).toBe('nonexistent');
    expect(result.cases).toEqual([]);
    expect(result.coveredBranches).toEqual([]);
  });
});

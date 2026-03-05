import { describe, it, expect } from 'vitest';
import {
  getAllAdapters,
  getAdapter,
  getAdapterNames,
  ajvAdapter,
  pythonJsonschemaAdapter,
  rustJsonschemaAdapter,
} from './implementationAdapters';

describe('getAllAdapters', () => {
  it('should return all adapters', () => {
    const adapters = getAllAdapters();
    expect(adapters.length).toBe(3);
  });

  it('should include ajv', () => {
    const adapters = getAllAdapters();
    expect(adapters.some((a) => a.name === 'ajv')).toBe(true);
  });

  it('should include python-jsonschema', () => {
    const adapters = getAllAdapters();
    expect(adapters.some((a) => a.name === 'python-jsonschema')).toBe(true);
  });
});

describe('getAdapter', () => {
  it('should return adapter by name', () => {
    const adapter = getAdapter('ajv');
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe('ajv');
  });

  it('should return undefined for unknown adapter', () => {
    expect(getAdapter('nonexistent')).toBeUndefined();
  });
});

describe('getAdapterNames', () => {
  it('should return adapter names', () => {
    const names = getAdapterNames();
    expect(names).toContain('ajv');
    expect(names).toContain('python-jsonschema');
    expect(names).toContain('rust-jsonschema');
  });
});

describe('adapter parseResult', () => {
  it('ajv - valid output', () => {
    const result = ajvAdapter.parseResult('valid');
    expect(result.valid).toBe(true);
  });

  it('ajv - invalid output', () => {
    const result = ajvAdapter.parseResult('invalid: something went wrong');
    expect(result.valid).toBe(false);
  });

  it('python - empty stdout means valid', () => {
    const result = pythonJsonschemaAdapter.parseResult('');
    expect(result.valid).toBe(true);
  });

  it('python - non-empty stdout means invalid', () => {
    const result = pythonJsonschemaAdapter.parseResult('Error: format failed');
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('rust - valid output', () => {
    const result = rustJsonschemaAdapter.parseResult('valid');
    expect(result.valid).toBe(true);
  });

  it('rust - invalid output', () => {
    const result = rustJsonschemaAdapter.parseResult('invalid');
    expect(result.valid).toBe(false);
  });
});

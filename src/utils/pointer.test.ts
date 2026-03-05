import { describe, it, expect } from 'vitest';
import {
  encodePointer,
  decodePointer,
  resolvePointer,
  isInternalRef,
} from './pointer';

describe('encodePointer', () => {
  it('returns "#" for an empty token array', () => {
    expect(encodePointer([])).toBe('#');
  });

  it('encodes simple tokens', () => {
    expect(encodePointer(['a', 'b'])).toBe('#/a/b');
  });

  it('escapes ~ before / (RFC 6901 order)', () => {
    expect(encodePointer(['a/b', 'c~d'])).toBe('#/a~1b/c~0d');
  });
});

describe('decodePointer', () => {
  it('returns [] for "#"', () => {
    expect(decodePointer('#')).toEqual([]);
  });

  it('decodes simple pointer', () => {
    expect(decodePointer('#/a/b')).toEqual(['a', 'b']);
  });

  it('unescapes ~1 then ~0 (RFC 6901 order)', () => {
    expect(decodePointer('#/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
  });
});

describe('resolvePointer', () => {
  it('resolves a nested value', () => {
    expect(resolvePointer({ a: { b: 1 } }, '#/a/b')).toBe(1);
  });

  it('returns undefined for a missing key', () => {
    expect(resolvePointer({ a: 1 }, '#/a/missing')).toBeUndefined();
  });

  it('resolves root with "#"', () => {
    const obj = { x: 1 };
    expect(resolvePointer(obj, '#')).toBe(obj);
  });

  it('resolves array indices', () => {
    expect(resolvePointer({ a: [10, 20, 30] }, '#/a/1')).toBe(20);
  });

  it('returns undefined for out-of-bounds array index', () => {
    expect(resolvePointer({ a: [10] }, '#/a/5')).toBeUndefined();
  });

  it('returns undefined when traversing a primitive', () => {
    expect(resolvePointer({ a: 'hello' }, '#/a/b')).toBeUndefined();
  });
});

describe('isInternalRef', () => {
  it('returns true for "#/foo"', () => {
    expect(isInternalRef('#/foo')).toBe(true);
  });

  it('returns true for "#"', () => {
    expect(isInternalRef('#')).toBe(true);
  });

  it('returns false for http URLs', () => {
    expect(isInternalRef('http://example.com')).toBe(false);
  });

  it('returns false for https URLs', () => {
    expect(isInternalRef('https://example.com/schema.json')).toBe(false);
  });

  it('returns false for relative file paths', () => {
    expect(isInternalRef('./other.json')).toBe(false);
  });

  it('returns false for parent-relative paths', () => {
    expect(isInternalRef('../schemas/base.json')).toBe(false);
  });
});

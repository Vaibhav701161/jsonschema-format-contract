import { describe, it, expect } from 'vitest';
import { detectDraft } from './detectDraft';

describe('detectDraft', () => {

  it('detects Draft-04 from $schema URI', () => {
    expect(detectDraft({ $schema: 'http://json-schema.org/draft-04/schema#' })).toBe('Draft-04');
  });

  it('detects Draft-06 from $schema URI', () => {
    expect(detectDraft({ $schema: 'http://json-schema.org/draft-06/schema#' })).toBe('Draft-06');
  });

  it('detects Draft-07 from $schema URI', () => {
    expect(detectDraft({ $schema: 'http://json-schema.org/draft-07/schema#' })).toBe('Draft-07');
  });

  it('detects Draft 2019-09 from $schema URI', () => {
    expect(detectDraft({ $schema: 'https://json-schema.org/draft/2019-09/schema' })).toBe('Draft 2019-09');
  });

  it('detects Draft 2020-12 from $schema URI', () => {
    expect(detectDraft({ $schema: 'https://json-schema.org/draft/2020-12/schema' })).toBe('Draft 2020-12');
  });

  it('detects Draft 2020-12 from $dynamicRef keyword', () => {
    expect(detectDraft({ $dynamicRef: '#meta' })).toBe('Draft 2020-12');
  });

  it('detects Draft 2019-09 from $recursiveRef keyword', () => {
    expect(detectDraft({ $recursiveRef: '#' })).toBe('Draft 2019-09');
  });

  it('detects Draft 2019-09 from $defs keyword', () => {
    expect(detectDraft({ $defs: { Foo: {} } })).toBe('Draft 2019-09');
  });

  it('detects Draft-07 from definitions keyword', () => {
    expect(detectDraft({ definitions: { Foo: {} } })).toBe('Draft-07');
  });

  it('returns Unknown for empty object', () => {
    expect(detectDraft({})).toBe('Unknown');
  });

  it('returns Unknown for null', () => {
    expect(detectDraft(null)).toBe('Unknown');
  });

  it('returns Unknown for array', () => {
    expect(detectDraft([])).toBe('Unknown');
  });

  it('returns Unknown for unrecognized $schema URI', () => {
    expect(detectDraft({ $schema: 'https://example.com/custom-schema' })).toBe('Unknown');
  });
});

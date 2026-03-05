/**
 * Encode an array of tokens into a JSON Pointer string.
 *
 * Escaping order (RFC 6901 §3): '~' → '~0' first, then '/' → '~1'.
 */
export function encodePointer(tokens: string[]): string {
  if (tokens.length === 0) return '#';
  const escaped = tokens.map((t) => t.replace(/~/g, '~0').replace(/\//g, '~1'));
  return '#/' + escaped.join('/');
}

/**
 * Decode a JSON Pointer string into an array of unescaped tokens.
 *
 * Unescaping order (RFC 6901 §3): '~1' → '/' first, then '~0' → '~'.
 */
export function decodePointer(pointer: string): string[] {
  if (pointer === '#' || pointer === '') return [];
  const raw = pointer.startsWith('#/') ? pointer.slice(2) : pointer;
  return raw.split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Walk `schema` using the decoded tokens from `pointer`.
 *
 * Returns `undefined` (never throws) when the path is invalid.
 */
export function resolvePointer(schema: unknown, pointer: string): unknown {
  const tokens = decodePointer(pointer);
  let current: unknown = schema;

  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const idx = Number(token);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return undefined;
      }
      current = current[idx];
    } else if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, token)) {
        return undefined;
      }
      current = obj[token];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Returns `true` only for internal fragment references (`#` or `#/…`).
 */
export function isInternalRef(ref: string): boolean {
  return ref === '#' || ref.startsWith('#/');
}

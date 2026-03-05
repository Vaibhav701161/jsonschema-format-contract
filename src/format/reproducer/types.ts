/**
 * Format-reproducer types
 */
export interface FormatReproducerResult {
  /** The pointer that was targeted */
  readonly targetPointer: string;
  /** The format value at the target */
  readonly format: string;
  /** The minimal schema that reproduces the format context */
  readonly schema: Record<string, unknown>;
  /** Pointers included in the minimal schema */
  readonly includedPointers: string[];
}

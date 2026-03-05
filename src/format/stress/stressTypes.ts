export interface FormatStressScenario {
  /** Unique scenario name (e.g. "recursive_format_deep") */
  name: string;
  /** Human-readable description */
  description: string;
  /** The generated JSON Schema object */
  schema: Record<string, unknown>;
  /** Expected failure modes for this scenario */
  expectedFailureModes: string[];
}

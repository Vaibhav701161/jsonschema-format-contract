/**
 * Implementation adapters: define how to validate format strings
 * against different JSON Schema implementations.
 *
 * Each adapter describes how to invoke a specific validator
 * and parse its output.
 */

export interface ImplementationAdapter {
  name: string;
  language: string;
  /** Command template: {input} will be replaced with the JSON file path */
  command: string;
  /** Whether this implementation is available (installed) */
  available: boolean;
  /** Parse the stdout output of the command into a validation result */
  parseResult(stdout: string): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * AJV adapter (Node.js)
 *
 * Expects ajv-cli to be installed globally or in node_modules.
 * Validates a JSON file against a schema with format validation enabled.
 */
export const ajvAdapter: ImplementationAdapter = {
  name: 'ajv',
  language: 'javascript',
  command: 'npx ajv validate -s {schema} -d {data} --spec=draft2020 --strict=false',
  available: false,
  parseResult(stdout: string): ValidationResult {
    const lower = stdout.toLowerCase();
    if (lower.includes('valid')) {
      return { valid: !lower.includes('invalid') };
    }
    return { valid: false, errors: [stdout.trim()] };
  },
};

/**
 * Python jsonschema adapter
 *
 * Expects `jsonschema` CLI to be available (pip install jsonschema).
 */
export const pythonJsonschemaAdapter: ImplementationAdapter = {
  name: 'python-jsonschema',
  language: 'python',
  command: 'python3 -m jsonschema -i {data} {schema}',
  available: false,
  parseResult(stdout: string): ValidationResult {
    // jsonschema CLI exits 0 for valid, non-0 for invalid
    // stdout is empty on success, contains error on failure
    const trimmed = stdout.trim();
    if (trimmed === '') {
      return { valid: true };
    }
    return { valid: false, errors: [trimmed] };
  },
};

/**
 * Rust jsonschema adapter
 *
 * Expects `jsonschema-rs` CLI tool.
 */
export const rustJsonschemaAdapter: ImplementationAdapter = {
  name: 'rust-jsonschema',
  language: 'rust',
  command: 'jsonschema validate --schema {schema} --instance {data}',
  available: false,
  parseResult(stdout: string): ValidationResult {
    const trimmed = stdout.trim();
    if (trimmed === '' || trimmed.includes('valid')) {
      return { valid: !trimmed.includes('invalid') };
    }
    return { valid: false, errors: [trimmed] };
  },
};

/**
 * Get all known adapters.
 */
export function getAllAdapters(): ImplementationAdapter[] {
  return [ajvAdapter, pythonJsonschemaAdapter, rustJsonschemaAdapter];
}

/**
 * Get adapter by name.
 */
export function getAdapter(name: string): ImplementationAdapter | undefined {
  return getAllAdapters().find((a) => a.name === name);
}

/**
 * List available adapter names.
 */
export function getAdapterNames(): string[] {
  return getAllAdapters().map((a) => a.name);
}

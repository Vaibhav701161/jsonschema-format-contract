# jsonschema-format-contract

This tool started while I was working on the JSON Schema Test Suite and exploring the problem of `format` validation.

JSON Schema defines many string formats like:

```
email
date-time
uri
hostname
uuid
```

Each of these formats ultimately comes from external specifications (mostly RFCs). In theory that means validators should all agree on what is valid and invalid.

In practice they don’t.

Some validators accept leap seconds in timestamps, some reject them.
Some allow quoted email local-parts, some don’t.
Some URI parsers allow invalid percent encodings.

When debugging format validation problems I realized there was no systematic way to answer three basic questions:

* What does the RFC grammar actually allow?
* Which parts of that grammar can be tested purely syntactically?
* Where do real validator implementations disagree?

This tool was built to answer those questions.

It analyzes RFC grammars, derives test cases from them, and runs those tests against real JSON Schema validators to detect differences in behavior.

The goal is to help build **a more complete and RFC-grounded format test suite for JSON Schema implementations.**

Everything runs locally, deterministically, and can be used in CI.

---

# Installation

Install globally from npm:

```bash
npm install -g jsonschema-format-contract
```

Or run directly with npx:

```bash
npx jsonschema-format-contract --help
```

To build from source:

```bash
npm install
npm run build
```

The CLI command will then be available as:

```bash
jsonschema-format-contract
```

---

# Core Idea

The tool follows a simple reasoning pipeline:

```
RFC
  ↓
ABNF grammar extraction
  ↓
production rule classification
  ↓
syntactic vs semantic boundary detection
  ↓
test generation
  ↓
validator divergence detection
```

The key rule is:

> If a format requirement can be decided by parsing the string alone, it is testable.

Examples of **syntactic rules**:

* percent encoding in URIs
* IPv6 structure
* email local-part grammar
* timestamp separators

Examples of **semantic rules** (not testable here):

* DNS existence of domains
* whether a leap second actually occurred
* email delivery semantics

Every generated test case includes references to the RFC section and grammar production that justifies the expected result.

---

# Commands

## analyze

Analyze format usage in a JSON Schema.

The command finds every `format` keyword, inspects how it appears in the schema structure, and assigns a risk score based on structural complexity.

```bash
jsonschema-format-contract analyze schema.json
jsonschema-format-contract analyze --json schema.json
jsonschema-format-contract analyze --ci schema.json
```

The `--ci` flag returns a non-zero exit code if risky format usage is detected.

---

## diff

Compare format usage between two schema versions.

This helps detect situations where a schema change increases the testing requirements for formats.

Examples:

* a format added to a required property
* a change from `"uri"` to `"iri"`
* a format moved inside a conditional schema

```bash
jsonschema-format-contract diff old.json new.json
jsonschema-format-contract diff --json old.json new.json
jsonschema-format-contract diff --ci old.json new.json
```

---

## coverage

Analyze format test coverage.

This command checks:

* structural interactions involving formats
* RFC grammar branches that are not covered by tests
* classification coverage of syntax rules

```bash
jsonschema-format-contract coverage schema.json
jsonschema-format-contract coverage --tests metadata.json schema.json
jsonschema-format-contract coverage --ci schema.json
```

Example output:

```
Format: email

RFC grammar branches: 42
tested branches: 28
coverage: 66%

missing cases:
  quoted local parts
  consecutive dots
  domain literal forms
```

---

## generate-suite

Generate format tests derived from RFC grammars.

The generated files follow the same structure used by the official JSON Schema Test Suite.

```bash
jsonschema-format-contract generate-suite email
jsonschema-format-contract generate-suite --all
jsonschema-format-contract generate-suite --cited email
jsonschema-format-contract generate-suite --out-dir output/
```

Example output structure:

```
tests/
  draft2020-12/
    optional/
      format/
        email.json
```

With `--cited`, each test includes metadata referencing the RFC section and production rule that justifies the result.

---

## test-implementations

Run generated tests against real JSON Schema validator implementations.

Currently supported:

* AJV (JavaScript)
* python-jsonschema
* jsonschema-rs (Rust)

```bash
jsonschema-format-contract test-implementations email
jsonschema-format-contract test-implementations --adapter ajv email
jsonschema-format-contract test-implementations --ci email
```

This command identifies cases where validators disagree about format validity.

Example output:

```
Case: quoted local-part

Input:
"test test"@example.com

Expected: valid

AJV: invalid
python-jsonschema: valid
jsonschema-rs: invalid
```

---

## analyze-rfc

Inspect the RFC grammar behind a format.

This command extracts production rules, classifies them, and identifies ambiguous areas of the specification.

```bash
jsonschema-format-contract analyze-rfc date-time
jsonschema-format-contract analyze-rfc --json email
```

Example output:

```
Production: time-second

Rule:
2DIGIT (00–60)

Classification:
MUST_SYNTAX

RFC reference:
RFC 3339 §5.6
```

---

## generate-baseline

Generate a baseline document describing a format.

These documents summarize:

* the ABNF grammar
* production rule classifications
* known ambiguities
* validator divergences
* explicit non-goals

```bash
jsonschema-format-contract generate-baseline email
jsonschema-format-contract generate-baseline --out-dir docs/ date-time
```

---

## run-survey

Run a survey of validator behavior.

The command executes generated tests across available validators and produces a divergence matrix.

```bash
jsonschema-format-contract run-survey email
jsonschema-format-contract run-survey --all
jsonschema-format-contract run-survey --csv results.csv --all
```

Example summary:

```
Format: date-time

Total tests: 71
Validator disagreements: 33
Cases where all validators are wrong: 10
```

---

## export-framework

Export the full decision framework used by the tool.

```bash
jsonschema-format-contract export-framework
jsonschema-format-contract export-framework --output docs/framework.md
```

The exported document includes:

* production rule classifications
* syntactic boundary decisions
* ambiguity notes
* testing obligations per format

---

# Example Workflow

A typical workflow when analyzing a format might look like this:

```bash
# inspect RFC grammar
jsonschema-format-contract analyze-rfc date-time

# generate baseline documentation
jsonschema-format-contract generate-baseline date-time

# generate test suite
jsonschema-format-contract generate-suite --cited date-time

# run validators against tests
jsonschema-format-contract run-survey date-time

# analyze format usage in your schema
jsonschema-format-contract analyze schema.json
jsonschema-format-contract coverage schema.json
```

---

# Supported Formats

The tool currently supports all JSON Schema string formats:

```
date
date-time
duration
email
hostname
idn-email
idn-hostname
ipv4
ipv6
iri
iri-reference
json-pointer
regex
relative-json-pointer
time
uri
uri-reference
uri-template
uuid
```

---

# Exit Codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 0    | Success                                                |
| 1    | Analysis error or high risk                            |
| 3    | Breaking change, coverage gap, or validator divergence |

---

# Architecture

The project is organized into several layers.

```
src/

  rfc/
    ABNF parsing
    production rule model
    RFC registry
    classification system

  generator/
    test generation
    edge case derivation
    RFC citation engine

  survey/
    validator testing
    divergence analysis

  implementations/
    validator adapters

  format/
    schema format analysis engine

  parser/
    JSON Schema normalization

  graph/
    reference resolution

  utils/
    traversal and pointer utilities
```

The CLI layer connects these systems into the commands described above.

---

# Tests

```
npm test
npm run test:run
```

---

# Benchmarks

You can benchmark the tool against large schemas:

```bash
npx tsx scripts/benchmark.ts
npx tsx scripts/benchmark.ts path/to/schema.json
```

Place benchmark schemas inside a `benchmarks/` directory or pass paths directly.


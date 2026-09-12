# Octate Configuration Reference

Octate is configured via a YAML file named `octate.yaml` placed at your repository root or discovered in parent directories.

---

## Configuration Hierarchy & Precedence

Octate resolves configuration values through a deterministic 5-tier merge cascade:

```
Default Config < Global (~/.config/octate/config.yaml) < Project (octate.yaml) < Environment Variables < CLI Flags
```

Higher tiers unconditionally override lower tiers. For example, passing `--fail-on high` on the CLI overrides any `failOn` setting in `octate.yaml`.

---

## Complete `octate.yaml` Example

```yaml
version: "1.0"

project:
  name: "MyApplication"
  description: "Production web backend and API service"
  languages:
    - typescript
    - python

review:
  severity: medium             # Minimum severity to report: critical, high, medium, low, info
  failOn: critical             # Severity that triggers non-zero exit code: critical, high, medium, low, none
  maxFindings: 25              # Maximum findings returned per review session
  confidenceThreshold: 0.65    # Findings below this confidence floor are rejected
  categories:
    - security
    - correctness
    - reliability
    - architecture
    - performance

architecture:
  boundaries:
    - name: "Domain Isolation"
      description: "Core domain logic must not import from UI or HTTP transport layers"
      source: "src/domain/**"
      forbidden:
        - "src/ui/**"
        - "src/controllers/**"
        - "express"
        - "koa"

    - name: "Database Abstraction"
      description: "Direct SQL queries are only permitted within src/db/**"
      source: "src/**"
      except:
        - "src/db/**"
      forbiddenPatterns:
        - "SELECT "
        - "INSERT INTO"
        - "DELETE FROM"

rules:
  - id: "RULE-01"
    name: "No Raw SQL in Controllers"
    severity: "critical"
    category: "security"
    description: "Database queries must use repository interfaces, never inline string queries."

  - id: "RULE-02"
    name: "Explicit Stream Resource Teardown"
    severity: "high"
    category: "reliability"
    description: "All Node.js Readable and Writable streams must register error and close listeners."

ignore:
  - "**/*.min.js"
  - "**/*.bundle.js"
  - "dist/**"
  - "coverage/**"
  - "node_modules/**"
  - "**/*.generated.ts"
  - "vendor/**"

cache:
  enabled: true
  ttlHours: 168                # Cache invalidation window (7 days)
  maxSizeBytes: 209715200      # Cache store ceiling (200 MB)
```

---

## Field Specifications

### `version`
- **Type:** `string` (required)
- **Allowed values:** `"1.0"`

### `project`
- `name`: Human-readable identifier for your repository.
- `description`: Contextual summary provided to the model during review reasoning.
- `languages`: Array of primary languages enabled for parsing (`typescript`, `javascript`, `python`).

### `review`
- `severity`: Minimum severity filter applied to final ranked findings.
- `failOn`: Threshold for non-zero exit code (exit code 1) in automated pipelines.
- `maxFindings`: Upper bound for findings displayed in the TUI or written to SARIF.
- `confidenceThreshold`: Grounding threshold (0.0 to 1.0). Findings with confidence below this score are discarded by the Critic.

### `architecture.boundaries`
Enforces dependency invariants deterministically without relying on LLM interpretations:
- `source`: Glob pattern matching files subject to the boundary.
- `forbidden`: Module names or globs that files in `source` are forbidden to import.
- `forbiddenPatterns`: Substring or regex patterns forbidden inside matching files.

### `ignore`
Array of glob patterns ignored during repository diff analysis and symbol indexing. Standard `.gitignore` rules are automatically respected in addition to these patterns.

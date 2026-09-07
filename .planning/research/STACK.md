# Technology Stack

**Project:** Octate
**Researched:** 2025-09-06

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | 7.0.2 | Primary language | Strict mode, mature ecosystem, Vercel compatibility, shared language for future web layer |
| Node.js | ≥22.0.0 | Runtime | Required by Ink 7.1.1, modern ES modules, good performance |
| pnpm | 12.3.4 | Package manager | Fast, disk-efficient, workspace support for monorepo, strict dependency access |
| Commander.js | 15.0.0 | CLI routing | Battle-tested, TypeScript support via `@commander-js/extra-typings`, subcommand support, option parsing |

### TUI Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Ink | 7.1.1 | React-based terminal UI | Component-based, Flexbox layout, keyboard input handling, React 19 compatible, core-independent (swappable renderer) |
| React | 19.2.8 | UI component model | Required by Ink, concurrent rendering support, mature ecosystem |
| @types/react | Latest | Type definitions | TypeScript support for React components |

### Parsing & Language Intelligence

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| tree-sitter | 0.25.1 | Core parsing library | Incremental parsing, concrete syntax trees, language-agnostic |
| tree-sitter-typescript | 0.23.2 | TypeScript/TSX grammar | Official TS/TSX grammar, peer dependency on tree-sitter ^0.21.0 |
| tree-sitter-python | 0.25.0 | Python grammar | Official Python grammar for Tree-sitter |
| tree-sitter-javascript | Latest | JavaScript grammar | Needed for JS files (separate from TS grammar) |

**Note:** Language grammars are maintained in separate repos. Install as dependencies, not peer dependencies. Use `web-tree-sitter` for WASM-based parsing if native bindings cause issues.

### Git Operations

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| isomorphic-git | 1.41.9 | Pure JS Git implementation | No native dependencies, works in Node.js, supports status, diff, log, listFiles, readBlob |
| Node.js fs | Built-in | Filesystem access | Passed to isomorphic-git, no extra dependency |

**Avoid:** `simple-git` (wraps Git CLI, slower, requires Git binary), `nodegit` (native bindings, complex builds).

### Configuration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| yaml (eemeli/yaml) | 2.9.0 | YAML 1.2 parsing/stringify | Active maintenance, TypeScript 5.9+ types, supports comments, multi-document |
| cosmiconfig | 10.0.1 | Config discovery | Finds `octate.yaml` in directory hierarchy, supports package.json, .rc files, async loading |

### Schema Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | 4.5.4 | Runtime schema validation | TypeScript-first, static type inference, `z.compile()` for AOT optimization, validates model output |

**Use for:** Model response validation, configuration validation, finding schema validation.

### Structured Logging

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Pino | 10.3.1 | JSON logger | Extremely fast, child loggers for module context, redaction support, pretty printing via `pino-pretty` |
| pino-pretty | Latest | Human-readable dev logs | Colorized output for development |

**Avoid:** `winston` (slower, heavier), `console.log` (no structure, no levels).

### Concurrency Control

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| p-limit | 7.3.2 | Promise concurrency limiting | Tiny (1KB), simple API, `pLimit(concurrency)` wrapper, no queue overhead |
| p-queue | 7.3.2 | Promise queue with priority | When priority/ordering needed (e.g., reviewer DAG) |

**Use `p-limit` for:** Parallel file parsing, diagnostics, reviewers.
**Use `p-queue` for:** Review DAG stages with dependencies.

### File System & Globbing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| fast-glob | 3.3.3 | Fast file globbing | Async, supports `.gitignore` via `ignore` package, fast |
| ignore | 7.0.8 | `.gitignore` parsing | Used by fast-glob, handles negation patterns, standard behavior |

### SARIF Output

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @microsoft/sarif-sdk | Latest | SARIF v2.1.0 object model | Official Microsoft SDK, TypeScript types via `@types/sarif`, programmatic construction |
| node-sarif-builder | 5.0.0 | Simplified SARIF builder | Fluent API for building SARIF logs, easier than raw SDK |

**Use `node-sarif-builder` for:** Generating SARIF output from findings.
**Types:** `@types/sarif` 2.1.7 for TypeScript definitions.

### Terminal Styling (Non-Interactive Mode)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| picocolors | 1.1.1 | ANSI colors | 14x smaller and 2x faster than chalk, zero dependencies, same API |

**Avoid:** `chalk` (larger, slower), `colors` (modifies String.prototype).

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Jest | 30.5.1 | Test framework | Zero-config, parallel, snapshot testing, built-in mocking |
| ts-jest | 29.4.12 | TypeScript transformer | Source map support, fast transpilation, Jest native integration |
| @types/jest | Latest | Type definitions | TypeScript support for Jest globals |

### Linting & Formatting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @biomejs/biome | 2.5.12 | Lint + format | Single tool replaces ESLint + Prettier, fast (Rust), TypeScript-native, strict rules |

**Configuration:** `biome.json` with recommended rules, organized imports, formatter options.

### NVIDIA Model Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native fetch | Built-in | HTTP client | Node.js ≥18 has global fetch, no extra dependency |
| AbortController | Built-in | Cancellation | Standard API for cancelling in-flight requests |
| NVIDIA API | `https://integrate.api.nvidia.com/v1` | Model endpoint | OpenAI-compatible chat completions API, supports Nemotron 3 Ultra (`nvidia/nemotron-3-ultra-550b-a55b`) |

**API Format:** OpenAI-compatible `/v1/chat/completions` with `Authorization: Bearer <NVIDIA_API_KEY>`.

### Local Cache & State

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native fs/promises | Built-in | Cache storage | `~/.local/share/octate/` for indexes, cache, findings, logs |
| Native crypto | Built-in | Content hashing | `createHash('sha256')` for file content hashing (incremental indexing keys) |

### Development Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @types/node | 26.4.1 | Node.js types | Required for TypeScript compilation |
| typescript | 7.0.2 | Compiler | Strict mode, latest features |
| tsx | Latest | TypeScript execution | For running CLI during development (`tsx watch src/cli.ts`) |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI Framework | Commander.js | oclif, yargs | oclif: heavier, plugin system not needed; yargs: larger, less active |
| TUI | Ink | blessed, terminal-kit, textual (Python) | blessed: no React, lower-level; terminal-kit: less active; textual: Python, not TS |
| Parsing | Tree-sitter | Babel, TypeScript Compiler API, regex | Babel: no incremental, heavy; TS API: TS-only, slow; regex: unreliable |
| Git | isomorphic-git | simple-git, nodegit | simple-git: CLI wrapper, slow; nodegit: native bindings, build issues |
| Validation | Zod | Joi, Yup, io-ts | Joi: no TS inference; Yup: slower; io-ts: more verbose, less ergonomic |
| Logging | Pino | Winston, Bunyan, console | Winston: slower; Bunyan: unmaintained; console: no structure |
| Concurrency | p-limit | bottleneck, async-pool, Promise.all | bottleneck: heavier; async-pool: less maintained; Promise.all: no limit |
| Package Manager | pnpm | npm, yarn | npm: no workspace hoisting control; yarn: slower, PnP complexity |
| Lint/Format | Biome | ESLint + Prettier | Two tools, slower, config drift, separate parsers |
| Colors | picocolors | chalk, kleur | chalk: 14x larger; kleur: less maintained |
| Test | Jest | Vitest, Mocha | Vitest: Vite-coupled; Mocha: more config, no built-in mocking |
| Config | yaml + cosmiconfig | rc, configstore | rc: less flexible; configstore: opinionated storage location |
| SARIF | node-sarif-builder | Manual JSON, @microsoft/sarif-sdk directly | Manual: error-prone; raw SDK: verbose, complex API |

---

## Installation

```bash
# Core dependencies
pnpm add ink react commander isomorphic-git yaml zod pino pino-pretty \
  tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-javascript \
  p-limit p-queue fast-glob ignore cosmiconfig picocolors \
  node-sarif-builder @types/sarif

# Dev dependencies
pnpm add -D @biomejs/biome jest ts-jest @types/jest @types/node typescript tsx \
  @commander-js/extra-typings @types/react

# Optional: web-tree-sitter if native bindings problematic
# pnpm add web-tree-sitter
```

---

## Sources

- Ink: https://github.com/vadimdemedes/ink (v7.1.1, Node ≥22, React ≥19)
- Tree-sitter: https://github.com/tree-sitter/tree-sitter (v0.25.1)
- Tree-sitter TypeScript: https://github.com/tree-sitter/tree-sitter-typescript (v0.23.2, peer tree-sitter ^0.21.0)
- Tree-sitter Python: https://github.com/tree-sitter/tree-sitter-python (v0.25.0)
- Commander.js: https://github.com/tj/commander.js (v15.0.0)
- Isomorphic-git: https://github.com/isomorphic-git/isomorphic-git (v1.41.9)
- yaml (eemeli/yaml): https://github.com/eemeli/yaml (v2.9.0, TS 5.9+)
- Zod: https://github.com/colinhacks/zod (v4.5.4)
- Pino: https://github.com/pinojs/pino (v10.3.1)
- p-limit: https://github.com/sindresorhus/p-limit (v7.3.2)
- fast-glob: https://github.com/mrmlnc/fast-glob (v3.3.3)
- Biome: https://biomejs.dev (v2.5.12)
- Jest: https://jestjs.io (v30.5.1)
- pnpm: https://pnpm.io (v12.3.4)
- NVIDIA API: https://integrate.api.nvidia.com/v1/models (Nemotron 3 Ultra confirmed available)
- node-sarif-builder: https://github.com/nvuillam/node-sarif-builder (v5.0.0)
- picocolors: https://github.com/alexeyraspopov/picocolors (v1.1.1)
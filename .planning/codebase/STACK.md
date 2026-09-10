# Technology Stack

**Analysis Date:** 2026-09-10

## Languages

**Primary:**
- TypeScript 5.9.3 - Strict mode, ES2022 target, NodeNext module resolution, isolatedModules, declaration maps. Used for all application code in `src/`.

**Secondary:**
- JavaScript (ESM) - Compiled execution output in `dist/`.
- WebAssembly (`.wasm`) - Precompiled Tree-sitter language grammars for TypeScript and Python.

## Runtime

**Environment:**
- Node.js >=22.0.0 - Required by Ink 7.1.1 (planned TUI), modern ES modules, global `fetch`, native `AbortController`, and Node.js VM modules for Jest ESM execution.

**Package Manager:**
- pnpm 12.3.4 - Fast, disk-efficient, workspace support (`pnpm-workspace.yaml`), strict dependency isolation.
- Lockfile: `pnpm-lock.yaml` present.

## Frameworks

**Core CLI:**
- Commander.js 15.0.0 - Command line routing, subcommand dispatch (`review`, `doctor`, `init`), options and flag parsing. Entry point: `src/cli.ts`.

**Testing:**
- Jest 30.5.1 - Test runner, parallel execution, snapshot testing, mocking.
- ts-jest 29.4.12 - TypeScript transformer with ESM support (`jest.config.ts`).
- @jest/globals 30.5.1 - Explicit type-safe Jest globals.

**Build & Developer Tooling:**
- TypeScript 5.9.3 (`tsc`) - Compiler (`tsconfig.json`), declaration emitter.
- tsx latest - TypeScript execution runtime for rapid development (`tsx watch src/cli.ts`).
- @biomejs/biome 2.5.12 - Unified fast Rust-based linter and formatter (`biome.json`).
- husky latest - Git commit hooks management.

## Key Dependencies

**Parsing & Syntax Trees (Analysis Layer):**
| Package | Version | Purpose | Usage Location |
|---|---|---|---|
| `web-tree-sitter` | ^0.27.0 | WebAssembly Tree-sitter parser runtime | `src/analysis/parser/index.ts`, `src/analysis/symbols/index.ts` |
| `tree-sitter-typescript` | ^0.23.2 | TypeScript / TSX language grammar | `test-wasm/tree-sitter-typescript.wasm`, `src/analysis/parser/` |
| `tree-sitter-python` | ^0.25.0 | Python language grammar | `test-wasm/tree-sitter-python.wasm`, `src/analysis/parser/` |

**Core & Repository Intelligence:**
| Package | Version | Purpose | Usage Location |
|---|---|---|---|
| `commander` | 15.0.0 | CLI routing, argument & flag parsing | `src/cli.ts`, `src/commands/*.ts` |
| `isomorphic-git` | 1.41.9 | Pure JS Git operations (diff, statusMatrix, log, refs) | `src/repository/git.ts` |
| `fast-glob` | 3.3.3 | Workspace package discovery across glob patterns | `src/repository/monorepo.ts` |
| `ignore` | 7.0.8 | `.gitignore` and `.octateignore` parsing and path matching | `src/repository/ignore.ts`, `src/repository/filter.ts` |
| `yaml` | 2.9.0 | YAML 1.2 parsing for `octate.yaml` configuration | `src/config/loader.ts` |
| `zod` | 4.5.4 | Runtime schema validation, type inference, AOT compilation | `src/config/schema.ts`, `src/config/loader.ts` |
| `pino` | 10.3.1 | High-throughput structured JSON logging with redaction | `src/logging/index.ts` |
| `pino-pretty` | ^13.1.3 | Colorized human-readable logs for development mode | `src/logging/index.ts` |
| `p-limit` | 7.3.2 | Promise concurrency limiting and pool control | `src/cache/pool.ts` |
| `p-queue` | 7.3.2 | Priority-based promise queues (for reviewer DAGs) | Dependency installed |
| `picocolors` | 1.1.1 | Zero-dependency terminal ANSI colors | `src/commands/review.ts` |
| `@microsoft/sarif` | latest | SARIF v2.1.0 JSON schema type definitions | `src/commands/review.ts` |
| `node-sarif-builder` | 5.0.0 | Fluent API for building compliant SARIF reports | Dependency installed |

**Subprocess Analysis Integrations (Detected & Executed):**
- `tsc` (`npx tsc`) - TypeScript compiler static type diagnostics
- `biome` (`npx biome`) - JavaScript/TypeScript linting and formatting diagnostics
- `ruff` (`ruff`) - Fast Python linting and code quality diagnostics
- `mypy` (`mypy`) - Static type checking for Python
- `pyright` (`pyright`) - Python language server and type checking diagnostics
- `bandit` (`bandit`) - Python AST security vulnerability scanner
- `pytest` (`pytest`) - Python test discovery and suite status

**Infrastructure Built-ins:**
- Native `node:fs/promises` - Asynchronous filesystem access and atomic cache writes
- Native `node:crypto` - SHA256 content hashing, project identity, and cache keys (`src/cache/keys.ts`)
- Native `fetch` & `AbortController` - HTTP client for NVIDIA API, connectivity checks, signal aborts
- Native `node:child_process` - Subprocess execution via `spawn` with process-tree cleanup (`src/cancellation/subprocess.ts`)

## Configuration

**Environment Variables:**
- `NVIDIA_API_KEY` - API key for NVIDIA inference (`https://integrate.api.nvidia.com/v1`)
- `LOG_LEVEL` - Logging level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`)
- `NODE_ENV` - Runtime mode (`production` disables colorized pretty logging)
- `XDG_CONFIG_HOME` - Base directory for global configuration files (`~/.config/octate/config.yaml`)
- `HOME` / `USERPROFILE` - Base directory for user cache storage (`~/.local/share/octate/`)

**Build Configuration:**
- `tsconfig.json` - Target ES2022, NodeNext modules, strict mode, `@/*` path mapping
- `biome.json` - Formatting (2 spaces, 100 column width, single quotes, semicolons) and lint rules
- `jest.config.ts` - ESM preset with ts-jest, coverage collection across `src/**/*.ts`
- `package.json` - Scripts: `build`, `dev`, `test`, `test:watch`, `lint`, `format`, `check`

**Configuration Discovery:**
- Project config: `octate.yaml` (searched up the directory tree to repository root)
- Global config: `~/.config/octate/config.yaml` (XDG standard)
- Strict validation via Zod schemas in `src/config/schema.ts`

## Platform Requirements

**Development:**
- Linux, macOS, or Windows (WSL recommended)
- Node.js >=22.0.0
- pnpm >=12.0.0
- Git repository

**Production:**
- Packaged as an npm CLI module
- Executable entry via `package.json` `bin.octate` → `dist/cli.js` (with shebang `#!/usr/bin/env node`)
- Runs locally on the developer's machine; zero server component

---

*Stack analysis: 2026-09-10*
*Update after major dependency changes*
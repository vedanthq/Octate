# Technology Stack

**Analysis Date:** 2026-09-08

## Languages

**Primary:**
- TypeScript 5.9.3 - Strict mode, ES2022 target, NodeNext module resolution. Used for all source code in `src/`.

**Secondary:**
- JavaScript (ESM) - Generated output in `dist/` for CLI execution.

## Runtime

**Environment:**
- Node.js >=22.0.0 - Required by Ink 7.1.1, modern ES modules, global fetch, AbortController.

**Package Manager:**
- pnpm 12.3.4 - Fast, disk-efficient, workspace support for monorepo (`pnpm-workspace.yaml`), strict dependency access.
- Lockfile: `pnpm-lock.yaml` present (139KB)

## Frameworks

**Core:**
- Commander.js 15.0.0 - CLI routing, subcommands, option parsing. Entry point: `src/cli.ts`.

**Testing:**
- Jest 30.5.1 - Test framework with zero-config, parallel execution, snapshot testing, built-in mocking.
- ts-jest 29.4.12 - TypeScript transformer with ESM support (`jest.config.ts`).
- @jest/globals 30.5.1 - Type definitions for Jest globals.

**Build/Dev:**
- TypeScript 5.9.3 - Compiler (`tsconfig.json`), strict mode, declaration maps.
- tsx latest - TypeScript execution for development (`tsx watch src/cli.ts`).
- @biomejs/biome 2.5.12 - Lint + format single tool (replaces ESLint + Prettier). Config: `biome.json`.

## Key Dependencies

**Critical:**
| Package | Version | Purpose | Location |
|---------|---------|---------|----------|
| commander | 15.0.0 | CLI command routing, subcommands, options | `src/cli.ts`, `src/commands/*.ts` |
| isomorphic-git | 1.41.9 | Pure JS Git implementation (status, diff, log, refs) | `src/repository/git.ts` |
| yaml | 2.9.0 | YAML 1.2 parsing for `octate.yaml` config | `src/config/loader.ts` |
| zod | 4.5.4 | Runtime schema validation, type inference | `src/config/schema.ts`, `src/config/loader.ts` |
| pino | 10.3.1 | Structured JSON logging with redaction | `src/logging/index.ts` |
| p-limit | 7.3.2 | Promise concurrency limiting | Not yet used (planned for Phase 5) |
| p-queue | 7.3.2 | Promise queue with priority | Not yet used (planned for reviewer DAG) |
| fast-glob | 3.3.3 | Fast file globbing with `.gitignore` support | Not yet used (planned for file discovery) |
| ignore | 7.0.8 | `.gitignore` parsing for fast-glob | Not yet used |
| picocolors | 1.1.1 | ANSI colors for non-interactive output | `src/commands/review.ts` |
| @microsoft/sarif | latest | SARIF v2.1.0 object model types | `src/commands/review.ts` (placeholder) |
| node-sarif-builder | 5.0.0 | Fluent SARIF builder API | Not yet used (planned for SARIF output) |

**Infrastructure:**
- Native `node:fs/promises` - Filesystem access, cache storage at `~/.local/share/octate/`
- Native `node:crypto` - SHA256 hashing for project identity and cache keys (`src/cache/identity.ts`)
- Native `fetch` / `AbortController` - HTTP client for NVIDIA API, cancellation (`src/commands/doctor.ts`)
- Native `node:path`, `node:os`, `node:module` - Path resolution, home dir, require

## Configuration

**Environment:**
- `NVIDIA_API_KEY` - Required for NVIDIA API access (local mode)
- `LOG_LEVEL` - Log level override (debug, info, warn, error, fatal, trace)
- `NODE_ENV` - Development vs production (affects log formatting)
- `XDG_CONFIG_HOME` - Global config location override (default `~/.config`)
- `HOME` / `USERPROFILE` - Home directory for cache location

**Build:**
- `tsconfig.json` - TypeScript compilation (ES2022, NodeNext, strict, declaration maps)
- `biome.json` - Linting/formatting rules (2-space indent, 100 char width, single quotes, semicolons)
- `jest.config.ts` - Jest with ts-jest ESM preset, coverage from `src/**/*.ts` (excludes tests and cli.ts)
- `package.json` - Scripts: `build`, `dev`, `test`, `test:watch`, `lint`, `format`, `check`

**Config Discovery:**
- Project config: `octate.yaml` (walked up from CWD via `src/config/loader.ts:findConfigFile()`)
- Global config: `~/.config/octate/config.yaml` (XDG standard, via `src/config/loader.ts:loadGlobalConfig()`)
- Schema: `src/config/schema.ts` (Zod, strict, compiled for AOT)

## Platform Requirements

**Development:**
- Node.js >=22.0.0
- pnpm >=12.0.0
- Git repository (required for `octate review`)

**Production:**
- Same as development (CLI tool, no separate deployment target)
- Binary entry: `dist/cli.js` (shebang `#!/usr/bin/env node`)
- Installed via `pnpm pack` / npm publish, `bin.octate` -> `./dist/cli.js`

---

*Stack analysis: 2026-09-08*
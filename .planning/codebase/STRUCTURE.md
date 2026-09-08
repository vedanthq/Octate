# Codebase Structure

**Analysis Date:** 2026-09-08

## Directory Layout

```
Octate/
├── src/                    # Source code (TypeScript)
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # Subcommand implementations
│   │   ├── index.ts        # Command registry
│   │   ├── review.ts       # Review command (main)
│   │   ├── init.ts         # Init command
│   │   ├── doctor.ts       # Doctor command
│   │   ├── review.test.ts  # Review command tests
│   │   ├── init.test.ts    # Init command tests
│   │   └── doctor.test.ts  # Doctor command tests
│   ├── repository/         # Git/repository operations
│   │   ├── index.ts        # Public API barrel
│   │   ├── discovery.ts    # Git root + workspace detection
│   │   ├── git.ts          # isomorphic-git wrapper
│   │   ├── scope.ts        # Scope resolution (--staged, --commit, etc.)
│   │   ├── filter.ts       # File filtering (binary, generated, symlinks)
│   │   ├── ignore.ts       # .gitignore parsing
│   │   ├── monorepo.ts     # Monorepo detection
│   │   ├── *.test.ts       # Tests for each module
│   ├── model/              # AI model abstraction
│   │   ├── index.ts        # Public API barrel
│   │   ├── types.ts        # Request/response types, interfaces
│   │   ├── abstraction.ts  # ReviewModel interface + factory
│   │   └── abstraction.test.ts
│   ├── cache/              # File-based caching
│   │   ├── index.ts        # Public API barrel
│   │   ├── store.ts        # CacheStore class (atomic writes, LRU)
│   │   ├── keys.ts         # Cache key generation
│   │   ├── lru.ts          # In-memory LRU cache
│   │   ├── pool.ts         # Promise pool for concurrency
│   │   ├── identity.ts     # Cache dir + project identity
│   │   └── *.test.ts       # Tests for each module
│   ├── config/             # Configuration system
│   │   ├── index.ts        # Public API barrel
│   │   ├── schema.ts       # Zod schemas + defaults
│   │   ├── loader.ts       # Config file discovery (cosmiconfig)
│   │   ├── merger.ts       # Precedence merging
│   │   └── *.test.ts       # Tests for each module
│   ├── logging/            # Structured logging
│   │   ├── index.ts        # Pino setup + child loggers
│   │   └── index.test.ts
│   ├── errors/             # Typed error hierarchy
│   │   ├── index.ts        # Error classes + factories + guards
│   │   └── index.test.ts
│   ├── cancellation/       # Cancellation + subprocess
│   │   ├── index.ts        # Public API barrel
│   │   ├── controller.ts   # CancellationController
│   │   ├── subprocess.ts   # spawnWithSignal + killProcessTree
│   │   └── *.test.ts
│   ├── types/              # Core domain types
│   │   ├── index.ts        # Repository, Workspace, FileChange, ReviewScope
│   │   └── index.test.ts
│   └── index.ts            # (if exists) Main barrel export
├── dist/                   # Compiled output (generated)
│   ├── cli.js              # Compiled entry point
│   ├── commands/           # Compiled commands
│   ├── repository/         # Compiled repository layer
│   ├── model/              # Compiled model layer
│   ├── cache/              # Compiled cache layer
│   ├── config/             # Compiled config layer
│   ├── logging/            # Compiled logging
│   ├── errors/             # Compiled errors
│   ├── cancellation/       # Compiled cancellation
│   └── types/              # Compiled types
├── .planning/              # GSD planning artifacts
│   ├── codebase/           # Codebase maps (this file)
│   ├── phases/             # Phase plans and summaries
│   ├── research/           # Research docs
│   ├── STATE.md            # Current project state
│   ├── ROADMAP.md          # Phase roadmap
│   ├── REQUIREMENTS.md     # Requirements
│   └── PROJECT.md          # Project definition
├── .opencode/              # OpenCode configuration
│   ├── skills/             # Project skills
│   └── rules/              # Project rules
├── node_modules/           # Dependencies (ignored)
├── coverage/               # Test coverage (ignored)
├── package.json            # Package manifest
├── pnpm-lock.yaml          # Lockfile
├── tsconfig.json           # TypeScript config
├── biome.json              # Biome lint/format config
├── jest.config.ts          # Jest test config
├── pnpm-workspace.yaml     # pnpm workspace config
├── .gitignore              # Git ignores
├── AGENTS.md               # Agent instructions
└── CONTEXT*.md             # Context documents
```

## Directory Purposes

**src/**: Main source code root
- **Purpose**: All TypeScript implementation
- **Contains**: Layered modules (CLI, commands, repository, model, cache, config, logging, errors, cancellation, types)
- **Key files**: `src/cli.ts` (entry), `src/commands/review.ts` (main command)

**src/commands/**: CLI subcommand implementations
- **Purpose**: Business logic for each `octate` subcommand
- **Contains**: `review.ts`, `init.ts`, `doctor.ts`, command registry, tests
- **Key files**: `src/commands/review.ts` (402 lines — main review orchestration)

**src/repository/**: Git and filesystem operations
- **Purpose**: All repository analysis — discovery, diffs, scopes, filtering
- **Contains**: 7 modules + tests, public API via `index.ts`
- **Key files**: `git.ts` (608 lines — isomorphic-git wrapper), `scope.ts` (241 lines — scope resolution)

**src/model/**: AI model abstraction layer
- **Purpose**: Provider-agnostic interface for code review models
- **Contains**: Types, ReviewModel interface, factory (Phase 4 implementations pending)
- **Key files**: `types.ts` (172 lines — request/response contracts), `abstraction.ts` (53 lines — interface)

**src/cache/**: File-based caching with LRU eviction
- **Purpose**: Incremental analysis caching, content hashing
- **Contains**: Store, keys, LRU, pool, identity, tests
- **Key files**: `store.ts` (304 lines — atomic writes, size tracking), `keys.ts` (cache key generation)

**src/config/**: Configuration loading and validation
- **Purpose**: Multi-source config with precedence (defaults < global < project < env < CLI)
- **Contains**: Schema (Zod), loader (cosmiconfig), merger, tests
- **Key files**: `schema.ts` (64 lines — Zod schemas), `merger.ts` (precedence logic)

**src/logging/**: Structured logging
- **Purpose**: Pino-based JSON logging with redaction, child loggers
- **Contains**: Single module with root logger + factory functions
- **Key files**: `index.ts` (118 lines — root logger, createLogger, redaction)

**src/errors/**: Typed error hierarchy
- **Purpose**: Exit codes for automation, structured error context
- **Contains**: 13 error classes + factories + type guards
- **Key files**: `index.ts` (353 lines — full hierarchy)

**src/cancellation/**: Cancellation and subprocess management
- **Purpose**: AbortController wrapper, signal propagation to subprocesses
- **Contains**: Controller, subprocess utilities, tests
- **Key files**: `controller.ts`, `subprocess.ts`

**src/types/**: Core domain type definitions
- **Purpose**: Shared types across layers (Repository, Workspace, FileChange, ReviewScope)
- **Contains**: Interfaces + type guards
- **Key files**: `index.ts` (111 lines)

**dist/**: Compiled JavaScript output
- **Purpose**: Build artifact for distribution
- **Generated**: Yes (by `tsc`)
- **Committed**: Yes (for binary distribution via `package.json` bin)

**.planning/**: GSD planning artifacts
- **Purpose**: Project planning, phase tracking, codebase maps
- **Generated**: Partially (by GSD commands)
- **Committed**: Yes

**.opencode/**: OpenCode configuration
- **Purpose**: Agent skills, rules, MCP config
- **Generated**: No
- **Committed**: Yes

## Key File Locations

**Entry Points:**
- `src/cli.ts` — Main CLI entry, `main()` function, Commander setup
- `package.json:bin.octate` → `./dist/cli.js` — Binary entry point

**Configuration:**
- `src/config/schema.ts` — Zod schemas (`OctateConfigSchema`, `ReviewConfigSchema`, etc.)
- `src/config/merger.ts` — `loadConfig()`, `mergeConfigs()`, precedence logic
- `src/config/loader.ts` — `findConfigFile()`, `loadProjectConfig()`, `loadGlobalConfig()`
- `biome.json` — Lint/format rules
- `tsconfig.json` — TypeScript compiler options
- `jest.config.ts` — Jest test configuration

**Core Logic:**
- `src/commands/review.ts` — Review command orchestration (scope, config, execute, output)
- `src/repository/git.ts` — Git operations (diff, status, log, refs via isomorphic-git)
- `src/repository/scope.ts` — Scope flag parsing → ReviewScope resolution
- `src/repository/discovery.ts` — Git root finding, workspace detection
- `src/model/types.ts` — ModelRequest/ModelResponse, ReviewModel interface
- `src/model/abstraction.ts` — ReviewModel interface + provider factory
- `src/cache/store.ts` — CacheStore class (atomic writes, LRU eviction)
- `src/cache/keys.ts` — Cache key generation (content hashing)

**Testing:**
- `src/**/*.test.ts` — Co-located tests (Jest)
- `jest.config.ts` — Test config (ts-jest, ESM, coverage)

## Naming Conventions

**Files:**
- **Modules**: kebab-case (`git.ts`, `scope.ts`, `cache/store.ts`)
- **Tests**: `*.test.ts` suffix co-located with source
- **Barrel exports**: `index.ts` in each directory
- **Types**: `types.ts` for domain types, `schema.ts` for Zod schemas

**Directories:**
- **Feature-based**: Grouped by domain (`repository/`, `cache/`, `model/`)
- **Flat within domain**: No deep nesting (max 2 levels)

**Code:**
- **Functions**: camelCase (`createReviewCommand`, `resolveScope`, `generateCacheKey`)
- **Classes**: PascalCase (`CacheStore`, `CancellationController`, `ConfigurationError`)
- **Interfaces**: PascalCase (`ReviewModel`, `CacheEntry`, `ReviewScope`)
- **Types**: PascalCase (`ModelRequest`, `ScopeOptions`, `ProviderType`)
- **Constants**: UPPER_SNAKE_CASE (`DefaultConfig`, `redactionPaths`, `errorCodes`)
- **Private functions**: Leading underscore (`_setupLogger` in `cli.ts`)

**Imports:**
- **Path aliases**: `@/*` → `./src/*` (configured in `tsconfig.json:paths`)
- **Relative imports**: Used within same domain
- **External imports**: Bare specifiers (`commander`, `zod`, `pino`, `isomorphic-git`)

## Where to Add New Code

**New Command:**
- Implementation: `src/commands/new-command.ts`
- Registration: Add to `src/commands/index.ts` → `registerCommands()`
- Tests: `src/commands/new-command.test.ts`

**New Repository Operation:**
- Implementation: `src/repository/new-operation.ts`
- Export: Add to `src/repository/index.ts` barrel
- Tests: `src/repository/new-operation.test.ts`

**New Model Provider:**
- Implementation: `src/model/providers/new-provider.ts` (Phase 4)
- Factory: Update `src/model/abstraction.ts` → `createModelProvider()`
- Types: Extend `src/model/types.ts` if needed

**New Cache Feature:**
- Implementation: `src/cache/new-feature.ts`
- Export: Add to `src/cache/index.ts` barrel
- Tests: `src/cache/new-feature.test.ts`

**New Config Option:**
- Schema: Add to `src/config/schema.ts` → `OctateConfigSchema`
- Defaults: Update `DefaultConfig` in `schema.ts`
- Merger: Handle in `src/config/merger.ts` if special precedence needed

**Shared Utility:**
- Location: `src/utils/` (create if needed) or appropriate domain directory
- Export: Add to relevant `index.ts` barrel

**Domain Types:**
- Location: `src/types/index.ts` (if cross-cutting) or domain-specific `types.ts`
- Guards: Add `isXxx()` type guard function

## Special Directories

**dist/**
- **Purpose**: Compiled output for distribution
- **Generated**: Yes (`npm run build` → `tsc`)
- **Committed**: Yes (required for `bin` entry point)

**node_modules/**
- **Purpose**: Dependencies
- **Generated**: Yes (`pnpm install`)
- **Committed**: No (in `.gitignore`)

**coverage/**
- **Purpose**: Jest coverage reports
- **Generated**: Yes (`npm test`)
- **Committed**: No (in `.gitignore`)

**.planning/**
- **Purpose**: GSD planning artifacts (codebase maps, phase plans, research)
- **Generated**: Partially (by GSD commands)
- **Committed**: Yes

**.opencode/**
- **Purpose**: OpenCode agent configuration
- **Generated**: No
- **Committed**: Yes

---

*Structure analysis: 2026-09-08*
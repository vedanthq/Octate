# Codebase Structure

**Analysis Date:** 2026-09-10

## Directory Layout

```
Octate/
├── src/                          # Source code (TypeScript)
│   ├── cli.ts                    # CLI entry point (Commander setup & global error handling)
│   ├── analysis/                 # Deterministic analysis layer (Phase 2)
│   │   ├── index.ts              # Analysis public API barrel
│   │   ├── types.ts              # Analysis domain types (ParsedFile, Symbol, AnalysisResult)
│   │   ├── orchestrator.ts       # Analysis orchestrator (pipeline: parse → symbols → diagnostics)
│   │   ├── orchestrator.test.ts  # Orchestrator pipeline integration tests
│   │   ├── parser/               # WebAssembly Tree-sitter parsing
│   │   │   ├── index.ts          # Tree-sitter parser initialization & AST generation
│   │   │   ├── index.test.ts     # Parser tests (TS/JS/Python)
│   │   │   ├── languages.ts      # Language detection & grammar loading
│   │   │   └── languages.test.ts # Language detection tests
│   │   ├── symbols/              # AST symbol extraction
│   │   │   ├── index.ts          # Symbol extractor (classes, functions, interfaces, vars)
│   │   │   ├── index.test.ts     # Symbol extractor tests
│   │   │   └── queries.ts        # Tree-sitter S-expression query definitions
│   │   └── diagnostics/          # Static analysis tool execution & normalization
│   │       ├── index.ts          # Parallel diagnostics collector with bounded concurrency
│   │       ├── index.test.ts     # Diagnostics collector tests
│   │       ├── severity.ts       # Severity normalization (critical/high/medium/low/info)
│   │       ├── severity.test.ts  # Severity mapping tests
│   │       ├── tools.ts          # Subprocess tool execution (tsc, biome, ruff, mypy, pyright, bandit, pytest)
│   │       └── tools.test.ts     # Tool runner tests
│   ├── repository/               # Git/repository operations
│   │   ├── index.ts              # Public API barrel
│   │   ├── discovery.ts          # Git root + workspace detection
│   │   ├── git.ts                # isomorphic-git wrapper (diff, log, status, refs)
│   │   ├── scope.ts              # Scope resolution (--staged, --commit, --range, --branch)
│   │   ├── filter.ts             # File filtering (binary, generated, symlinks, size)
│   │   ├── ignore.ts             # .gitignore & .octateignore parsing
│   │   ├── monorepo.ts           # Monorepo workspace detection (pnpm, npm, yarn, cargo)
│   │   └── *.test.ts             # Tests for each repository module
│   ├── model/                    # AI model abstraction layer
│   │   ├── index.ts              # Public API barrel
│   │   ├── types.ts              # Request/response types, Finding, Diagnostic contracts
│   │   ├── abstraction.ts        # ReviewModel interface + provider factory
│   │   └── abstraction.test.ts   # Model abstraction tests
│   ├── cache/                    # File-based caching with LRU eviction
│   │   ├── index.ts              # Public API barrel
│   │   ├── store.ts              # CacheStore class (atomic writes, size tracking)
│   │   ├── keys.ts               # Cache key generation (AST, index, tool result, config hash)
│   │   ├── lru.ts                # In-memory LRU cache
│   │   ├── pool.ts               # PromisePool for concurrency control (p-limit wrapper)
│   │   ├── identity.ts           # Cache directory + project identity hashing
│   │   └── *.test.ts             # Tests for each cache module
│   ├── config/                   # Configuration system
│   │   ├── index.ts              # Public API barrel
│   │   ├── schema.ts             # Zod schemas + DefaultConfig
│   │   ├── loader.ts             # Config file discovery (cosmiconfig + YAML)
│   │   ├── merger.ts             # Precedence merging (defaults < global < project < env < CLI)
│   │   └── *.test.ts             # Tests for config modules
│   ├── logging/                  # Structured logging
│   │   ├── index.ts              # Pino root logger + createLogger child factory + redaction
│   │   └── index.test.ts         # Logging tests
│   ├── errors/                   # Typed error hierarchy
│   │   ├── index.ts              # Base OctateError + 13 specialized error classes + guards
│   │   └── index.test.ts         # Error hierarchy tests
│   ├── cancellation/             # Cancellation & subprocess management
│   │   ├── index.ts              # Public API barrel
│   │   ├── controller.ts         # CancellationController (AbortController wrapper)
│   │   ├── subprocess.ts         # spawnWithSignal + process tree termination
│   │   └── *.test.ts             # Cancellation tests
│   └── types/                    # Core cross-cutting domain types
│       ├── index.ts              # Repository, Workspace, FileChange, ReviewScope types & guards
│       └── index.test.ts         # Type guard tests
├── test-wasm/                    # WebAssembly grammars for Tree-sitter testing
│   ├── tree-sitter-typescript.wasm
│   └── tree-sitter-python.wasm
├── dist/                         # Compiled JavaScript output (generated by tsc)
│   ├── cli.js                    # Compiled CLI binary entry
│   └── ...                       # Compiled modules mirroring src/
├── .planning/                    # GSD planning artifacts
│   ├── codebase/                 # Codebase maps (STACK, ARCHITECTURE, STRUCTURE, etc.)
│   ├── phases/                   # Phase plans, execution summaries, and manifests
│   ├── research/                 # Architectural and stack research
│   ├── STATE.md                  # Current project state
│   ├── ROADMAP.md                # Milestone and phase roadmap
│   ├── REQUIREMENTS.md           # Requirement specifications
│   └── PROJECT.md                # Project core value and constraints
├── .opencode/                    # OpenCode configuration
│   ├── skills/                   # Project skills
│   └── rules/                    # Project rules
├── node_modules/                 # Node.js dependencies (ignored)
├── coverage/                     # Jest coverage reports (ignored)
├── package.json                  # Project manifest, dependencies, and bin entry
├── pnpm-lock.yaml                # Lockfile
├── pnpm-workspace.yaml           # pnpm workspace configuration
├── tsconfig.json                 # TypeScript compiler options
├── biome.json                    # Biome linting and formatting rules
├── jest.config.ts                # Jest configuration with ts-jest ESM support
├── octate.yaml                   # Example / default project configuration
└── AGENTS.md                     # Agent conventions and execution rules
```

## Directory Purposes

**src/**: Main source code root
- **Purpose**: All TypeScript implementation files
- **Contains**: Layered architecture modules (CLI, commands, analysis, repository, model, cache, config, logging, errors, cancellation, types)
- **Key files**: `src/cli.ts` (entry), `src/commands/review.ts` (orchestration)

**src/analysis/**: Deterministic Analysis Layer (Phase 2)
- **Purpose**: Fast AST parsing, symbol extraction, and static analysis diagnostic collection
- **Contains**: `orchestrator.ts`, `types.ts`, `parser/`, `symbols/`, `diagnostics/`
- **Key files**: `src/analysis/orchestrator.ts` (unified pipeline), `src/analysis/parser/index.ts` (Tree-sitter WASM parser), `src/analysis/symbols/index.ts` (symbol extraction), `src/analysis/diagnostics/index.ts` (parallel tool execution)

**src/analysis/parser/**: WebAssembly Tree-sitter AST Parser
- **Purpose**: Language-aware concrete syntax tree parsing without native compilation dependencies
- **Contains**: Parser lifecycle management, WASM binary loading, language detection
- **Key files**: `index.ts` (Parser initialization and file parsing), `languages.ts` (Language resolution for TS/JS and Python)

**src/analysis/symbols/**: AST Symbol Extraction
- **Purpose**: Extract high-level declarations (classes, functions, methods, interfaces, variables) with line numbers and signatures
- **Contains**: S-expression query definitions and AST symbol extraction logic
- **Key files**: `index.ts` (extractSymbols), `queries.ts` (TS and Python tree-sitter queries)

**src/analysis/diagnostics/**: External Static Analysis & Linting Diagnostics
- **Purpose**: Detect and run available linters, typecheckers, and security tools; normalize output into unified `Diagnostic[]`
- **Contains**: Tool detection, execution via `spawnWithSignal`, severity normalization
- **Key files**: `tools.ts` (tool configs and detection), `severity.ts` (severity mapping), `index.ts` (parallel execution pool)

**src/commands/**: CLI Subcommand Implementations
- **Purpose**: Business logic and command handlers for `octate` subcommands
- **Contains**: `review.ts`, `init.ts`, `doctor.ts`, command registry, and tests
- **Key files**: `src/commands/review.ts` (main review command), `src/commands/doctor.ts` (system and tool diagnostics), `src/commands/init.ts` (config scaffolding)

**src/repository/**: Git and Filesystem Operations
- **Purpose**: Repository discovery, Git history, scope resolution, file filtering, and ignore rules
- **Contains**: `git.ts`, `scope.ts`, `discovery.ts`, `filter.ts`, `ignore.ts`, `monorepo.ts`, and tests
- **Key files**: `git.ts` (isomorphic-git wrapper), `scope.ts` (scope resolution), `filter.ts` (binary/generated filter), `monorepo.ts` (workspace detection)

**src/model/**: AI Model Abstraction Layer
- **Purpose**: Provider-agnostic interfaces and data contracts for code review reasoning
- **Contains**: `types.ts`, `abstraction.ts`, and tests
- **Key files**: `types.ts` (ModelRequest, ModelResponse, Finding, Diagnostic interfaces), `abstraction.ts` (ReviewModel interface)

**src/cache/**: Local Caching & Concurrency
- **Purpose**: Content-addressable cache store with LRU eviction and concurrency control
- **Contains**: `store.ts`, `keys.ts`, `lru.ts`, `pool.ts`, `identity.ts`, and tests
- **Key files**: `store.ts` (CacheStore implementation), `keys.ts` (Cache key generators for files, indices, and tool runs), `pool.ts` (PromisePool)

**src/config/**: Configuration System
- **Purpose**: Configuration loading, schema validation, and hierarchical merging
- **Contains**: `schema.ts`, `loader.ts`, `merger.ts`, and tests
- **Key files**: `schema.ts` (Zod schemas and defaults), `loader.ts` (cosmiconfig and YAML parsing), `merger.ts` (precedence resolution)

**src/logging/**: Structured Logging
- **Purpose**: Fast structured JSON logging with automatic secret redaction
- **Contains**: Pino instance configuration and child logger factory
- **Key files**: `index.ts` (root logger, `createLogger`, redaction paths)

**src/errors/**: Typed Error Hierarchy
- **Purpose**: Domain-specific error classes with deterministic exit codes and structured context
- **Contains**: `OctateError`, `ConfigurationError`, `GitError`, `AnalysisError`, `ModelError`, etc.
- **Key files**: `index.ts` (Error classes, factory helpers, type guards)

**src/cancellation/**: Process Cancellation & Subprocess Control
- **Purpose**: Graceful task cancellation, signal propagation, and subprocess process-tree termination
- **Contains**: `controller.ts`, `subprocess.ts`, and tests
- **Key files**: `controller.ts` (CancellationController), `subprocess.ts` (spawnWithSignal and killProcessTree)

**src/types/**: Core Domain Types
- **Purpose**: Cross-cutting types shared across layers (Repository, Workspace, FileChange, ReviewScope)
- **Contains**: Core TypeScript interfaces and type guards
- **Key files**: `index.ts`

**test-wasm/**: Tree-sitter WebAssembly Binaries
- **Purpose**: Precompiled WASM grammars for TypeScript and Python AST parsing in tests and analysis
- **Contains**: `tree-sitter-typescript.wasm`, `tree-sitter-python.wasm`

## Key File Locations

**Entry Points:**
- `src/cli.ts` — Main CLI entry point, Commander initialization, global exception handling
- `package.json:bin.octate` → `./dist/cli.js` — Executable binary target

**Configuration:**
- `src/config/schema.ts` — Zod schemas (`OctateConfigSchema`, `ReviewConfigSchema`, etc.)
- `src/config/merger.ts` — Config merging logic with strict precedence
- `src/config/loader.ts` — File search via cosmiconfig and YAML parsing
- `biome.json` — Linting and code formatting configuration
- `tsconfig.json` — TypeScript compiler configuration
- `jest.config.ts` — Jest test runner configuration

**Core Analysis & Review Logic:**
- `src/analysis/orchestrator.ts` — Orchestrates parse → symbols → diagnostics pipeline
- `src/analysis/parser/index.ts` — WebAssembly Tree-sitter parsing engine
- `src/analysis/symbols/index.ts` — AST symbol extraction
- `src/analysis/diagnostics/index.ts` — Parallel diagnostics collection with bounded concurrency
- `src/analysis/diagnostics/tools.ts` — Tool detection and subprocess execution
- `src/commands/review.ts` — Review subcommand execution flow
- `src/repository/git.ts` — Git operations via isomorphic-git
- `src/repository/scope.ts` — Scope flag parsing and diff resolution
- `src/cache/store.ts` — Cache store with atomic write guarantees
- `src/cache/keys.ts` — Cache key generation for ASTs and tool diagnostics

**Testing:**
- `src/**/*.test.ts` — Co-located unit and integration tests (30 suites, 439 tests)
- `jest.config.ts` — Jest configuration with ts-jest ESM preset

## Naming Conventions

**Files:**
- **Modules**: kebab-case (`git.ts`, `scope.ts`, `orchestrator.ts`, `severity.ts`)
- **Tests**: `*.test.ts` suffix co-located next to the module being tested
- **Barrel exports**: `index.ts` in each feature directory
- **Types**: `types.ts` for domain models, `schema.ts` for Zod schemas

**Directories:**
- **Feature-based**: Grouped by domain (`analysis/`, `repository/`, `cache/`, `model/`, `commands/`)
- **Sub-features**: Grouped logically within domains (`analysis/parser/`, `analysis/symbols/`, `analysis/diagnostics/`)

**Code:**
- **Functions**: camelCase (`analyzeCodebase`, `extractSymbols`, `runDiagnostics`, `resolveScope`)
- **Classes**: PascalCase (`AnalysisOrchestrator`, `TreeSitterParser`, `CacheStore`, `CancellationController`)
- **Interfaces / Types**: PascalCase (`AnalysisResult`, `ParsedFile`, `Symbol`, `Diagnostic`, `ReviewScope`)
- **Constants**: UPPER_SNAKE_CASE (`TOOL_DEFINITIONS`, `SEVERITY_LEVELS`, `DefaultConfig`)

## Where to Add New Code

**New Static Analysis Tool:**
- Configuration: Add entry to `TOOL_DEFINITIONS` in `src/analysis/diagnostics/tools.ts`
- Severity mapping: Add tool parser/mapping to `src/analysis/diagnostics/severity.ts`
- Tests: Add tool detection/normalization cases in `src/analysis/diagnostics/tools.test.ts` and `severity.test.ts`

**New Language Grammar / Parser:**
- WASM binary: Place `.wasm` grammar file into WASM path (e.g., `test-wasm/` or configured WASM directory)
- Grammar loading: Update language loader in `src/analysis/parser/languages.ts`
- Queries: Define symbol queries in `src/analysis/symbols/queries.ts`
- Tests: Add parser test in `src/analysis/parser/languages.test.ts`

**New Command:**
- Implementation: `src/commands/<name>.ts`
- Registration: Register in `src/commands/index.ts`
- Tests: `src/commands/<name>.test.ts`

**New Cache Key / Strategy:**
- Implementation: Add key generation helper in `src/cache/keys.ts`
- Tests: `src/cache/keys.test.ts`

**New Config Option:**
- Schema: Add field to `src/config/schema.ts`
- Defaults: Update `DefaultConfig` in `src/config/schema.ts`
- Merger: Update `src/config/merger.ts` if custom merging required

## Special Directories

**test-wasm/**
- **Purpose**: Precompiled Tree-sitter WebAssembly grammars (`tree-sitter-typescript.wasm`, `tree-sitter-python.wasm`)
- **Generated**: Built via Tree-sitter CLI / grammar packages
- **Committed**: Yes (required for testing and parsing runtime)

**dist/**
- **Purpose**: Compiled JavaScript artifacts for CLI execution
- **Generated**: Yes (`pnpm run build` → `tsc`)
- **Committed**: Yes (distributed with the package)

**coverage/**
- **Purpose**: Test coverage output
- **Generated**: Yes (`pnpm test`)
- **Committed**: No (in `.gitignore`)

**.planning/**
- **Purpose**: GSD planning, architecture documents, phase trackers, codebase maps
- **Generated**: Partially (via GSD workflows)
- **Committed**: Yes

---

*Structure analysis: 2026-09-10*
*Update when directory structure or architecture changes*
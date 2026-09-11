# Codebase Structure

**Analysis Date:** 2026-09-11

## Directory Layout

```
Octate/
├── src/                          # Source code (TypeScript)
│   ├── cli.ts                    # CLI entry point (Commander setup & global error handling)
│   ├── commands/                 # CLI subcommand handlers
│   │   ├── index.ts              # Command registration barrel
│   │   ├── review.ts             # Review subcommand (analysis → context → review engine)
│   │   ├── review.test.ts        # Review command integration tests
│   │   ├── doctor.ts             # Doctor environment diagnostics (node, git, tools, nvidia)
│   │   ├── doctor.test.ts        # Doctor command tests
│   │   ├── init.ts               # Init configuration scaffolding
│   │   └── init.test.ts          # Init command tests
│   ├── repository/               # Layer 1: Git/repository operations
│   │   ├── index.ts              # Public API barrel
│   │   ├── discovery.ts          # Git root + workspace detection
│   │   ├── git.ts                # isomorphic-git wrapper (diff, log, status, refs)
│   │   ├── scope.ts              # Scope resolution (--staged, --commit, --range, --branch)
│   │   ├── filter.ts             # File filtering (binary, generated, symlinks, size)
│   │   ├── ignore.ts             # .gitignore & .octateignore parsing
│   │   ├── monorepo.ts           # Monorepo workspace detection (pnpm, npm, yarn, cargo)
│   │   └── *.test.ts             # Unit tests for repository modules
│   ├── analysis/                 # Layer 2: Deterministic analysis layer
│   │   ├── index.ts              # Analysis public API barrel
│   │   ├── types.ts              # Domain types (ParsedFile, Symbol, AnalysisResult)
│   │   ├── orchestrator.ts       # Analysis pipeline (parse → symbols → diagnostics)
│   │   ├── orchestrator.test.ts  # Orchestrator pipeline integration tests
│   │   ├── parser/               # WebAssembly Tree-sitter parsing
│   │   │   ├── index.ts          # Parser initialization & AST generation
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
│   ├── intelligence/             # Layer 3: Intelligence & Context Engine
│   │   ├── index.ts              # Intelligence public API barrel
│   │   ├── types.ts              # Domain types (ReferenceGraph, DependencyGraph, ReviewContext)
│   │   ├── index/                # Multi-file symbol indexing & resolution
│   │   │   ├── symbol-index.ts   # In-memory symbol index with range & fuzzy lookup
│   │   │   ├── symbol-index.test.ts
│   │   │   ├── path-resolver.ts  # Cross-file import path resolution
│   │   │   └── path-resolver.test.ts
│   │   ├── graph/                # Dependency & reference relationship graphs
│   │   │   ├── reference.ts      # Reference graph (callers/callees, callers reverse lookup)
│   │   │   ├── reference.test.ts
│   │   │   ├── dependency.ts     # Package & internal module dependency graph
│   │   │   └── dependency.test.ts
│   │   └── context/              # Context Engine & prompt context serialization
│   │       ├── engine.ts         # Candidate ranking & ReviewContext assembly
│   │       ├── engine.test.ts
│   │       ├── budget.ts         # Token budgeting and estimation
│   │       ├── budget.test.ts
│   │       ├── windowing.ts      # Context snippet extraction and windowing
│   │       ├── windowing.test.ts
│   │       ├── serializer.ts     # Sandwich prompt framing & trust demarcation
│   │       └── serializer.test.ts
│   ├── model/                    # Layer 4: AI Model Provider & Structured Outputs
│   │   ├── index.ts              # Model public API barrel
│   │   ├── types.ts              # Request/response types, Finding, Diagnostic contracts
│   │   ├── abstraction.ts        # ReviewModel interface + createModelProvider factory
│   │   ├── abstraction.test.ts
│   │   ├── prompts/              # Versioned markdown prompts & template rendering
│   │   │   ├── template.ts       # Regex template engine for variables & blocks
│   │   │   ├── template.test.ts
│   │   │   ├── fallbacks.ts      # In-memory prompt fallbacks
│   │   │   ├── fallbacks.test.ts
│   │   │   ├── reviewer.structural.v1.md
│   │   │   ├── reviewer.semantic.v1.md
│   │   │   ├── reviewer.security.v1.md
│   │   │   └── critic.v1.md
│   │   ├── schema/               # Zod schemas, JSON extraction, grounding & repair
│   │   │   ├── finding.ts        # FindingsPayloadSchema with Zod AOT compilation
│   │   │   ├── finding.test.ts
│   │   │   ├── extractor.ts      # Markdown code fence & trailing comma stripping
│   │   │   ├── extractor.test.ts
│   │   │   ├── grounding.ts      # File existence & line bounds clamping
│   │   │   ├── grounding.test.ts
│   │   │   ├── repair.ts         # Actionable error formatting for 2-turn repair loop
│   │   │   └── repair.test.ts
│   │   └── providers/            # Provider implementations & resilience
│   │       ├── nvidia.ts         # LocalNvidiaProvider using native fetch
│   │       ├── nvidia.test.ts
│   │       ├── resilience.ts     # 60s timeout, exponential backoff, retry, pool(2)
│   │       └── resilience.test.ts
│   ├── review/                   # Layer 5: Review Engine
│   │   ├── index.ts              # Authoritative public API barrel
│   │   ├── types.ts              # ReviewEngine domain models (ReviewResult, RankedFinding, etc.)
│   │   ├── heuristics.ts         # AST executable logic & security pattern triggers
│   │   ├── heuristics.test.ts
│   │   ├── dag.ts                # Staged DAG concurrency runner with graceful degradation
│   │   ├── dag.test.ts
│   │   ├── critic.ts             # Two-stage Critic quality gate (hard floor + critic.v1)
│   │   ├── critic.test.ts
│   │   ├── dedup.ts              # Multi-factor duplicate clustering & evidence merging
│   │   ├── dedup.test.ts
│   │   ├── ranking.ts            # 6-factor composite scoring & Critical-protection truncation
│   │   ├── ranking.test.ts
│   │   ├── engine.ts             # End-to-end ReviewEngine orchestrator (Stages 1–5)
│   │   ├── engine.test.ts
│   │   └── __tests__/
│   │       └── mocks.ts          # Test fixtures and MockReviewModel
│   ├── cache/                    # Infrastructure: File-based caching with LRU eviction
│   │   ├── index.ts              # Public API barrel
│   │   ├── store.ts              # CacheStore class (atomic writes, size tracking)
│   │   ├── keys.ts               # Cache key generation (AST, index, tool result, config hash)
│   │   ├── lru.ts                # In-memory LRU cache
│   │   ├── pool.ts               # PromisePool for concurrency control (p-limit wrapper)
│   │   ├── identity.ts           # Cache directory + project identity hashing
│   │   └── *.test.ts
│   ├── config/                   # Infrastructure: Configuration system
│   │   ├── index.ts              # Public API barrel
│   │   ├── schema.ts             # Zod schemas + DefaultConfig
│   │   ├── loader.ts             # Config file discovery (cosmiconfig + YAML)
│   │   ├── merger.ts             # Precedence merging (defaults < global < project < env < CLI)
│   │   └── *.test.ts
│   ├── logging/                  # Infrastructure: Structured logging
│   │   ├── index.ts              # Pino root logger + createLogger child factory + redaction
│   │   └── index.test.ts
│   ├── errors/                   # Infrastructure: Typed error hierarchy
│   │   ├── index.ts              # Base OctateError + 13 specialized error classes + guards
│   │   └── index.test.ts
│   ├── cancellation/             # Infrastructure: Cancellation & subprocess management
│   │   ├── index.ts              # Public API barrel
│   │   ├── controller.ts         # CancellationController (AbortController wrapper)
│   │   ├── subprocess.ts         # spawnWithSignal + process tree termination
│   │   └── *.test.ts
│   └── types/                    # Cross-cutting domain types
│       ├── index.ts              # Repository, Workspace, FileChange, ReviewScope types & guards
│       └── index.test.ts
├── test-wasm/                    # WebAssembly grammars for Tree-sitter
│   ├── tree-sitter-typescript.wasm
│   └── tree-sitter-python.wasm
├── dist/                         # Compiled JavaScript output (generated by tsc)
│   ├── cli.js                    # Compiled CLI binary entry
│   └── ...
├── .planning/                    # GSD planning artifacts
│   ├── codebase/                 # Codebase maps (STACK, ARCHITECTURE, STRUCTURE, etc.)
│   ├── phases/                   # Phase plans, execution summaries, and verification reports
│   ├── research/                 # Architectural and stack research
│   ├── STATE.md                  # Current project state
│   ├── ROADMAP.md                # Milestone and phase roadmap
│   ├── REQUIREMENTS.md           # Requirement specifications
│   └── PROJECT.md                # Project core value and constraints
├── package.json                  # Project manifest, dependencies, and bin entry
├── pnpm-lock.yaml                # Lockfile
├── tsconfig.json                 # TypeScript compiler options
├── biome.json                    # Biome linting and formatting rules
├── jest.config.ts                # Jest configuration with ts-jest ESM support
└── AGENTS.md                     # Agent conventions and execution rules
```

## Directory Purposes

**src/repository/**: Layer 1 — Git and Filesystem Operations
- **Purpose**: Repository discovery, Git history, scope resolution, file filtering, and ignore rules.
- **Key files**: `git.ts` (isomorphic-git wrapper), `scope.ts` (scope resolution), `filter.ts` (binary/generated filter), `monorepo.ts` (workspace detection).

**src/analysis/**: Layer 2 — Deterministic Analysis Layer
- **Purpose**: Fast AST parsing, symbol extraction, and static analysis diagnostic collection.
- **Key files**: `orchestrator.ts` (unified pipeline), `parser/index.ts` (Tree-sitter WASM parser), `symbols/index.ts` (symbol extraction), `diagnostics/index.ts` (parallel tool execution).

**src/intelligence/**: Layer 3 — Repository Intelligence & Context Engine
- **Purpose**: Cross-file reference tracking, dependency graphs, token-budgeted snippet windowing, and prompt context serialization.
- **Key files**: `index/symbol-index.ts` (multi-file symbol search), `graph/reference.ts` (directed reference graph with `getIncoming`), `context/engine.ts` (candidate ranking & budget allocation), `context/serializer.ts` (sandwich prompt serialization).

**src/model/**: Layer 4 — AI Model Provider & Structured Outputs
- **Purpose**: NVIDIA Nemotron API integration, versioned prompt definitions, Zod schema validation, grounding, and 2-turn error repair.
- **Key files**: `providers/nvidia.ts` (LocalNvidiaProvider), `providers/resilience.ts` (retry, backoff, timeout, concurrency pool of 2), `schema/finding.ts` (compiled findings schema), `schema/grounding.ts` (line clamps & path verification), `schema/repair.ts` (repair prompt generator).

**src/review/**: Layer 5 — Review Engine
- **Purpose**: Review DAG scheduling, two-stage Critic filtering, multi-factor finding deduplication, confidence-weighted composite ranking, and authoritative ReviewResult creation.
- **Key files**: `heuristics.ts` (AST logic & security pattern triggers), `dag.ts` (staged Review DAG runner), `critic.ts` (deterministic hard floor + LLM Critic), `dedup.ts` (clustering & evidence merging), `ranking.ts` (0-100 composite ranking), `engine.ts` (end-to-end review engine).

**src/commands/**: CLI Subcommand Implementations
- **Purpose**: User-facing command routing and CLI pipeline integration.
- **Key files**: `src/commands/review.ts` (main review command), `src/commands/doctor.ts` (system/model diagnostics), `src/commands/init.ts` (config scaffolding).

**src/cache/**: Local Caching & Concurrency
- **Purpose**: Content-addressable cache store with LRU eviction and concurrency control (`PromisePool`).

**src/config/**: Configuration System
- **Purpose**: Hierarchical configuration loading, schema validation with Zod, and precedence merging.

**src/logging/**: Structured Logging
- **Purpose**: Fast Pino JSON logger with child context loggers and automated credential redaction.

**src/errors/**: Typed Error Hierarchy
- **Purpose**: Domain-specific error classes with deterministic exit codes (0=success, 2=config, 3=repo/analysis/context, 4=model/provider, 5=validation/internal).

**src/cancellation/**: Process Cancellation
- **Purpose**: Graceful task cancellation, signal propagation, and subprocess process-tree cleanup.

## Key File Locations

**Entry Points:**
- `src/cli.ts` — Main CLI entry point, Commander initialization, global exception handling.
- `package.json:bin.octate` → `./dist/cli.js` — Executable binary target.

**Configuration:**
- `src/config/schema.ts` — Zod schemas (`OctateConfigSchema`, `ReviewConfigSchema`, etc.).
- `src/config/merger.ts` — Config merging logic with strict precedence.
- `src/config/loader.ts` — File search via cosmiconfig and YAML parsing.
- `biome.json` — Linting and code formatting configuration.
- `tsconfig.json` — TypeScript compiler configuration.
- `jest.config.ts` — Jest test runner configuration.

**Review Engine Pipeline:**
- `src/commands/review.ts` — Connects repository discovery, analysis orchestrator, context engine, and review engine.
- `src/review/engine.ts` — Review engine orchestrator executing Stages 1–5.
- `src/review/dag.ts` — Runs Structural reviewer unconditionally, Semantic & Security conditionally.
- `src/review/critic.ts` — Hard floor pre-filter + LLM Critic verification.
- `src/review/dedup.ts` — Multi-factor duplicate clustering and evidence merging.
- `src/review/ranking.ts` — 6-factor composite scoring and Critical-protected truncation.

**Testing:**
- `src/**/*.test.ts` — Co-located unit and integration tests (54 suites, 631 tests).
- `jest.config.ts` — Jest configuration with ts-jest ESM preset.

## Naming Conventions

**Files:**
- **Modules**: kebab-case (`git.ts`, `scope.ts`, `orchestrator.ts`, `symbol-index.ts`, `ranking.ts`).
- **Tests**: `*.test.ts` suffix co-located next to the module being tested.
- **Barrel exports**: `index.ts` in each feature directory.
- **Types**: `types.ts` for domain models, `schema.ts` for Zod schemas.

**Directories:**
- **Feature-based**: Grouped by domain (`repository/`, `analysis/`, `intelligence/`, `model/`, `review/`, `commands/`).
- **Sub-features**: Grouped logically within domains (`intelligence/graph/`, `model/prompts/`, `review/__tests__/`).

**Code:**
- **Functions**: camelCase (`analyzeCodebase`, `extractSymbols`, `createReviewEngine`, `filterDeterministicHardFloor`).
- **Classes**: PascalCase (`AnalysisOrchestrator`, `SymbolIndex`, `ReferenceGraph`, `LocalNvidiaProvider`, `ReviewEngine`).
- **Interfaces / Types**: PascalCase (`ReviewResult`, `RankedFinding`, `ModelRequest`, `ModelFinding`, `ReviewScope`).
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CONFIG`, `SEVERITY_WEIGHTS`, `RANKING_WEIGHTS`).

---

*Structure analysis: 2026-09-11*
*Update when directory structure or architecture changes*

<!-- refreshed: 2026-09-08 -->
# Architecture

**Analysis Date:** 2026-09-08

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          CLI Layer (src/cli.ts)                      │
│  Commander.js entry point, global options, command registration      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Commands Layer (src/commands/)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │   review    │  │    init     │  │          doctor              │  │
│  │  command    │  │  command    │  │        command               │  │
│  │ src/com-    │  │ src/com-    │  │  src/commands/doctor.ts      │  │
│  │ mands/re-   │  │ mands/init.ts│  │                              │  │
│  │ view.ts     │  │             │  │                              │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘  │
└─────────┼────────────────┼────────────────────────┼──────────────────┘
          │                │                        │
          ▼                ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Repository Layer (src/repository/)               │
│  ┌───────────┐ ┌────────┐ ┌──────────┐ ┌───────┐ ┌────────┐       │
│  │ discovery │ │   git  │ │  scope   │ │filter │ │ignore  │       │
│  │ .ts       │ │  .ts   │ │  .ts     │ │ .ts   │ │ .ts    │       │
│  └───────────┘ └────────┘ └──────────┘ └───────┘ └────────┘       │
│  ┌──────────────┐ ┌────────────┐                                    │
│  │  monorepo.ts │ │  index.ts  │                                    │
│  └──────────────┘ └────────────┘                                    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Core Abstractions Layer                         │
│  ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │   Model     │  │  Cache   │  │ Config   │  │   Logging       │  │
│  │  (src/model)│  │ (src/    │  │ (src/    │  │ (src/logging)   │  │
│  │             │  │  cache)  │  │  config) │  │                 │  │
│  └─────────────┘  └──────────┘  └──────────┘  └─────────────────┘  │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐   │
│  │  Errors        │  │  Cancellation   │  │  Types             │   │
│  │ (src/errors)   │  │ (src/cancella-  │  │ (src/types)        │   │
│  │                │  │  tion)          │  │                    │   │
│  └────────────────┘  └─────────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     External Dependencies                             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ isomorphic-  │ │   Tree-      │ │  NVIDIA    │ │  File       │  │
│  │ git          │ │  sitter      │ │  API       │ │  System     │  │
│  │ (Git ops)    │ │  (Parsing)   │ │  (Model)   │ │  (Cache)    │  │
│  └──────────────┘ └──────────────┘ └────────────┘ └─────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **CLI Entry** | Commander.js program setup, global options, error handling, main() | `src/cli.ts` |
| **Command Registry** | Registers all subcommands (init, review, doctor) | `src/commands/index.ts` |
| **Review Command** | Scope validation, config loading, review execution, output formatting (JSON/SARIF/quiet/TUI) | `src/commands/review.ts` |
| **Init Command** | Project initialization, config file creation | `src/commands/init.ts` |
| **Doctor Command** | Environment diagnostics, Git/config validation | `src/commands/doctor.ts` |
| **Repository Discovery** | Finds Git root, detects monorepo, aggregates workspaces | `src/repository/discovery.ts` |
| **Git Operations** | Diff, status, log, ref resolution, staged/working tree diffs via isomorphic-git | `src/repository/git.ts` |
| **Scope Resolution** | Parses CLI flags (--staged, --working, --commit, --range, --branch) into ReviewScope | `src/repository/scope.ts` |
| **File Filtering** | Filters files by binary/generated/symlink, applies ignore patterns | `src/repository/filter.ts` |
| **Ignore Matching** | Parses .gitignore patterns, creates matchers | `src/repository/ignore.ts` |
| **Monorepo Detection** | Detects pnpm/npm/yarn/turbo/nx workspaces, expands patterns | `src/repository/monorepo.ts` |
| **Model Abstraction** | ReviewModel interface for AI providers, request/response types, prompt injection protection | `src/model/types.ts`, `src/model/abstraction.ts` |
| **Cache Layer** | File-based LRU cache with atomic writes, key generation, promise pools | `src/cache/` |
| **Configuration** | Schema validation (Zod), config discovery (cosmiconfig), precedence merging | `src/config/` |
| **Logging** | Pino-based structured logging with redaction, child loggers | `src/logging/index.ts` |
| **Error Hierarchy** | Typed errors with exit codes, factory functions, type guards | `src/errors/index.ts` |
| **Cancellation** | AbortController wrapper, subprocess management with signal propagation | `src/cancellation/` |
| **Domain Types** | Repository, Workspace, FileChange, ReviewScope, type guards | `src/types/index.ts` |

## Pattern Overview

**Overall:** Layered architecture with clear separation of concerns

**Key Characteristics:**
- **Dependency Inversion**: Core review logic depends on `ReviewModel` abstraction (`src/model/abstraction.ts`), not concrete providers
- **CLI-First**: Commander.js drives all user interactions; commands are thin orchestrators
- **Deterministic First**: Repository/Git analysis runs before any AI reasoning
- **Structured Logging**: All modules use child loggers with `module` binding for traceability
- **Typed Errors**: Hierarchical error classes with exit codes enable automation-friendly CLI
- **Cancellation Propagation**: `AbortSignal` threaded through all async operations
- **Config Precedence**: Defaults < Global < Project < Env < CLI (implemented in `src/config/merger.ts`)

## Layers

### CLI Layer
- **Purpose**: User-facing command parsing, help, version, global options
- **Location**: `src/cli.ts`
- **Contains**: `createProgram()`, `main()`, `runWithCancellation()`, error handler
- **Depends on**: Commands layer, logging, errors, cancellation
- **Used by**: Binary entry point (`package.json` bin)

### Commands Layer
- **Purpose**: Business logic orchestration for each subcommand
- **Location**: `src/commands/`
- **Contains**: `review.ts` (402 lines), `init.ts`, `doctor.ts`, `index.ts`
- **Depends on**: Repository layer, config, logging, cancellation, errors, types
- **Used by**: CLI layer via `registerCommands()`

### Repository Layer
- **Purpose**: All Git and filesystem operations, scope resolution, workspace detection
- **Location**: `src/repository/`
- **Contains**: 
  - `discovery.ts` - Git root finding, workspace detection
  - `git.ts` - isomorphic-git wrapper (diff, status, log, refs)
  - `scope.ts` - CLI flag → ReviewScope resolution
  - `filter.ts` - Binary/generated/symlink filtering
  - `ignore.ts` - .gitignore parsing and matching
  - `monorepo.ts` - Workspace detection and aggregation
  - `index.ts` - Public API barrel export
- **Depends on**: isomorphic-git, Node.js fs, logging, errors, types
- **Used by**: Commands layer

### Core Abstractions Layer
- **Purpose**: Cross-cutting infrastructure used by all layers
- **Location**: `src/model/`, `src/cache/`, `src/config/`, `src/logging/`, `src/errors/`, `src/cancellation/`, `src/types/`
- **Contains**: Interfaces, implementations, utilities
- **Depends on**: Minimal external deps (Zod, Pino, Node.js built-ins)
- **Used by**: All upper layers

## Data Flow

### Primary Request Path (Review Command)

1. **CLI Entry** (`src/cli.ts:100`) → `main()` parses args, creates Commander program
2. **Command Registration** (`src/commands/index.ts:13`) → `registerCommands()` adds subcommands
3. **Review Action** (`src/commands/review.ts:36`) → `runReview()` invoked with cancellation controller
4. **Scope Validation** (`src/commands/review.ts:68`) → `validateScope()` ensures exactly one scope flag
5. **Git Root Discovery** (`src/commands/review.ts:146`) → `findGitRoot()` walks up directory tree
6. **Config Loading** (`src/commands/review.ts:154`) → `loadConfig()` merges defaults/global/project/env/CLI
7. **Scope Resolution** (`src/commands/review.ts:165`) → `resolveScope()` converts flags to `ReviewScope`
   - Calls `getStagedDiff()`, `getWorkingDiff()`, `getDiff()` via `git.ts`
   - Calls `getParentCommit()`, `findMergeBase()`, `resolveRef()` via `git.ts`
8. **Review Execution** (`src/commands/review.ts:173`) → `executeReview()` placeholder (Phase 5+)
   - Will integrate: Context Engine → Model Abstraction → Output formatting
9. **Output Formatting** (`src/commands/review.ts:249`) → `outputResults()` → JSON/SARIF/quiet/TUI
10. **Result Output** → stdout or file via `--output`

### Configuration Loading Flow

1. `loadConfig()` in `src/config/merger.ts`
2. `findConfigFile()` in `src/config/loader.ts` (uses cosmiconfig)
3. `loadGlobalConfig()` → `~/.config/octate/octate.yaml`
4. `loadProjectConfig()` → `octate.yaml` in repo root
5. `parseEnvConfig()` → `OCTATE_*` env vars
6. `mergeConfigs()` → precedence: defaults < global < project < env < cli
7. `OctateConfigSchema.parse()` → Zod validation

### Cache Operations Flow

1. `createCacheStore()` in `src/cache/store.ts:297` → initializes with size tracking
2. `generateCacheKey()` in `src/cache/keys.ts` → SHA-256 of components
3. `CacheStore.get/set/delete` → file-based with atomic writes (temp + rename)
4. LRU eviction when `maxSize` exceeded (500MB default)

## Key Abstractions

### ReviewModel Interface
- **Purpose**: Core depends on this, not NVIDIA specifics
- **Location**: `src/model/types.ts:149`, `src/model/abstraction.ts:21`
- **Pattern**: Interface segregation — only `generate(request)` method
- **Implementations**: `LocalNvidiaProvider`, `HostedProvider` (Phase 4)
- **Request Structure**: Enforces trusted/untrusted separation for prompt injection protection
  - Trusted: `systemPolicy`, `reviewTask`, `projectRules`, `repoMetadata`, `diagnostics`, `outputSchema`
  - Untrusted: `diff`, `context`

### CacheKey System
- **Purpose**: Deterministic cache keys for incremental indexing
- **Location**: `src/cache/keys.ts`
- **Pattern**: `createAnalysisCacheKey()`, `createIndexCacheKey()`, `generateContentHash()`
- **Components**: file path, content hash, config hash, tool version

### CancellationController
- **Purpose**: Uniform cancellation across async operations and subprocesses
- **Location**: `src/cancellation/controller.ts`
- **Pattern**: Wraps `AbortController`, provides `throwIfAborted()`, `withCancellation()` helper

### Typed Error Hierarchy
- **Purpose**: Exit codes for CI/CD automation, structured error context
- **Location**: `src/errors/index.ts`
- **Codes**: 2=config, 3=repo/git/parse/analysis/context, 4=model/provider/auth/quota, 5=validation/internal

## Entry Points

| Entry Point | Location | Triggers | Responsibilities |
|-------------|----------|----------|------------------|
| `main()` | `src/cli.ts:100` | `octate` binary | Parse args, create program, dispatch to command, handle errors |
| `reviewCommand` action | `src/commands/review.ts:36` | `octate review [refs...]` | Validate scope, find repo, load config, resolve scope, execute review, output |
| `initCommand` action | `src/commands/init.ts` | `octate init` | Create octate.yaml, detect project type |
| `doctorCommand` action | `src/commands/doctor.ts` | `octate doctor` | Check Node version, Git, config validity, cache dir |

## Architectural Constraints

- **Threading**: Single-threaded Node.js event loop; `p-limit`/`p-queue` for controlled concurrency (no worker threads yet)
- **Global State**: Module-level logger singleton (`src/logging/index.ts:79`) with child loggers; cache store instances created per-command
- **Circular Imports**: None detected — strict layering (CLI → Commands → Repository → Core)
- **ES Modules Only**: `"type": "module"` in package.json; all imports use `.js` extensions
- **Strict TypeScript**: `"strict": true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

## Anti-Patterns

### Direct isomorphic-git Usage in Commands
**What happens:** Commands import `git.ts` functions directly
**Why it's wrong:** Couples commands to Git implementation; harder to test/mock
**Do this instead:** Use Repository layer public API via `src/repository/index.ts` barrel export (already done in `review.ts`)

### Placeholder executeReview
**What happens:** `executeReview()` in `review.ts:191` returns empty result
**Why it's wrong:** Review command cannot produce real findings yet
**Do this instead:** Implement Context Engine + Model integration in Phase 5 (planned)

### Inline Diff Generation in git.ts
**What happens:** `generateUnifiedDiff()` implemented manually in `git.ts:257`
**Why it's wrong:** Diff algorithm is complex; edge cases (whitespace, encoding, large files)
**Do this instead:** Use dedicated diff library or tree-sitter for semantic diffs (future)

## Error Handling

**Strategy:** Typed error hierarchy with exit codes + structured logging

**Patterns:**
- All async operations wrap in try/catch → throw `OctateError` subclasses
- `isOctateError()` type guard in CLI handler (`src/cli.ts:75`)
- Exit codes map to CI/CD semantics: 2=usage, 3=repo, 4=model, 5=internal
- Factory functions for common scenarios (`createGitError()`, `createConfigurationError()`, etc.)
- Context preserved in `error.context` for debugging

## Cross-Cutting Concerns

**Logging:** Pino with child loggers (`createLogger('module:name')`), automatic redaction of secrets (API keys, tokens), pretty printing in dev via `pino-pretty`

**Validation:** Zod schemas for all external input (config, model output), strict mode, AOT compilation via `z.compile()` (when available)

**Authentication:** NVIDIA_API_KEY never logged (redacted), passed via env only, server-side for hosted inference

**Cancellation:** `AbortSignal` propagated through all async operations; `withCancellation()` helper wraps operations; subprocesses killed via `killProcessTree()`

---

*Architecture analysis: 2026-09-08*
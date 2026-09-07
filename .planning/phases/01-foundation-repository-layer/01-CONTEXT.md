# Phase 1: Foundation & Repository Layer - Context

**Gathered:** 2025-09-07
**Status:** Ready for planning

## Phase Boundary

This phase delivers the foundational infrastructure for Octate: repository discovery, Git operations (diff, scope, ref parsing), configuration system with precedence, local cache with project-namespaced identity and incremental indexing, model abstraction interface, error hierarchy, and CLI command architecture. All upper layers (Analysis, Intelligence, Model, Review, Application, Presentation) depend on these primitives.

## Implementation Decisions

### Git Scope Model & Ref Parsing
- **D-01:** Support all Git ref formats (HEAD~1, origin/main...HEAD, branch names, SHAs, tags) with explicit validation using isomorphic-git
- **D-02:** Fail fast with descriptive errors for invalid/ambiguous refs — show valid refs in repo, suggest corrections
- **D-03:** ReviewScope model includes full unified diff with line ranges (base, head, changed files, changed lines) passed to upper layers
- **D-04:** Explicit scope flags: `--staged`, `--working`, `--commit=<ref>`, `--range=<base>..<head>` — mutually exclusive, clear separation

### Configuration System Design
- **D-05:** Zod schema for `octate.yaml` — validates at load time, infers TypeScript types, single source of truth
- **D-06:** Global config at `~/.config/octate/config.yaml` (XDG standard) — supports multiple config files
- **D-07:** Full schema: `version`, `project.name`, `review.{severity,max_findings}`, `rules[]`, `architecture.{boundaries[],forbidden_dependencies[]}`, `ignore[]`
- **D-08:** Precedence chain: CLI args > env vars > project `octate.yaml` > global config > built-in defaults
- **D-09:** All leaf config values overridable via `OCTATE_<SECTION>_<KEY>` environment variable convention

### Cache Structure & Invalidation
- **D-10:** Cache directory: `~/.local/share/octate/{project-hash}/{indexes,cache,findings,logs}/` where project-hash = SHA256(repo-root-path + git-remote-url)
- **D-11:** Cache keys: SHA256(content) + relativePath + parserVersion + language + configHash — exact match from CONTEXT.md §49
- **D-12:** Automatic invalidation via cache key (configHash in key) + explicit `octate index --force` for manual reset
- **D-13:** Cache size limit: 500MB per project; LRU eviction on index entries; `octate doctor` reports cache size

### Model Abstraction Interface
- **D-14:** `generate(request: ModelRequest): Promise<ModelResponse>` — sync-first; streaming via async iterator added in Phase 4
- **D-15:** ModelRequest structured fields: `{systemPolicy, reviewTask, projectRules, repoMetadata, diff, context[], diagnostics[], outputSchema}` — explicit separation for prompt injection protection
- **D-16:** ModelResponse: `{findings[], usage:{promptTokens,completionTokens,totalTokens}, model, latencyMs, rawResponse?, finishReason}`
- **D-17:** Two provider implementations: `LocalNvidiaProvider` (direct NVIDIA API) and `HostedProvider` (calls Octate API on Vercel) — both implement `ReviewModel`; CLI never has NVIDIA key in hosted mode

### Cancellation & AbortController Propagation
- **D-18:** Single AbortController at ReviewUseCase level — passed to Repository, Analysis, Intelligence, Model, Review layers; each layer checks signal
- **D-19:** Subprocess cancellation (tsc, ruff, pytest, bandit): spawn with `{ signal }` option (Node 18+) — process auto-killed on abort
- **D-20:** NVIDIA API requests: pass same AbortController.signal to fetch — unified cancellation

### Monorepo Detection Strategy
- **D-21:** Detect by config files with priority: `pnpm-workspace.yaml` → pnpm; `package.json` workspaces → npm/yarn; `turbo.json` → Turborepo; `nx.json` → Nx
- **D-22:** Support nested workspaces — find all workspace roots; respect each workspace's ignore patterns; aggregate for review
- **D-23:** Ignore patterns: root `.gitignore` + `.octateignore` apply everywhere; each workspace can add its own `.octateignore`; union of all patterns

### Error Hierarchy & Exit Code Mapping
- **D-24:** Typed hierarchy matching ROADMAP.md Phase 6:
  - Exit 2: ConfigurationError
  - Exit 3: RepositoryError, GitError, ParseError, AnalysisError, ContextError
  - Exit 4: ModelError, ProviderRateLimitError, ProviderTimeoutError, AuthenticationError, QuotaExceededError
  - Exit 5: ValidationError, InternalError
  - All extend `OctateError`
- **D-25:** Errors carry structured context: `error.context = {file?, ref?, statusCode?, ...}`; `error.message` = human-readable; `--debug` logs full context

### CLI Command Architecture
- **D-26:** Commands: `octate review [ref...] --staged --working --commit --range --json --sarif --quiet`, `octate init`, `octate doctor`
- **D-27:** Global options: `--config`, `--cache-dir`, `--log-level`, `--debug`, `--version`, `--help`
- **D-28:** Review ref: optional positional `[ref...]` variadic — supports single ref, range (A..B), three-dot (A...B)
- **D-29:** Output modes mutually exclusive: `--json` | `--sarif` | `--quiet` | default TUI; all combine with scope flags

### the agent's Discretion
- Exact Zod schema field names and types for octate.yaml (implement per CONTEXT.md §45)
- LRU eviction algorithm details (standard implementation)
- AbortController integration patterns in each layer (standard Node.js patterns)
- Commander.js command option definitions (standard patterns)

## Canonical References

Downstream agents MUST read these before planning or implementing.

### Architecture & Requirements
- `.planning/PROJECT.md` — Core value, constraints, key decisions, active requirements
- `.planning/REQUIREMENTS.md` — 30 v1 requirements with REPO, CONF, CACHE, MODEL mappings
- `.planning/ROADMAP.md` §Phase 1 — Goal, 6 success criteria, requirements mapping
- `.planning/STATE.md` — Project reference, current position, risks

### Research
- `.planning/research/STACK.md` — TypeScript 7.0.2, Node ≥22, pnpm 12.3.4, Commander.js 15, isomorphic-git 1.41.9, Zod 4.5.4, Pino 10.3.1, p-limit 7.3.2
- `.planning/research/ARCHITECTURE.md` — Layered architecture, Repository Layer responsibilities, Git integration patterns
- `.planning/research/PITFALLS.md` — Pitfall 7 (Git scope ambiguity), Pitfall 6 (cache invalidation), Pitfall 9 (cancellation), Pitfall 10 (provider abstraction), Pitfall 13 (config precedence)

### External Specifications
- `https://github.com/isomorphic-git/isomorphic-git` — Git operations API (diff, status, log, rev-parse)
- `https://github.com/colinhacks/zod` — Schema validation, `z.compile()` for AOT
- `https://github.com/tj/commander.js` — CLI structure, subcommands, variadic arguments
- `https://nodejs.org/api/child_process.html#child_processspawncommand-args-options` — spawn with signal option
- XDG Base Directory Specification — `~/.config/octate/config.yaml`

## Existing Code Insights

### Reusable Assets
- None — this is the first phase; greenfield project

### Established Patterns
- Monorepo: pnpm workspace (from PROJECT.md tech stack)
- Lint/format: Biome (replaces ESLint + Prettier)
- Testing: Jest + ts-jest
- Logging: Pino with child loggers for module context

### Integration Points
- `isomorphic-git` → Repository Layer (Phase 1) → Analysis Layer (Phase 2) for file access
- `Zod` → Config validation (Phase 1) → Model output validation (Phase 4)
- `Commander.js` → CLI routing (Phase 1) → All future commands
- `AbortController` → Cancellation (Phase 1) → All async operations in upper layers

## Specific Ideas

- `octate init` should create `octate.yaml` with commented examples for all sections
- `octate doctor` validates: config syntax, Git repo access, NVIDIA connectivity (local mode), cache health (size, corruption check)
- Git ref parsing should use isomorphic-git's `resolveRef` equivalent; fall back to manual parsing for three-dot ranges
- ConfigHash for cache key: hash of normalized config object (exclude defaults, include only user-set values)

## Deferred Ideas

- `octate ask` / `explain` / `impact` / `scan` / `fix` / `chat` commands — Phase 8+
- Custom rules as executable graph constraints — Phase 8+
- Team features (shared rules, analytics) — Future phase
- Web dashboard / GitHub App — Out of scope per PROJECT.md

### Reviewed Todos (not folded)
None — discussion stayed within phase scope

---

*Phase: 01-Foundation & Repository Layer*
*Context gathered: 2025-09-07*
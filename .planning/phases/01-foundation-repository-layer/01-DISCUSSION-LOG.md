# Phase 1 Discussion Log

**Phase:** 01 - Foundation & Repository Layer
**Date:** 2025-09-07
**Status:** Complete

---

## Area 1: Git Scope Model & Ref Parsing

### Questions Asked

**Q1:** How should `octate review <ref>` parse and validate git references?
- Options:
  - Support all Git ref formats (HEAD~1, origin/main...HEAD, branch names, SHAs, tags) with explicit validation
  - Support common formats only (HEAD~N, branch..branch, single commit SHA)
  - You decide
- **Selected:** Support all Git ref formats (HEAD~1, origin/main...HEAD, branch names, SHAs, tags) with explicit validation

**Q2:** How should we handle invalid or ambiguous refs?
- Options:
  - Fail fast with descriptive error — show valid refs in repo, suggest corrections
  - Warn but proceed with best guess — log ambiguity for debugging
  - You decide
- **Selected:** Fail fast with descriptive error — show valid refs in repo, suggest corrections

**Q3:** Should the ReviewScope model include the exact diff (lines changed) or just the file list?
- Options:
  - Full diff with line ranges — pass unified diff to upper layers
  - File list + base/head only — upper layers compute diffs as needed
  - You decide
- **Selected:** Full diff with line ranges — pass unified diff to upper layers

**Q4:** How should we handle the working tree vs staged vs committed scope?
- Options:
  - Explicit --staged, --working, --commit=<ref>, --range=<base>..<head> flags
  - Single --scope flag with enum (working|staged|commit|range|branch)
  - You decide
- **Selected:** Explicit --staged, --working, --commit=<ref>, --range=<base>..<head> flags

---

## Area 2: Configuration System Design

### Questions Asked

**Q1:** What's the exact octate.yaml schema? How should configuration precedence be implemented?
- Options:
  - Zod schema for octate.yaml — validates at load time, infers TypeScript types
  - TypeScript interfaces + manual validation — more control, less dependency
  - You decide
- **Selected:** Zod schema for octate.yaml — validates at load time, infers TypeScript types

**Q2:** Where should global config live?
- Options:
  - ~/.config/octate/config.yaml (XDG) — standard location, supports multiple config files
  - ~/.octate.yaml — simpler, single file, easier to find
  - You decide
- **Selected:** ~/.config/octate/config.yaml (XDG) — standard location, supports multiple config files

**Q3:** What configuration sections should be in octate.yaml?
- Options:
  - Full schema: version, project.name, review.{severity,max_findings}, rules[], architecture.{boundaries[],forbidden_dependencies[]}, ignore[]
  - Minimal schema first: version, review.{severity,max_findings}, ignore[] — add rules/architecture later
  - You decide
- **Selected:** Full schema: version, project.name, review.{severity,max_findings}, rules[], architecture.{boundaries[],forbidden_dependencies[]}, ignore[]

**Q4:** How should environment variables map to config?
- Options:
  - All leaf config values overridable via OCTATE_<SECTION>_<KEY> convention
  - Only secrets and runtime flags via env (API key, cache dir, log level)
  - You decide
- **Selected:** All leaf config values overridable via OCTATE_<SECTION>_<KEY> convention

---

## Area 3: Cache Structure & Invalidation

### Questions Asked

**Q1:** What's the directory layout under ~/.local/share/octate/? How does project identity work?
- Options:
  - ~/.local/share/octate/{project-hash}/{indexes,cache,findings,logs}/ — project-hash = hash(repo-root-path + git-remote-url)
  - ~/.local/share/octate/{repo-name}/{indexes,cache,findings,logs}/ — simple folder per repo name
  - You decide
- **Selected:** ~/.local/share/octate/{project-hash}/{indexes,cache,findings,logs}/ — project-hash = hash(repo-root-path + git-remote-url)

**Q2:** What cache keys should be used for incremental parsing?
- Options:
  - SHA256(content) + relativePath + parserVersion + language + configHash — exact match from CONTEXT.md §49
  - Simpler: filePath + mtime + size + parserVersion — faster, no content hashing
  - You decide
- **Selected:** SHA256(content) + relativePath + parserVersion + language + configHash — exact match from CONTEXT.md §49

**Q3:** What's the invalidation strategy when parser version or config changes?
- Options:
  - Automatic invalidation via cache key (configHash in key) + explicit octate index --force for manual reset
  - Versioned cache directories (v1/, v2/) — migrate on upgrade
  - You decide
- **Selected:** Automatic invalidation via cache key (configHash in key) + explicit octate index --force for manual reset

**Q4:** Should there be cache size limits and LRU eviction?
- Options:
  - Yes — max 500MB per project; LRU eviction on index entries; octate doctor shows cache size
  - No limits initially — add if becomes problem; disk is cheap
  - You decide
- **Selected:** Yes — max 500MB per project; LRU eviction on index entries; octate doctor shows cache size

---

## Area 4: Model Abstraction Interface

### Questions Asked

**Q1:** What's the exact shape of ReviewModel.generate(request) and ModelResponse? Should it include streaming support?
- Options:
  - generate(request: ModelRequest): Promise<ModelResponse> — ModelRequest has {prompt, schema, context, signal}, ModelResponse has {findings[], usage, metadata}; streaming via async iterator in Phase 4
  - generate(request): Promise<AsyncIterable<ModelChunk>> — streaming from day one
  - You decide
- **Selected:** generate(request: ModelRequest): Promise<ModelResponse> — ModelRequest has {prompt, schema, context, signal}, ModelResponse has {findings[], usage, metadata}; streaming via async iterator in Phase 4

**Q2:** What fields should ModelRequest contain?
- Options:
  - All sections as structured fields: {systemPolicy, reviewTask, projectRules, repoMetadata, diff, context[], diagnostics[], outputSchema}
  - Single prompt string + schema — provider builds prompt internally
  - You decide
- **Selected:** All sections as structured fields: {systemPolicy, reviewTask, projectRules, repoMetadata, diff, context[], diagnostics[], outputSchema}

**Q3:** What should ModelResponse include beyond findings?
- Options:
  - {findings[], usage:{promptTokens,completionTokens,totalTokens}, model, latencyMs, rawResponse?, finishReason}
  - Minimal: {findings[], usage:{totalTokens}, model} — add more later
  - You decide
- **Selected:** {findings[], usage:{promptTokens,completionTokens,totalTokens}, model, latencyMs, rawResponse?, finishReason}

**Q4:** How should the provider abstraction handle local vs hosted modes?
- Options:
  - Two implementations: LocalNvidiaProvider (direct) and HostedProvider (calls Octate API) — both implement ReviewModel
  - Single provider with config flag — if hosted, CLI calls Octate API internally
  - You decide
- **Selected:** Two implementations: LocalNvidiaProvider (direct) and HostedProvider (calls Octate API) — both implement ReviewModel

---

## Area 5: Cancellation & AbortController Propagation

### Questions Asked

**Q1:** How does Ctrl+C propagate through all layers?
- Options:
  - Single AbortController at ReviewUseCase level — passed to Repository, Analysis, Intelligence, Model, Review layers; each layer checks signal
  - Per-layer AbortControllers — parent cancels children; more granular but complex
  - You decide
- **Selected:** Single AbortController at ReviewUseCase level — passed to Repository, Analysis, Intelligence, Model, Review layers; each layer checks signal

**Q2:** How should we handle subprocess cancellation (tsc, ruff, pytest, bandit)?
- Options:
  - Spawn with { signal } option (Node 18+) — process auto-killed on abort; capture partial output
  - Manual process.kill() on abort — track all child PIDs; cleanup in finally block
  - You decide
- **Selected:** Spawn with { signal } option (Node 18+) — process auto-killed on abort; capture partial output

**Q3:** How should NVIDIA API requests be cancelled?
- Options:
  - Yes — pass same AbortController.signal to fetch; NVIDIA request aborts cleanly
  - Separate controller for NVIDIA — allows different timeout behavior
  - You decide
- **Selected:** Yes — pass same AbortController.signal to fetch; NVIDIA request aborts cleanly

---

## Area 6: Monorepo Detection Strategy

### Questions Asked

**Q1:** How do we detect and prioritize monorepo types?
- Options:
  - Detect by config files with priority: pnpm-workspace.yaml → pnpm; package.json workspaces → npm/yarn; turbo.json → Turborepo; nx.json → Nx
  - Auto-detect all present configs — if multiple, use first found; warn user
  - You decide
- **Selected:** Detect by config files with priority: pnpm-workspace.yaml → pnpm; package.json workspaces → npm/yarn; turbo.json → Turborepo; nx.json → Nx

**Q2:** Should we support nested workspaces?
- Options:
  - Yes — find all workspace roots; respect each workspace's ignore patterns; aggregate for review
  - No — only root workspace; nested treated as regular directories
  - You decide
- **Selected:** Yes — find all workspace roots; respect each workspace's ignore patterns; aggregate for review

**Q3:** How should .gitignore and .octateignore interact across workspaces?
- Options:
  - Root .gitignore + .octateignore apply everywhere; each workspace can add its own .octateignore; union of all patterns
  - Each workspace isolated — only its own ignore files apply
  - You decide
- **Selected:** Root .gitignore + .octateignore apply everywhere; each workspace can add its own .octateignore; union of all patterns

---

## Area 7: Error Hierarchy & Exit Code Mapping

### Questions Asked

**Q1:** What's the exact error type hierarchy and exit code mapping?
- Options:
  - Typed hierarchy: ConfigurationError(2), RepositoryError(3), GitError(3), ParseError(3), AnalysisError(3), ContextError(3), ModelError(4), ProviderRateLimitError(4), ProviderTimeoutError(4), AuthenticationError(4), QuotaExceededError(4), ValidationError(5), InternalError(5) — all extend OctateError
  - Simpler: ConfigError(2), RepoError(3), ModelError(4), InternalError(5) — fewer types
  - You decide
- **Selected:** Typed hierarchy: ConfigurationError(2), RepositoryError(3), GitError(3), ParseError(3), AnalysisError(3), ContextError(3), ModelError(4), ProviderRateLimitError(4), ProviderTimeoutError(4), AuthenticationError(4), QuotaExceededError(4), ValidationError(5), InternalError(5) — all extend OctateError

**Q2:** Should errors carry structured context for debugging?
- Options:
  - Yes — error.context = {file?, ref?, statusCode?, ...}; error.message = human-readable; debug mode logs full context
  - Minimal context — just message; full details only in logs
  - You decide
- **Selected:** Yes — error.context = {file?, ref?, statusCode?, ...}; error.message = human-readable; debug mode logs full context

---

## Area 8: CLI Command Architecture

### Questions Asked

**Q1:** How should Commander.js subcommands be structured? What global options exist?
- Options:
  - octate review [ref] --staged --working --commit --range --json --sarif --quiet; octate init; octate doctor; global: --config, --cache-dir, --log-level, --debug, --version, --help
  - Minimal: octate review [ref] --json --sarif --quiet; octate init; global: --config, --debug
  - You decide
- **Selected:** octate review [ref] --staged --working --commit --range --json --sarif --quiet; octate init; octate doctor; global: --config, --cache-dir, --log-level, --debug, --version, --help

**Q2:** How should `octate review <ref>` parse the ref argument?
- Options:
  - Optional positional [ref...] — supports single ref, range (A..B), three-dot (A...B); Commander.js variadic
  - Explicit --ref flag — octate review --ref=HEAD~1; clearer but more verbose
  - You decide
- **Selected:** Optional positional [ref...] — supports single ref, range (A..B), three-dot (A...B); Commander.js variadic

**Q3:** How should --json, --sarif, --quiet interact?
- Options:
  - Mutually exclusive output modes (--json | --sarif | --quiet | default TUI); all combine with scope flags (--staged, --ref, etc.)
  - Allow combinations — --json --quiet for minimal JSON
  - You decide
- **Selected:** Mutually exclusive output modes (--json | --sarif | --quiet | default TUI); all combine with scope flags (--staged, --ref, etc.)

---

## Summary of Decisions

29 decisions captured across 8 areas. All decisions are specific, actionable, and reference existing specifications (CONTEXT.md, ROADMAP.md, research outputs). No scope creep detected — all discussions stayed within Phase 1 boundaries.

---

*Discussion completed: 2025-09-07*
*Context written: 2025-09-07*
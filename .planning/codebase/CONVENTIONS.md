# Coding Conventions

**Analysis Date:** 2026-09-11

## Naming Patterns

**Files:**
- kebab-case for all source files: `review.ts`, `discovery.test.ts`, `symbol-index.ts`, `critic.ts`
- Test files: `[name].test.ts` co-located with source
- Index barrels: `index.ts` for public exports
- Types: `types.ts` for domain models, `schema.ts` for Zod schemas

**Functions:**
- camelCase: `createReviewCommand`, `findGitRoot`, `loadConfig`, `filterDeterministicHardFloor`, `computeCompositeScore`
- Async functions: no special prefix, use `async` keyword
- Factory functions: `create*`, `make*` prefix: `createReviewEngine`, `createCancellationController`, `createCacheStore`, `createModelProvider`

**Variables:**
- camelCase: `repoRoot`, `configPath`, `testDir`, `rawFindings`
- Constants: UPPER_SNAKE_CASE: `DEFAULT_CONFIG`, `RANKING_WEIGHTS`, `SEVERITY_SCORES`
- Private/internal: underscore prefix occasionally used but not enforced

**Types/Interfaces:**
- PascalCase: `ReviewOptions`, `ModelRequest`, `ReviewResult`, `RankedFinding`, `CriticVerdict`
- Type guards: `is*` prefix: `isRepository`, `isOctateError`, `isReviewModel`, `isActionableFix`

**Modules/Directories:**
- kebab-case directories: `cancellation`, `repository`, `intelligence`, `model`, `review`
- Barrel exports at `index.ts` in each directory

## Code Style & Tooling

**Formatting (Biome):**
- Indentation: 2 spaces
- Line width: 100 characters
- Semicolons: always
- Trailing commas: ES5 (trailing where valid)
- Quotes: single quotes
- Organize imports: enabled (auto-sort)

**Linting (Biome):**
- Recommended rules: enabled
- Correctness: error level
- Suspicious: error level (`useAwait` strictly enforced — avoid unnecessary `async` on functions returning Promises synchronously)
- Style: warn level (avoid `!` non-null assertions; use explicit type narrowing or assertions)
- `noProcessEnv`: off (CLI needs process.env)
- `noExcessiveClassesPerFile`: off
- `useNamingConvention`: warn (strictCase: false)

**TypeScript (tsconfig.json):**
- Target: ES2022
- Module: NodeNext
- ModuleResolution: NodeNext
- Strict: true
- noUncheckedIndexedAccess: true
- exactOptionalPropertyTypes: true
- Declaration: true (generates .d.ts)
- SourceMap: true
- Path aliases: `@/*` → `./src/*`

## Error Handling & Exit Codes

**Pattern: Typed Error Hierarchy**
- Base class: `OctateError` (extends Error) with `exitCode` and `context`
- Standard Exit Code Mapping:
  - **0**: Review passed (no blocking findings)
  - **1**: Review completed with blocking findings (e.g. Critical/High severity findings exceeding threshold)
  - **2**: Usage or configuration error (`ConfigurationError`)
  - **3**: Repository, Git, AST parsing, or analysis error (`RepositoryError`, `GitError`, `ParseError`, `AnalysisError`, `ContextError`)
  - **4**: AI Model provider or network error (`ModelError`, `AuthenticationError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `QuotaExceededError`)
  - **5**: Schema validation or internal error (`ValidationError`, `InternalError`)
- Type guards: `isOctateError`, `isConfigurationError`, `isModelError`, etc.
- JSON serialization: `toJson()` method on base class.

## Architecture & Security Patterns

### 1. Prompt Architecture & Injection Defense
- **Sandwich Prompt Framing:** Untrusted repository code, diffs, and comments are placed inside demarcated XML-like boundaries (`<diff>`, `<context_item>`) with explicit passive instruction tags.
- System instructions and security guardrails precede untrusted content; final review instructions and output schema follow it. Repository source content NEVER appears in trusted prompt sections.
- **Lightweight Template Engine:** Regex interpolation (`{{variable}}`, `{{#each list}}`) in `src/model/prompts/template.ts` avoids heavyweight template libraries and arbitrary code execution.

### 2. Schema Validation & 2-Turn Repair
- Model responses are untrusted text until validated against compiled Zod schemas (`src/model/schema/finding.ts`).
- JSON extraction strips markdown fences (````json ... ````) and cleans trailing commas before parsing.
- Grounding: Line ranges are strictly checked against actual file line counts (`src/model/schema/grounding.ts`). Phantom files are dropped and out-of-bounds line numbers clamped.
- On schema failure, actionable Zod issues are formatted into a repair prompt and retried once before throwing `ModelError` (exit code 4).

### 3. Review DAG Scheduling & Fault Isolation
- Staged execution: Structural reviewer runs first as baseline. Semantic and Security reviewers trigger conditionally via AST heuristics and pattern matching.
- **Bounded Concurrency:** Concurrency is strictly bounded (2 parallel model requests, 3 parallel subprocess diagnostic runs) via `PromisePool`.
- **Graceful Degradation:** If an individual reviewer fails or times out, surviving reviewer findings proceed to the Critic stage, and the failure is recorded as a warning in `ReviewResult.metadata.warnings`.

### 4. Two-Stage Critic Quality Gate
- **Stage 1 (Deterministic Hard Floor):** Rejects invalid line numbers, nonexistent files, low-confidence candidates (`< 0.6`), empty evidence arrays, and non-actionable suggestions ("fix this", "refactor") without incurring model costs.
- **Stage 2 (LLM Critic):** Invokes `critic.v1` to verify factual truth against repository evidence and apply senior-engineer judgment.

### 5. Multi-Factor Deduplication & Evidence Merging
- Findings are clustered using:
  1. File and line range interval overlap ($\pm 3$ lines tolerance)
  2. Enclosing symbol ID + category match
  3. Root-cause keyword overlap (e.g. `['null', 'dereference']`)
- Merging selects the highest severity, highest confidence, strongest explanatory message, and unions up to 5 verified evidence items.
- Runs in two phases: pre-Critic syntactic clustering (to minimize prompt token expenditure) and post-Critic consolidation.

### 6. Composite Ranking & Critical Protection
- Normalized 0–100 composite ranking:
  - Severity: 30%
  - Confidence: 20%
  - Evidence Strength: 15%
  - Blast Radius: 15% (computed via `ReferenceGraph.getIncoming` caller/dependency count)
  - Security Impact: 10%
  - Regression Probability: 10%
- Findings below `minSeverity` are discarded. The top `maxFindings` are preserved, but **Critical-severity findings are never truncated**.

---

*Convention analysis: 2026-09-11*

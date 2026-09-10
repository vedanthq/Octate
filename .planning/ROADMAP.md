# Roadmap: Octate

**Project:** Octate — Terminal-native AI code-review CLI
**Core Value:** Make developers trust `octate review` by combining deterministic repository analysis with AI reasoning to produce evidence-backed, high-quality code-review findings.
**Granularity:** fine (8 phases)
**Created:** 2025-09-07
**Status:** Draft — awaiting approval

---

## Phases

- [x] **Phase 1: Foundation & Repository Layer** — Repository discovery, Git diff, config, cache, model abstraction
- [ ] **Phase 2: Analysis Layer** — Tree-sitter parsing, symbol extraction, static analysis, diagnostics
- [ ] **Phase 3: Intelligence Layer** — Symbol index, reference/dependency graphs, Context Engine with token budgeting
- [ ] **Phase 4: Model Provider** — NVIDIA adapter, versioned prompts, schema validation, prompt injection protection
- [ ] **Phase 5: Review Engine** — Review DAG (Structural/Semantic/Security reviewers → Critic → Dedup → Ranking)
- [ ] **Phase 6: Application Layer** — ReviewUseCase orchestration, progress streaming, cancellation, exit codes
- [ ] **Phase 7: Terminal Presentation** — Interactive TUI workspace, JSON/SARIF/quiet renderers
- [ ] **Phase 8: CLI Integration, Polish & Evaluation** — Full command set, doctor, evaluation fixtures, performance validation

---

## Phase Details

### Phase 1: Foundation & Repository Layer
**Goal**: Developer can initialize Octate in a repository and run basic Git operations with configuration and caching infrastructure.
**Depends on**: Nothing (first phase)
**Requirements**: REPO-01, REPO-02, REPO-03, REPO-04, CONF-01, CONF-02, CACHE-01, CACHE-02, CACHE-03, MODEL-02
**Success Criteria** (what must be TRUE):
  1. `octate init` creates a valid `octate.yaml` with sensible defaults at the repository root
  2. `octate review` auto-discovers the Git repository root, workspace, and monorepo configuration on invocation
  3. `octate review --staged` and `octate review HEAD~1` produce correct Git diffs with explicit base, head, changed files, and changed lines
  4. Configuration precedence works: CLI args > env vars > project `octate.yaml` > global config > built-in defaults
  5. Local cache at `~/.local/share/octate/` stores indexes with project-namespaced identity using content-hash/file-path/parser-version/language/config-version keys
  6. Ctrl+C gracefully cancels any running operation without orphaned processes (model requests, subprocesses, indexing, background tasks)
**Plans**: 7 plans
**UI hint**: no

Plans:
- [x] 01-01-PLAN.md — Project scaffold, core types, error hierarchy, logging
- [x] 01-02-PLAN.md — Configuration system: Zod schema, loader, precedence, init command
- [x] 01-03-PLAN.md — Repository discovery, Git diff, ReviewScope, monorepo detection
- [x] 01-04-PLAN.md — Ignore handling, file filtering, binary/generated detection
- [x] 01-05-PLAN.md — Cache infrastructure: project identity, keys, store, LRU, promise pool
- [x] 01-06-PLAN.md — Cancellation (AbortController), Model abstraction interface
- [x] 01-07-PLAN.md — CLI commands: review, init, doctor with exit codes

### Phase 2: Analysis Layer
**Goal**: Changed files are parsed for symbols and deterministic diagnostics are collected for AI consumption.
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, ANAL-01, ANAL-02
**Success Criteria** (what must be TRUE):
  1. TypeScript, JavaScript, and Python files in the review scope are parsed with Tree-sitter producing concrete syntax trees
  2. Symbols (functions, methods, classes, interfaces, types, constants, variables, modules, exports, imports) are extracted with stable IDs, names, kinds, languages, file locations, ranges, parents, exported status, and references
  4. Running `octate review` executes deterministic static analysis: TypeScript compiler, ESLint/Biome for TS/JS; ruff, mypy/pyright, pytest, bandit for Python — respecting the repository's existing configuration
  5. Diagnostics, test discovery results, and security scanner output are collected and structured for AI consumption
  6. Incremental parsing reuses cached results for unchanged files via content-hash-based cache keys
**Plans**: 2 plans
**UI hint**: no

Plans:
- [x] 02-01-PLAN.md — Tree-sitter parsing & symbol extraction (PARSE-01, PARSE-02)
- [x] 02-02-PLAN.md — Static analysis orchestration & diagnostics (ANAL-01, ANAL-02)

### Phase 3: Intelligence Layer
**Goal**: Repository intelligence graphs are built and relevant context is selected within token budgets for AI review.
**Depends on**: Phase 2
**Requirements**: PARSE-03, PARSE-04, CTX-01, CTX-02
**Success Criteria** (what must be TRUE):
  1. Reference graph tracks caller→callee, importer→imported, implementation→interface, test→production, route→handler, handler→service, service→repository relationships with bounded traversal (no full-repo walks)
  2. Dependency graph tracks package dependencies, workspace packages, internal module dependencies, imports, and runtime/dev/optional dependencies
  3. Context Engine ranks candidates (changed symbols=100, direct callers/callees=90, related types/tests=80, architecture rules=70, config=60, Git history=40) and produces a bounded `ReviewContext` within token budgets (e.g., 8k–16k max)
  4. Context serialization clearly separates trusted sections (system policy, Octate rules, review task, repository metadata, diff, diagnostics) from untrusted repository source content
  5. Token budgeting metrics are tracked: candidate tokens, selected tokens, selection ratio
**Plans**: 4 plans
**UI hint**: no

Plans:
- [ ] 03-01-PLAN.md — Symbol Index & Cross-File Path Resolution (PARSE-03)
- [ ] 03-02-PLAN.md — Reference Graph & Dependency Graph with Disk Serialization (PARSE-03, PARSE-04)
- [ ] 03-03-PLAN.md — Context Engine, Token Budgeting & Snippet Windowing (CTX-01)
- [ ] 03-04-PLAN.md — Prompt Context Serialization & Trust Demarcation (CTX-02, MODEL-04)

### Phase 4: Model Provider
**Goal**: NVIDIA Nemotron 3 Ultra is callable via clean abstraction with schema-validated, prompt-injection-protected output.
**Depends on**: Phase 1 (model abstraction), Phase 3 (Context Engine interface)
**Requirements**: MODEL-01, MODEL-03, MODEL-04
**Success Criteria** (what must be TRUE):
  1. `ReviewModel.generate(request): Promise<ModelResponse>` abstraction exists; NVIDIA adapter implements it with API auth, HTTP, request/response serialization, timeout, retry, rate-limit handling, structured errors, cancellation (AbortController), and usage metadata tracking
  2. Versioned prompt definitions exist for `reviewer.structural.v1`, `reviewer.semantic.v1`, `reviewer.security.v1`, `critic.v1`
  3. Model output is validated against compiled Zod schema: findings with severity (critical/high/medium/low/info), category (correctness/security/performance/architecture/reliability/maintainability/compatibility/testing), title, message, file, startLine, endLine, confidence (0.0–1.0), evidence[], relatedFiles[], relatedSymbols[], impact, suggestedFix, reviewer, metadata — invalid responses rejected and retried with corrected prompt
  4. Prompt architecture explicitly separates trusted (system policy, Octate rules, review task) from untrusted (source, comments, README, commit messages, repo config, generated files) content — repository content never appears in instruction areas
  5. NVIDIA API key never appears in CLI logs, process environment (for hosted path), or client bundles; hosted architecture uses CLI → Octate API (Vercel) → NVIDIA with key only in server-side Vercel secrets
**Plans**: TBD
**UI hint**: no

### Phase 5: Review Engine
**Goal**: Review DAG produces high-signal, evidence-backed, ranked findings from context.
**Depends on**: Phase 3 (Context Engine), Phase 4 (Model Provider)
**Requirements**: REV-01, REV-02, REV-03, REV-04
**Success Criteria** (what must be TRUE):
  1. Structural Reviewer identifies: API contract violations, type misuse, lifecycle problems, error handling gaps, nullability issues, resource management problems, obvious concurrency problems, structural test gaps — consuming deterministic diagnostics where possible
  2. Semantic Reviewer identifies: business logic regressions, incorrect assumptions, behavioral changes, state transition errors, edge cases, cross-module behavior issues, compatibility problems
  3. Security Reviewer identifies: authentication/authorization flaws, input validation gaps, injection (SQL/command/SSRF), path traversal, privilege escalation, secret exposure, cryptographic misuse, unsafe deserialization, sensitive data exposure — findings require strong evidence
  4. Critic stage filters each candidate finding: verifies truth against repository evidence, proves evidence supports claim, checks intentionality, handles duplicates, validates impact meaningfulness, justifies severity, confirms actionability, applies senior-engineer judgment — weak findings discarded
  5. Deduplication merges findings using file/range, issue signature, symbol, evidence overlap, semantic similarity — keeps strongest explanation with merged evidence
  6. Ranking orders findings by composite score: severity × confidence × evidence strength × blast radius × security impact × regression probability × actionability — most important finding appears first
**Plans**: TBD
**UI hint**: no

### Phase 6: Application Layer
**Goal**: Full review pipeline executes from CLI command to ReviewResult with progress streaming, cancellation, and exit codes.
**Depends on**: Phase 5
**Requirements**: OUT-02
**Success Criteria** (what must be TRUE):
  1. `octate review` executes complete pipeline: load config → discover repository → determine scope → Git diff → analysis → graph → context → review DAG → validation → `ReviewResult`
  2. Progress events stream for each stage: reading Git state, updating repository index, resolving changed symbols, collecting diagnostics, building context, running AI reviewers, validating findings, ranking findings
  3. Ctrl+C propagates cancellation through all layers (model requests via AbortController, analysis subprocesses via signal, indexing, background tasks) — no orphaned processes
  4. Exit codes map correctly: 0=review passed, 1=review completed with blocking findings, 2=usage/configuration error, 3=repository/Git error, 4=model/provider error, 5=internal error
  5. Errors are typed (ConfigurationError, RepositoryError, GitError, ParseError, AnalysisError, ContextError, ModelError, ProviderRateLimitError, ProviderTimeoutError, AuthenticationError, QuotaExceededError, ValidationError) with human-concise messages; debug mode provides diagnostic detail
**Plans**: TBD
**UI hint**: no

### Phase 7: Terminal Presentation
**Goal**: Interactive TUI workspace and non-interactive renderers present ReviewResult for developer action.
**Depends on**: Phase 6
**Requirements**: TUI-01, TUI-02, TUI-03, OUT-01
**Success Criteria** (what must be TRUE):
  1. Interactive TUI launches with header (repository, scope, branch/base, finding count), finding navigator (grouped by critical/high/medium/low/info), source/diff view, finding details (title, explanation, impact, confidence, evidence), actions (inspect, explain, fix, suppress, next/prev)
  2. Keyboard-first navigation works: ↑/k previous, ↓/j next, Enter inspect, f fix, e explain, s suppress, r re-review, d diff, c context, q quit, Esc back, ? help
  3. Progress streaming UI shows live status (indexing → analyzing → reviewing → ranking) without blocking or noisy animations
  4. `--json` output produces valid JSON with all findings, evidence, metadata from common `ReviewResult` domain object via JsonRenderer
  5. `--sarif` output produces valid SARIF v2.1.0 that passes schema validation via SarifRenderer
  6. `--quiet` output produces minimal human-readable summary via HumanRenderer
  7. All four renderers (InteractiveRenderer, HumanRenderer, JsonRenderer, SarifRenderer) transform the same `ReviewResult` — review engine has zero knowledge of rendering
**Plans**: TBD
**UI hint**: yes

### Phase 8: CLI Integration, Polish & Evaluation
**Goal**: Complete CLI command set works end-to-end with evaluation fixtures proving review quality.
**Depends on**: Phase 7
**Requirements**: (integration of all prior requirements; no new v1 requirements)
**Success Criteria** (what must be TRUE):
  1. All MVP commands work end-to-end: `octate review`, `octate review --staged`, `octate review <git-ref>`, `octate review --json`, `octate review --sarif`, `octate review --quiet`, `octate doctor`
  2. `octate doctor` validates configuration, repository access, NVIDIA connectivity, and cache health — reports actionable diagnostics
  3. Evaluation fixtures exist: golden reviews (known repository/change pairs with expected findings including severity, evidence ranges, acceptable confidence), false-positive test suite, regression cases from production bugs
  4. False-positive rate measured and tracked; target: useful findings / total findings > 0.7
  5. Performance measured and documented: review latency, context size, NVIDIA provider reliability, indexing speed, TUI responsiveness
  6. Documentation covers installation (`npx octate review`), configuration (`octate.yaml`), usage, architecture, and troubleshooting
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Repository Layer | 7/7 | Complete | 2026-09-09 |
| 2. Analysis Layer | 2/2 | Planned | - |
| 3. Intelligence Layer | 0/0 | Not started | - |
| 4. Model Provider | 0/0 | Not started | - |
| 5. Review Engine | 0/0 | Not started | - |
| 6. Application Layer | 0/0 | Not started | - |
| 7. Terminal Presentation | 0/0 | Not started | - |
| 8. CLI Integration, Polish & Evaluation | 0/0 | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| REPO-01 | Phase 1 | Complete |
| REPO-02 | Phase 1 | Complete |
| REPO-03 | Phase 1 | Complete |
| REPO-04 | Phase 1 | Complete |
| PARSE-01 | Phase 2 | Pending |
| PARSE-02 | Phase 2 | Pending |
| PARSE-03 | Phase 3 | Pending |
| PARSE-04 | Phase 3 | Pending |
| ANAL-01 | Phase 2 | Pending |
| ANAL-02 | Phase 2 | Pending |
| CTX-01 | Phase 3 | Pending |
| CTX-02 | Phase 3 | Pending |
| REV-01 | Phase 5 | Pending |
| REV-02 | Phase 5 | Pending |
| REV-03 | Phase 5 | Pending |
| REV-04 | Phase 5 | Pending |
| MODEL-01 | Phase 4 | Pending |
| MODEL-02 | Phase 1 | Complete |
| MODEL-03 | Phase 4 | Pending |
| MODEL-04 | Phase 4 | Pending |
| TUI-01 | Phase 7 | Pending |
| TUI-02 | Phase 7 | Pending |
| TUI-03 | Phase 7 | Pending |
| OUT-01 | Phase 7 | Pending |
| OUT-02 | Phase 6 | Pending |
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CACHE-01 | Phase 1 | Complete |
| CACHE-02 | Phase 1 | Complete |
| CACHE-03 | Phase 1 | Complete |

**Total v1 requirements: 30** (NOTE: REQUIREMENTS.md summary incorrectly states 28; actual count is 30)
**Mapped to phases: 30** ✓
**Unmapped: 0** ✓
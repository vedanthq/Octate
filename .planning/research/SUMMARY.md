# Project Research Summary

**Project:** Octate
**Domain:** Terminal-native AI code-review CLI
**Researched:** 2025-09-07
**Confidence:** HIGH

## Executive Summary

Octate is a terminal-native AI code intelligence and code-review application that understands the repository first and uses AI for reasoning over that understanding. The MVP is a single command — `octate review` — that launches an interactive TUI-style review workspace while also supporting non-interactive modes (`--json`, `--sarif`, `--quiet`) for CI/CD automation.

Research confirms the recommended approach: **local-first deterministic analysis feeding a bounded-context Review DAG**, not a single-prompt diff classifier. The architecture must enforce strict layer separation (Terminal Presentation → Application → Review Core → Intelligence → Analysis → Repository → Model) so the review engine remains independent of rendering, hosting, and model provider. The core product moat is repository intelligence (symbol index, reference graph, dependency graph) and context engineering — not the model itself.

Key risks are well-understood: treating AI review as single-pass classification (Pitfall 1), skipping deterministic analysis (Pitfall 2), context window abuse (Pitfall 3), coupling core to Ink (Pitfall 4), prompt injection (Pitfall 5), and cache invalidation failures (Pitfall 6). All have concrete prevention strategies documented in the architecture. The build order is constrained by layer dependencies: Repository → Analysis → Intelligence → Model Provider → Review Engine → Application → Presentation.

## Key Findings

### Recommended Stack

**Core technologies:**
- **TypeScript 7.0.2 / Node.js ≥22.0.0 / pnpm 12.3.4**: Primary language, runtime, package manager — strict mode, Vercel compatibility, workspace support for monorepo structure
- **Ink 7.1.1 + React 19.2.8**: React-based terminal UI — component-based, Flexbox layout, keyboard handling, core-independent (swappable renderer)
- **Tree-sitter 0.25.1 + grammars (TS/JS/Python)**: Incremental parsing, concrete syntax trees, language-agnostic symbol extraction
- **isomorphic-git 1.41.9**: Pure JS Git implementation — no native deps, supports diff/status/log, avoids CLI wrapper overhead
- **Zod 4.5.4**: Runtime schema validation — TypeScript-first, `z.compile()` for AOT, validates model output and config
- **Pino 10.3.1**: Structured JSON logging — extremely fast, child loggers, redaction support
- **p-limit 7.3.2 / p-queue 7.3.2**: Bounded concurrency — promise pool for parallel tasks, priority queue for DAG stages
- **NVIDIA Nemotron 3 Ultra (nvidia/nemotron-3-ultra-550b-a55b)**: Single model provider via OpenAI-compatible API — provider abstraction enables future expansion
- **@biomejs/biome 2.5.12**: Lint + format in one fast Rust tool — replaces ESLint + Prettier
- **Jest 30.5.1 + ts-jest**: Test framework with TypeScript support

### Expected Features

**Must have (table stakes):**
- Git diff analysis (working tree, staged, commit range, branch comparison)
- Multi-language support (TypeScript, JavaScript, Python minimum)
- Finding categorization (severity: critical/high/medium/low; category: security/correctness/perf/arch)
- Evidence/location references (file + line ranges for findings and evidence)
- Configuration file (`octate.yaml` at repo root with YAML)
- Ignore patterns (glob patterns for files, dirs, branches)
- JSON and SARIF v2.1.0 output for CI/CD integration
- Exit codes (0=pass, 1=blocking, 2=config, 3=git, 4=model, 5=internal)
- Incremental analysis (cache symbols/diagnostics; reparse only changed files)
- Repository discovery (auto-detect Git root, workspace, monorepo)
- Progress indication (streaming status: indexing → analyzing → reviewing → ranking)
- Cancellation (Ctrl+C cleanly shuts down model requests, subprocesses)
- Schema-validated model output (reject invalid responses before rendering)

**Should have (competitive differentiators):**
- Interactive TUI workspace (Ink-based, keyboard-first, split-pane navigator + source + details)
- Local-first execution (source never leaves machine; only bounded context sent to NVIDIA)
- Repository Intelligence Graph (persistent symbol/reference/dependency graph, incremental Tree-sitter)
- Context Engine with token budgeting (rank candidates: changed symbols→callers/callees→types/tests→config→history)
- Review DAG pipeline (Structural→Semantic→Security reviewers → Critic → Deduplication → Ranking)
- Critic/false-positive reduction (truth check, evidence verification, intentionality, duplicate detection)
- Evidence-backed findings (every finding cites repository locations; TUI jumps to evidence)
- Confidence scoring 0.0–1.0 (ranking signal, displayed as % in TUI)
- Custom rules as executable knowledge (YAML rules → deterministic graph checks + AI explanation)
- `octate ask` / `explain` / `impact` (reuse graph + context engine for Q&A beyond review)
- Local cache at `~/.local/share/octate/` (project-namespaced, no source retention)
- Non-interactive modes sharing same `ReviewResult` domain object
- Prompt injection protection (trusted vs untrusted content separation in prompt architecture)
- NVIDIA behind provider abstraction (interface: `ReviewModel.generate(request)`)

**Defer (v2+):**
- `octate ask` / `explain` / `impact` / `scan` / `fix` / `chat` commands
- Custom rules as executable graph constraints (start with YAML prompt rules)
- Architecture diagrams / visualization
- Cross-repo review, auto-approve, PR description generation
- Slack/IDE integrations, team features (shared rules, analytics)
- Local inference provider (Ollama/vLLM), vector database, custom model training
- Kubernetes/microservices, web dashboard, GitHub/GitLab Apps

### Architecture Approach

Octate follows a strict 8-layer architecture where dependencies flow downward only. The terminal application is the product surface; the review engine is the core. The review engine has zero knowledge of whether it's rendered as interactive TUI, plain text, JSON, or SARIF.

**Major components:**
1. **Repository Layer** — Git operations, filesystem access, workspace detection, ignore handling, diff generation. Handles symlinks, large files, binaries, generated files, monorepos, worktrees.
2. **Analysis Layer** — Deterministic information: Tree-sitter parsing, AST, symbol extraction, import/export/reference extraction, dependency detection, diagnostics (tsc, ESLint/Biome, ruff, mypy/pyright, pytest, bandit), test discovery.
3. **Intelligence Layer** — Repository Intelligence: Symbol Index (stable IDs, references), Reference Graph (caller→callee, importer→imported, test→prod), Dependency Graph (package, workspace, internal modules). Context Engine: ranks candidates, produces bounded `ReviewContext` within token budgets.
4. **Model Layer** — Clean abstraction (`ReviewModel.generate(request): Promise<ModelResponse>`). NVIDIA adapter handles auth, HTTP, retry, rate-limits, structured errors, cancellation. Versioned prompt definitions. Schema-validated output. Prompt injection protection via trusted/untrusted separation.
5. **Review Layer** — Review DAG: Structural Reviewer (API contracts, types, lifecycles) → Semantic Reviewer (business logic, edge cases) → Security Reviewer (auth, injection, secrets) → Critic (aggressive false-positive filtering) → Deduplication (merge evidence, keep strongest) → Ranking (severity × confidence × evidence × blast radius × regression probability × actionability).
6. **Command/Application Layer** — Converts CLI commands into use cases, orchestrates full pipeline, handles progress streaming, cancellation, error mapping.
7. **Terminal Presentation Layer** — Four renderers transform `ReviewResult`: InteractiveRenderer (TUI), HumanRenderer (plain text), JsonRenderer, SarifRenderer. Ink only here.
8. **Local Infrastructure** — Cache (`~/.local/share/octate/`), config (precedence: defaults → global → project → env → CLI), logging, process control, bounded concurrency, graceful cancellation.

### Critical Pitfalls

1. **Single-pass diff classification** — Sending entire diff to model in one prompt causes hallucination, missing cross-file context, false positives, no evidence. **Prevention:** Implement Review DAG from Day 1; build Context Engine with token budgeting before first AI call; require evidence in schema; use Critic stage; schema-validate all output.

2. **Skipping deterministic analysis** — Relying solely on LLM wastes tokens rediscovering known diagnostics, misses issues tools catch, produces inconsistent results. **Prevention:** Run tsc, ESLint/Biome, ruff, mypy/pyright, bandit, pytest FIRST; feed all diagnostics into Context Engine as high-priority context; AI reviewers consume diagnostics, don't replace them.

3. **Context window abuse** — Dumping whole repository into prompts increases latency 10-30s, cost $0.50-2.00+/review, model distraction, hallucinations. **Prevention:** Context Engine MUST rank/select candidates; hard token budget (8k-16k max); selection algorithm with explicit scores; track candidate/selected/ratio metrics.

4. **Coupling core to Ink** — Business logic importing Ink components prevents testing, blocks JSON/SARIF, blocks web UI, forces re-render on state change. **Prevention:** Strict layer separation; core domain types in `packages/core` with ZERO external deps; Application returns `ReviewResult`; Renderers are thin adapters; Ink only in `apps/cli`.

5. **No prompt injection protection** — Repository content interpolated directly into prompts allows override of system behavior, secret leakage. **Prevention:** Explicit prompt sections: System Policy + Octate Rules + Review Task + Repository Metadata + Diff + Relevant Source (marked UNTRUSTED) + Diagnostics; never allow repo content in instruction area; schema-validate output.

6. **Incremental indexing without proper cache invalidation** — Stale symbols, missed relationships, crashes on deleted nodes, unbounded cache growth. **Prevention:** Cache key = hash(content) + filePath + parserVersion + language + configVersion; explicit invalidation on file/parser/config change; LRU eviction, max size bounds; `octate index --force` for full re-index.

7. **Git scope ambiguity** — Reviewing unintended changes (unstaged+staged mixed), wrong base, generated files included. **Prevention:** Explicit `ReviewScope` model (type, base, head, files[], diff); TUI header ALWAYS shows Repository, Base, Head, Changed files; diff respects .gitignore/.octateignore; reject ambiguous scopes.

8. **Model output not schema-validated** — Malformed responses crash pipeline, invalid line ranges, wrong severity breaks ranking. **Prevention:** Zod schema with strict validation; verify file paths exist in changed files, line ranges valid, severity enum, confidence 0-1, evidence structure; `z.compile()` for performance; reject on failure, retry with corrected prompt.

9. **No graceful cancellation** — Orphaned processes, wasted NVIDIA quota, cache corruption, port conflicts. **Prevention:** AbortController at ReviewUseCase level, passed to ALL layers; NVIDIA adapter accepts `signal`; child processes spawned with `{ signal }`; atomic cache writes; SIGINT triggers abort.

10. **Exposing NVIDIA API key in hosted mode** — Key leaks via process env, logs, client bundle; unlimited proxy abuse. **Prevention:** Architecture: Local = CLI → NVIDIA; Hosted = CLI → Octate API (Vercel) → NVIDIA; `NVIDIA_API_KEY` ONLY in Vercel server-side env; two provider implementations (`LocalNvidiaProvider` vs `HostedProvider`); CLI never imports NVIDIA HTTP in hosted build.

## Implications for Roadmap

Based on research, the strict layer dependencies dictate the following phase structure. Each phase must be complete and tested before the next begins — no shortcuts.

### Phase 1: Foundation & Repository Layer
**Rationale:** Bottom of dependency chain. All upper layers depend on repository discovery, Git diff, config, cache, logging, and model abstraction interface.
**Delivers:** `octate init`, repository discovery, Git status/diff/scope, `octate.yaml` config with precedence, local cache infrastructure, logging, model abstraction interface (no provider yet), CLI routing skeleton.
**Addresses:** REPO-01, REPO-02, REPO-03, CONF-01, CONF-02, CACHE-01, CACHE-02, CACHE-03, MODEL-01 (interface only)
**Avoids:** Pitfall 7 (Git scope ambiguity), Pitfall 6 (cache invalidation), Pitfall 9 (cancellation infrastructure), Pitfall 10 (provider abstraction boundary), Pitfall 13 (config precedence)

### Phase 2: Analysis Layer (Parsing + Static Analysis)
**Rationale:** Depends on Repository Layer. Produces deterministic facts (symbols, diagnostics, references) that Intelligence and Review layers consume.
**Delivers:** Tree-sitter integration for TS/JS/Python, symbol extraction (stable IDs, imports/exports, references), static analysis integration (tsc, ESLint/Biome, ruff, mypy/pyright, pytest, bandit), test discovery, incremental parsing with content-hash cache keys.
**Addresses:** PARSE-01, PARSE-02, ANAL-01, ANAL-02
**Uses:** Tree-sitter, isomorphic-git, p-limit, Pino, Zod (for diagnostic schemas)
**Implements:** Analysis Layer components, Parser package
**Avoids:** Pitfall 2 (skipping deterministic analysis), Pitfall 11 (Tree-sitter WASM memory), Pitfall 14 (binary/generated files to model), Pitfall 6 (cache invalidation)

### Phase 3: Intelligence Layer (Graph + Context Engine)
**Rationale:** Depends on Analysis Layer. Builds repository intelligence (symbol index, reference graph, dependency graph) and context selection — the core differentiator.
**Delivers:** Symbol Index, Reference Graph (bounded traversal), Dependency Graph (package/workspace/internal), Context Engine with ranking algorithm and token budgeting, context serialization with trusted/untrusted separation.
**Addresses:** PARSE-03, PARSE-04, CTX-01, CTX-02
**Uses:** p-queue (for graph traversal priority), crypto (content hashing)
**Implements:** Intelligence Layer packages (graph, context)
**Avoids:** Pitfall 3 (context window abuse), Pitfall 16 (ranking ignores blast radius), Pitfall 22 (monorepo scopes entire workspace), Pitfall 23 (Git history blocks review)

### Phase 4: Model Provider (NVIDIA Adapter + Prompts + Validation)
**Rationale:** Depends on Model Abstraction (Phase 1) and Context Engine (Phase 3). Can be developed in parallel with Phase 3 once interfaces are stable.
**Delivers:** NVIDIA adapter (auth, HTTP, timeout, retry, rate-limit, cancellation, usage tracking), versioned prompt definitions (structural.v1, semantic.v1, security.v1, critic.v1), Zod schemas for ModelResponse with `z.compile()`, prompt injection protection architecture.
**Addresses:** MODEL-01, MODEL-02, MODEL-03, MODEL-04
**Uses:** Native fetch, AbortController, Zod, Pino (redaction)
**Implements:** Model Layer packages (provider-nvidia, prompts)
**Avoids:** Pitfall 5 (prompt injection), Pitfall 8 (unvalidated model output), Pitfall 10 (key exposure), Pitfall 15 (deduplication evidence loss - schema helps)

### Phase 5: Review Engine (Review DAG)
**Rationale:** Depends on Intelligence Layer (context) and Model Layer (provider). This is the core quality differentiator.
**Delivers:** Structural Reviewer, Semantic Reviewer, Security Reviewer, Critic (truth check, evidence verification, intentionality, duplicate detection), Deduplication (merge evidence, keep highest confidence), Ranking (multi-factor: severity × confidence × evidence × blast radius × security impact × regression probability × actionability), Finding domain model with mandatory evidence.
**Addresses:** REV-01, REV-02, REV-03, REV-04
**Uses:** p-queue (DAG stage dependencies), Zod (finding validation)
**Implements:** Review Layer packages
**Avoids:** Pitfall 1 (single-pass classification), Pitfall 15 (deduplication loses evidence), Pitfall 16 (ranking ignores blast radius), Pitfall 4 (core depends on terminal - this phase has zero UI deps)

### Phase 6: Application Layer (Use Cases + Orchestration)
**Rationale:** Depends on Review Engine. Orchestrates full pipeline, handles progress, cancellation, errors.
**Delivers:** ReviewUseCase (load config → discover repo → determine scope → Git diff → analysis → graph → context → review DAG → validation → ReviewResult), progress streaming events, error mapping, cancellation handling, exit codes.
**Addresses:** Application Layer components, progress streaming, error model
**Uses:** All lower layers, p-limit (for parallel reviewers in DAG)
**Implements:** Application Layer
**Avoids:** Pitfall 9 (cancellation propagation), Pitfall 18 (unstable exit codes)

### Phase 7: Terminal Presentation (TUI + Renderers)
**Rationale:** Top layer. Consumes `ReviewResult` from Application Layer. All renderers share same domain object.
**Delivers:** InteractiveRenderer (TUI workspace: header, finding navigator, source/diff view, finding details, actions), HumanRenderer (plain text), JsonRenderer, SarifRenderer (validated against SARIF v2.1.0 schema), keyboard handling (keybindings), progress streaming UI, virtualized findings list.
**Addresses:** TUI-01, TUI-02, TUI-03, OUT-01, OUT-02
**Uses:** Ink, React, picocolors, ink-virtual-list, node-sarif-builder, @types/sarif
**Implements:** Terminal Presentation Layer, apps/cli
**Avoids:** Pitfall 4 (core coupled to Ink - enforced by renderer pattern), Pitfall 12 (virtual list), Pitfall 17 (invalid SARIF), Pitfall 18 (exit codes), Pitfall 19 (keybinding conflicts), Pitfall 20 (progress spinner), Pitfall 24 (resize handling), Pitfall 25 (debug log secrets)

### Phase 8: CLI Integration, Polish & Evaluation
**Rationale:** Final integration, hardening, quality validation before release.
**Delivers:** Command routing (`octate review`, `--staged`, `<git-ref>`, `--json`, `--sarif`, `--quiet`, `octate doctor`), configuration polish, evaluation fixtures (golden reviews, regression suite), false-positive tests, performance measurement (quality, latency, context size, provider reliability, UX), documentation.
**Addresses:** CLI commands, evaluation infrastructure, MVP completion criteria
**Uses:** All layers integrated
**Implements:** Final CLI polish, fixtures, evaluation harness
**Avoids:** Pitfall 13 (config precedence - validated by doctor), Pitfall 21 (repo identity cache collisions)

### Phase Ordering Rationale

- **Strict bottom-up dependency order:** Each layer's domain concepts must be stable before the layer above consumes them. Repository → Analysis → Intelligence → Model Provider → Review Engine → Application → Presentation is a hard constraint from the architecture.
- **Model Provider (Phase 4) can parallelize with Intelligence (Phase 3)** once Model Abstraction interface (Phase 1) and Context Engine interface (Phase 3 start) are defined.
- **Evaluation fixtures built in Phase 8** but designed during Phase 5 (Review Engine) — golden reviews need known repository/change pairs with expected findings.
- **TUI last** because it's an implementation detail; the core must work headless first (JSON/SARIF) to prove review quality independent of rendering.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Analysis):** Tree-sitter grammar version pinning and upgrade strategy; language toolchain detection (what if `tsc`/`ruff`/`mypy` not in repo?); graceful degradation patterns.
- **Phase 3 (Intelligence):** Token counting accuracy (NVIDIA tokenizer vs tiktoken); bounded graph traversal algorithms for 10K-1M file repos; monorepo detection edge cases (Yarn/npm/pnpm workspaces, Turborepo, Nx).
- **Phase 4 (Model Provider):** NVIDIA rate limit specifics (exact limits, headers, retry-after behavior); circuit breaker tuning; streaming response handling with structured output validation.
- **Phase 5 (Review DAG):** Critic threshold tuning (avoid over-filtering true positives); security reviewer evidence requirements; deduplication signature design for semantic similarity.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Well-documented patterns for CLI routing (Commander.js), config discovery (cosmiconfig), caching (content-hash keys), logging (Pino), Git (isomorphic-git).
- **Phase 6 (Application):** Standard use case orchestration, progress streaming, error mapping patterns.
- **Phase 7 (TUI):** Ink patterns documented in Context7; virtual list, incremental rendering, focus management are established.
- **Phase 8 (Polish):** SARIF validation, exit code contracts, CLI integration testing are standard engineering practices.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via Context7 for all major libraries (Ink, Tree-sitter, Commander.js, Zod, Pino, isomorphic-git, Biome, Jest, NVIDIA API). Versions pinned to latest stable. |
| Features | HIGH | Derived from authoritative CONTEXT.md (§1-130) + competitive analysis of 7 products (Cubic, CodeRabbit, Qodo, Graphite, Copilot, SonarQube, Jules). MVP scope explicitly defined in CONTEXT.md §93-96. |
| Architecture | HIGH | Directly specified in CONTEXT.md (§6-§130) with layered architecture, component boundaries, data flows, patterns, anti-patterns, and build order. Validated against industry references (Cubic, CodeRabbit). |
| Pitfalls | HIGH | 25 pitfalls mapped to specific phases with prevention/detection strategies. Sources: Context7 (Ink, Tree-sitter, Zod), CONTEXT.md architecture constraints, competitive analysis lessons. Git/Repository pitfalls MEDIUM (based on common tooling issues). |

**Overall confidence:** HIGH

### Gaps to Address

- **Git worktree/submodule handling** — Need specific testing strategy for unusual Git configurations (REPO-03). Handle during Phase 1 with integration test fixtures.
- **NVIDIA rate limit specifics** — Exact limits, headers, retry-after behavior (MODEL-01). Research during Phase 4; implement conservative defaults with circuit breaker.
- **SARIF validator integration** — Which validator to use in CI (OUT-01). Evaluate `sarif-validator` and GitHub Code Scanning upload test during Phase 7.
- **Monorepo detection edge cases** — Yarn workspaces, npm workspaces, pnpm, Turborepo, Nx (REPO-03). Implement detection priority order in Phase 1; test in Phase 8.
- **Tree-sitter grammar update strategy** — How to handle breaking grammar changes (PARSE-01). Pin versions in Phase 2; document upgrade process.
- **WASM memory monitoring in Node** — Best practices for detecting WASM OOM (PARSE-01). Implement memory monitoring in Phase 2; use `performance.memory` if available.

## Sources

### Primary (HIGH confidence)
- **Context7: `/vadimdemedes/ink`** — Ink v7.1.1 patterns, virtual list, incremental rendering, Static component, focus management, Node ≥22 requirement
- **Context7: `/tree-sitter/tree-sitter`** — Incremental parsing, WASM memory management, parser lifecycle, grammar versioning
- **Context7: `/colinhacks/zod`** — `z.compile()` for AOT validation performance, schema validation patterns, error handling
- **Context7: `/tj/commander.js`** — CLI structure, subcommands, option parsing, TypeScript typings via `@commander-js/extra-typings`
- **Project CONTEXT.md (§1-130)** — Complete architectural specification, layered architecture, component boundaries, data flows, patterns, anti-patterns, constraints, decisions, evolution
- **Project PROJECT.md** — Validated requirements mapping to architectural layers

### Secondary (MEDIUM confidence)
- **Context7: `/microsoft/sarif-sdk`** — SARIF v2.1.0 object model, TypeScript types
- **Context7: `/nvuillam/node-sarif-builder`** — Fluent SARIF builder API
- **Context7: `/pinojs/pino`** — Redaction, child loggers, performance
- **Context7: `/sindresorhus/p-limit` / `p-queue`** — Concurrency patterns
- **Competitive analysis: Cubic, CodeRabbit, Jules (§127)** — Strategic lessons: repository intelligence first, context assembly, verification over generation, local-first differentiation
- **NVIDIA API documentation** — OpenAI-compatible endpoint, Nemotron 3 Ultra availability, authentication

### Tertiary (LOW confidence)
- **AI code review literature (general)** — Synthesized domain knowledge for pitfall categories
- **Git tooling common issues** — Worktree, submodule, sparse checkout patterns inferred from isomorphic-git docs

---

*Research completed: 2025-09-07*
*Ready for roadmap: yes*
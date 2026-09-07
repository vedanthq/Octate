# Requirements: Octate

**Defined:** 2025-09-07
**Core Value:** Make developers trust `octate review` by combining deterministic repository analysis with AI reasoning to produce evidence-backed, high-quality code-review findings.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Repository (REPO)

- [ ] **REPO-01**: Discover and analyze the local Git repository (working tree, staged changes, commit ranges, branch comparisons)
- [ ] **REPO-02**: Generate Git diffs for the selected review scope with base/head/changed files/lines explicitly known
- [ ] **REPO-03**: Handle monorepos, symlinks, large files, binary files, generated files, ignored files, vendor dirs, node_modules, build output, and unusual Git worktrees safely
- [ ] **REPO-04**: Auto-detect Git root, workspace, and monorepo configuration on `cd repo && octate review`

### Parsing (PARSE)

- [ ] **PARSE-01**: Parse TypeScript, JavaScript, and Python files using Tree-sitter for syntax trees, symbol discovery, imports/exports, and structural relationships
- [ ] **PARSE-02**: Extract symbols (functions, methods, classes, interfaces, types, constants, variables, modules, exports, imports) with stable IDs, names, kinds, languages, file locations, ranges, parents, exported status, and references
- [ ] **PARSE-03**: Build a reference graph tracking caller→callee, importer→imported, implementation→interface, test→production, route→handler, handler→service, service→repository relationships with bounded traversal
- [ ] **PARSE-04**: Build a dependency graph tracking package dependencies, workspace packages, internal module dependencies, imports, runtime/dev/optional dependencies

### Analysis (ANAL)

- [ ] **ANAL-01**: Run deterministic static analysis (TypeScript compiler, ESLint/Biome, ruff, mypy/pyright, pytest, bandit) respecting the repository's existing configuration
- [ ] **ANAL-02**: Collect diagnostics, test discovery, and security scanner results for AI consumption

### Context (CTX)

- [ ] **CTX-01**: Build a Context Engine that ranks candidates (changed symbols, direct callers/callees, related types/tests/config/history/diagnostics) and produces a bounded ReviewContext within token budgets
- [ ] **CTX-02**: Serialize context with clear separation: trusted instructions, trusted project rules, review task, repository metadata, diff, relevant source, static diagnostics — repository source as untrusted content

### Review (REV)

- [ ] **REV-01**: Implement Review DAG with Structural Reviewer (API contracts, type misuse, lifecycle, error handling, nullability, resource management, concurrency, test gaps), Semantic Reviewer (business logic regressions, incorrect assumptions, behavioral changes, state transitions, edge cases, cross-module behavior, compatibility), Security Reviewer (auth, authz, input validation, injection, SSRF, path traversal, privilege escalation, secrets, crypto, deserialization, data exposure)
- [ ] **REV-02**: Implement Critic to reduce false positives (truth verification, evidence proof, intentionality check, duplicate handling, impact meaningfulness, severity justification, actionability, deduplication, senior-engineer judgment)
- [ ] **REV-03**: Deduplicate findings using file/range, issue signature, symbol, evidence overlap, semantic similarity — keep strongest explanation
- [ ] **REV-04**: Rank findings by severity, confidence, evidence strength, blast radius, security impact, regression probability, actionability

### Model (MODEL)

- [ ] **MODEL-01**: NVIDIA Nemotron 3 Ultra 550B-A55B provider with API auth, HTTP, request/response serialization, timeout, retry, rate-limit handling, structured errors, cancellation, usage metadata
- [ ] **MODEL-02**: Model abstraction interface (`ReviewModel.generate(request): Promise<ModelResponse>`) — core depends on abstraction, not NVIDIA specifics
- [ ] **MODEL-03**: Schema-validated structured output (findings with severity, category, title, message, file, line ranges, confidence, evidence, suggested fix) — validate schema, file paths, line ranges, severity, confidence, evidence, categories
- [ ] **MODEL-04**: Prompt injection protection — trusted (system policy, Octate rules, review task) vs untrusted (source, comments, README, commit messages, repo config, generated files) separation in prompt architecture

### TUI (TUI)

- [ ] **TUI-01**: Interactive TUI workspace with header (repo, scope, branch, finding count), finding navigator (critical/high/medium/low/info), source/diff view, finding details (title, explanation, impact, confidence, evidence), actions (inspect, explain, fix, suppress, next/prev)
- [ ] **TUI-02**: Keyboard-first navigation (↑/k prev, ↓/j next, Enter inspect, f fix, e explain, s suppress, r re-review, d diff, c context, q quit, Esc back, ? help)
- [ ] **TUI-03**: Progress streaming (reading Git state, updating index, resolving symbols, collecting diagnostics, building context, running AI reviewers, validating findings, ranking findings)

### Output (OUT)

- [ ] **OUT-01**: Non-interactive output modes: `--json`, `--sarif`, `--quiet` with common domain result transformed by InteractiveRenderer, HumanRenderer, JsonRenderer, SarifRenderer
- [ ] **OUT-02**: Stable exit codes (0=passed, 1=blocking findings, 2=usage/config error, 3=repo/Git error, 4=model/provider error, 5=internal error)

### Configuration (CONF)

- [ ] **CONF-01**: Configuration via `octate.yaml` with version, project name, review severity/max_findings, rules, architecture boundaries/forbidden_dependencies, ignore patterns
- [ ] **CONF-02**: Configuration precedence: built-in defaults → global config → project octate.yaml → env vars → CLI args

### Cache (CACHE)

- [ ] **CACHE-01**: Local cache at `~/.local/share/octate/` with indexes, cache, findings, logs — project identity namespaced, incremental indexing via content hash/file path/parser version/language/config version
- [ ] **CACHE-02**: Bounded concurrency with promise pool/task queue — parallelize parsing, diagnostics, reviewers
- [ ] **CACHE-03**: Graceful cancellation (Ctrl+C) stopping model requests, analysis subprocesses, indexing, background tasks — no orphaned processes

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Ask/Explain/Impact (ASK)

- **ASK-01**: `octate ask "<question>"` — natural language queries about the codebase using repository graph + context engine
- **ASK-02**: `octate explain <file>:<line>` — AI explanation of specific code location with evidence
- **ASK-03**: `octate impact <path>` — analyze blast radius of changes to a symbol/file using dependency graph

### Scan (SCAN)

- **SCAN-01**: `octate scan --security` — security-focused scanning using deterministic rules + AI reasoning
- **SCAN-02**: `octate scan --architecture` — architecture boundary violations, forbidden dependencies, circular dependencies

### Fix (FIX)

- **FIX-01**: `octate fix <finding-id>` — agentic fix workflow: read finding → inspect repo → plan change → modify code → run tests → run static checks → inspect diff → self-review → present patch → human approval

### Chat (CHAT)

- **CHAT-01**: `octate chat` — conversational interface for exploratory code questions

### Rules (RULES)

- **RULES-01**: Custom rules as executable graph constraints (forbidden dependencies, layer violations, path constraints) with deterministic detection + AI explanation
- **RULES-02**: Suppression learning — `octate suppress <finding-id>` with reason creates repository-specific rule

### Index (INDEX)

- **INDEX-01**: `octate index` — explicit full repository indexing command
- **INDEX-02**: `octate findings` — list/summarize previous findings from cache

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Web dashboard | Terminal-native first; web is future layer (§3, §82) |
| GitHub App / GitLab App (heavy webhook-based) | Lightweight GitHub Action / GitLab CI adapter is fine later (§82), not hosted webhook version |
| Multiple model providers | NVIDIA only for now; provider boundary exists for future (§41) |
| Local inference | Future capability (§85), not MVP |
| Autonomous coding agent | Review quality must be proven first (§79, §92) |
| Hosted arbitrary code execution | Security boundary; separate problem (§80, §92) |
| Billing / enterprise administration | Free during validation; SSO/RBAC/audit in §86.1 are future |
| Vector database | Not needed for deterministic repository intelligence |
| Custom model training | Model is replaceable implementation detail (§121) |
| Kubernetes / microservices / distributed job infra | Premature for terminal product (§92) |
| Separate TUI product | One terminal app with CLI entry points and interactive workspaces (§2.1) |
| Real-time chat | Not a chat product |
| Mobile app | Terminal-only |
| Plugin system | Not MVP |
| Custom rule DSL | Rules evolve from prompt text to executable knowledge (§47) |
| Rust implementation | TypeScript/Node.js only initially (§4) |
| IDE integrations | Terminal-first; IDE later |
| GitHub PR comment posting (hosted) | Phase A: GitHub Action wrapping CLI output (§82) |
| Team features (shared rules, review policy, analytics) | Future phase (§83) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REPO-01 | Phase 1 | Pending |
| REPO-02 | Phase 1 | Pending |
| REPO-03 | Phase 1 | Pending |
| REPO-04 | Phase 1 | Pending |
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
| MODEL-02 | Phase 1 | Pending |
| MODEL-03 | Phase 4 | Pending |
| MODEL-04 | Phase 4 | Pending |
| TUI-01 | Phase 7 | Pending |
| TUI-02 | Phase 7 | Pending |
| TUI-03 | Phase 7 | Pending |
| OUT-01 | Phase 7 | Pending |
| OUT-02 | Phase 6 | Pending |
| CONF-01 | Phase 1 | Pending |
| CONF-02 | Phase 1 | Pending |
| CACHE-01 | Phase 1 | Pending |
| CACHE-02 | Phase 1 | Pending |
| CACHE-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2025-09-07*
*Last updated: 2025-09-07 after roadmap creation*
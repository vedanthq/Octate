# Octate

## What This Is

Octate is a terminal-native AI code-review CLI. A developer runs `octate review` inside a real Git repository and gets a small number of high-value, evidence-backed findings in an interactive TUI, plus `--json`/`--sarif`/`--quiet` modes for automation. The organizing idea: Octate understands the repository first, deterministically, and uses AI for reasoning over that understanding — not the other way around.

## Core Value

Make developers trust `octate review` by combining deterministic repository analysis with AI reasoning to produce evidence-backed, high-quality code-review findings.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **REPO-01**: Discover and analyze the local Git repository (working tree, staged changes, commit ranges, branch comparisons)
- [ ] **REPO-02**: Generate Git diffs for the selected review scope with base/head/changed files/lines explicitly known
- [ ] **REPO-03**: Handle monorepos, symlinks, large files, binary files, generated files, ignored files, vendor dirs, node_modules, build output, and unusual Git worktrees safely
- [ ] **PARSE-01**: Parse TypeScript, JavaScript, and Python files using Tree-sitter for syntax trees, symbol discovery, imports/exports, and structural relationships
- [ ] **PARSE-02**: Extract symbols (functions, methods, classes, interfaces, types, constants, variables, modules, exports, imports) with stable IDs, names, kinds, languages, file locations, ranges, parents, exported status, and references
- [ ] **PARSE-03**: Build a reference graph tracking caller→callee, importer→imported, implementation→interface, test→production, route→handler, handler→service, service→repository relationships with bounded traversal
- [ ] **PARSE-04**: Build a dependency graph tracking package dependencies, workspace packages, internal module dependencies, imports, runtime/dev/optional dependencies
- [ ] **ANAL-01**: Run deterministic static analysis (TypeScript compiler, ESLint/Biome, ruff, mypy/pyright, pytest, bandit) respecting the repository's existing configuration
- [ ] **ANAL-02**: Collect diagnostics, test discovery, and security scanner results for AI consumption
- [ ] **CTX-01**: Build a Context Engine that ranks candidates (changed symbols, direct callers/callees, related types/tests/config/history/diagnostics) and produces a bounded ReviewContext within token budgets
- [ ] **CTX-02**: Serialize context with clear separation: trusted instructions, trusted project rules, review task, repository metadata, diff, relevant source, static diagnostics — repository source as untrusted content
- [ ] **REV-01**: Implement Review DAG with Structural Reviewer (API contracts, type misuse, lifecycle, error handling, nullability, resource management, concurrency, test gaps), Semantic Reviewer (business logic regressions, incorrect assumptions, behavioral changes, state transitions, edge cases, cross-module behavior, compatibility), Security Reviewer (auth, authz, input validation, injection, SSRF, path traversal, privilege escalation, secrets, crypto, deserialization, data exposure)
- [ ] **REV-02**: Implement Critic to reduce false positives (truth verification, evidence proof, intentionality check, duplicate handling, impact meaningfulness, severity justification, actionability, deduplication, senior-engineer judgment)
- [ ] **REV-03**: Deduplicate findings using file/range, issue signature, symbol, evidence overlap, semantic similarity — keep strongest explanation
- [ ] **REV-04**: Rank findings by severity, confidence, evidence strength, blast radius, security impact, regression probability, actionability
- [ ] **MODEL-01**: NVIDIA Nemotron 3 Ultra 550B-A55B provider with API auth, HTTP, request/response serialization, timeout, retry, rate-limit handling, structured errors, cancellation, usage metadata
- [ ] **MODEL-02**: Model abstraction interface (`ReviewModel.generate(request): Promise<ModelResponse>`) — core depends on abstraction, not NVIDIA specifics
- [ ] **MODEL-03**: Schema-validated structured output (findings with severity, category, title, message, file, line ranges, confidence, evidence, suggested fix) — validate schema, file paths, line ranges, severity, confidence, evidence, categories
- [ ] **MODEL-04**: Prompt injection protection — trusted (system policy, Octate rules, review task) vs untrusted (source, comments, README, commit messages, repo config, generated files) separation in prompt architecture
- [ ] **TUI-01**: Interactive TUI workspace with header (repo, scope, branch, finding count), finding navigator (critical/high/medium/low/info), source/diff view, finding details (title, explanation, impact, confidence, evidence), actions (inspect, explain, fix, suppress, next/prev)
- [ ] **TUI-02**: Keyboard-first navigation (↑/k prev, ↓/j next, Enter inspect, f fix, e explain, s suppress, r re-review, d diff, c context, q quit, Esc back, ? help)
- [ ] **TUI-03**: Progress streaming (reading Git state, updating index, resolving symbols, collecting diagnostics, building context, running AI reviewers, validating findings, ranking findings)
- [ ] **OUT-01**: Non-interactive output modes: `--json`, `--sarif`, `--quiet` with common domain result transformed by InteractiveRenderer, HumanRenderer, JsonRenderer, SarifRenderer
- [ ] **OUT-02**: Stable exit codes (0=passed, 1=blocking findings, 2=usage/config error, 3=repo/Git error, 4=model/provider error, 5=internal error)
- [ ] **CONF-01**: Configuration via `octate.yaml` with version, project name, review severity/max_findings, rules, architecture boundaries/forbidden_dependencies, ignore patterns
- [ ] **CONF-02**: Configuration precedence: built-in defaults → global config → project octate.yaml → env vars → CLI args
- [ ] **CACHE-01**: Local cache at `~/.local/share/octate/` with indexes, cache, findings, logs — project identity namespaced, incremental indexing via content hash/file path/parser version/language/config version
- [ ] **CACHE-02**: Bounded concurrency with promise pool/task queue — parallelize parsing, diagnostics, reviewers
- [ ] **CACHE-03**: Graceful cancellation (Ctrl+C) stopping model requests, analysis subprocesses, indexing, background tasks — no orphaned processes

### Out of Scope

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

## Context

- **Technical environment**: TypeScript 5.x (strict), Node.js ≥20, pnpm workspace monorepo
- **Parsing**: Tree-sitter for generalized parser layer; language-specific tooling supplements where better semantic info exists
- **TUI**: Ink initially, but core must not depend on Ink (swappable renderer)
- **Testing**: Jest for unit and integration tests
- **Linting/Format**: Biome (replaces ESLint + Prettier)
- **Model**: NVIDIA Nemotron 3 Ultra 550B-A55B via `https://integrate.api.nvidia.com`
- **Distribution**: `npx octate review` and `npm install -g octate`
- **Future hosting**: Vercel for API, auth, usage limits, web onboarding, optional web UI
- **Architecture**: Layered — Terminal Presentation → Command/Application → Review → Intelligence → Analysis → Repository → Model → Local Infrastructure
- **Key principle**: Repository intelligence (graph, context engine, review engine, evidence system) is the long-term moat; model is replaceable
- **Security**: Repository content is untrusted; NVIDIA_API_KEY never exposed to CLI for hosted mode; prompt injection protection mandatory

## Constraints

- **Tech stack**: TypeScript/Node.js only — no Rust for initial implementation (Vercel compatibility, shared language, mature CLI ecosystem, easy process/filesystem/Git integration, easy NVIDIA API integration, rapid iteration)
- **Runtime**: Modern Node.js with strict TypeScript
- **TUI**: Ink is implementation detail; core must not import Ink
- **Model**: NVIDIA API only initially; Nemotron 3 Ultra 550B-A55B; provider boundary for future expansion
- **Analysis before AI**: Deterministic analysis runs before AI reasoning, not instead of it
- **Evidence-backed**: Every important AI finding needs inspectable evidence; low-confidence/low-value findings aggressively rejected
- **Schema validation**: Model output is untrusted until schema-validated
- **Prompt injection**: Repository content never overrides trusted instructions
- **No hosted execution**: No autonomous fixes before review quality proven
- **Secrets server-side**: NVIDIA credentials stay server-side for hosted inference
- **Local-first execution**: Source code never leaves developer's machine for local review
- **SARIF/JSON output**: MVP-required for CI/CD integration without hosted service
- **Zero per-seat pricing**: Local execution means no per-review billing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript/Node.js over Rust | Vercel compatibility, shared language, mature CLI ecosystem, easy Git/NVIDIA integration, rapid iteration | ✓ Good |
| Terminal-native, CLI-first with TUI | Faster development, lower infra complexity, better dev feedback, direct workflow integration, forces solving review problem first | ✓ Good |
| Ink for TUI, but core independent | Swappable renderer; if Ink becomes limitation, replace without rewriting core | ✓ Good |
| NVIDIA Nemotron only, behind abstraction | Avoids multi-provider complexity; model is replaceable implementation detail | ✓ Good |
| Tree-sitter for parsing | Generalized parser layer; don't reinvent language parsers | ✓ Good |
| Deterministic analysis before AI | Establishes facts before probabilistic reasoning; reduces hallucination | ✓ Good |
| Repository Intelligence as graph | Long-term moat; powers review, ask, explain, impact, fix | ✓ Good |
| Context Engine with token budgeting | Don't send entire repo; large context increases latency, cost, noise, distraction | ✓ Good |
| Review DAG (not single prompt) | Structural + Semantic + Security reviewers → Critic → Deduplication → Ranking | ✓ Good |
| SARIF/JSON as MVP output modes | CI/CD integration without hosted service | ✓ Good |
| Free tier with quotas/rate limits | NVIDIA free endpoint may change; must remain operable | ✓ Good |
| Biome for lint/format | Single fast tool replacing ESLint+Prettier | ✓ Good |
| Jest for testing | Unit + integration tests | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2025-09-06 after initialization*
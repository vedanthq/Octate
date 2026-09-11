# Phase 8: CLI Integration, Polish & Evaluation - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 delivers the complete, production-ready Octate CLI release and evaluation package:
1. End-to-end integration and verification of all CLI subcommands (`octate review`, `octate doctor`, `octate init`).
2. Comprehensive `octate doctor` diagnostics (Node runtime >= 22, Git access, NVIDIA connectivity, cache store, static analysis linters discovery on PATH, and Tree-sitter WASM grammars).
3. Evaluation fixtures & golden review suites: multi-language (TypeScript and Python) vulnerability and regression test cases with negative (clean) pairings to measure precision and false-positive suppression.
4. Performance and quality benchmark harness: 5-factor scorecard measuring false-positive rate (<30%), precision (>70%), review latency (p50 < 30s), token budgets, and cache acceleration, committed to `EVALUATION.md`.
5. Distribution packaging and release hygiene: npm bundle whitelist, bundled Tree-sitter WASM grammars, bin shebang and `chmod +x` build hooks, `pack:check` dry-run validation, and full documentation (root `README.md` + `docs/` guides).

</domain>

<decisions>
## Implementation Decisions

### Evaluation Fixtures & Golden Reviews
- **D-01:** In-tree test fixtures with replayable mock responses — Store golden review test cases in `test/fixtures/` with recorded mock responses for zero-network, deterministic CI testing, plus an opt-in live runner flag (`--live-model`) to validate real NVIDIA Nemotron API behavior.
- **D-02:** Multi-language core suite (TypeScript & Python) covering Security, Structural, and Semantic categories — Concrete test cases for SQL/command injection, unhandled async resource leaks, null pointer dereferences, and state/business logic regressions.
- **D-03:** Negative-case pairing (Clean vs Vulnerable counterparts) — Every bug fixture has a matching safe variant (e.g. parameterized query vs raw SQL concatenation, explicit cleanup) where the expected finding count is strictly 0, directly verifying the Critic quality gate.
- **D-04:** Multi-factor semantic match assertion — Evaluation test passes when target file matches, line range overlaps within ±3 lines, severity matches expected level, category matches, and confidence is >= 0.6.

### Doctor Command Scope & Diagnostics
- **D-05:** Comprehensive tooling & runtime audit in `octate doctor`:
  - Node.js engine check (>= 22.0.0 required by Ink 7.1.1).
  - Git repository access & status via `isomorphic-git`.
  - Cache directory integrity and read/write health.
  - Discovery of static analysis tools on `$PATH` (`tsc`, `biome`, `ruff`, `mypy`, `pyright`, `bandit`, `pytest`).
  - Tree-sitter WebAssembly grammar loading integrity (`test-wasm/` / `dist/wasm/`).
- **D-06:** Severity distinction in doctor checks:
  - Critical failures (Node < 22, corrupt cache, invalid config, missing Git repo) return `status: 'fail'` and exit code 2.
  - Missing optional linters or tools return `status: 'warn'` with actionable remediation installation commands (e.g., `pip install ruff` or `npm i -D @biomejs/biome`).
- **D-07:** Three-tier NVIDIA API connectivity check:
  - Check 1: `NVIDIA_API_KEY` present in environment.
  - Check 2: Endpoint ping to `https://integrate.api.nvidia.com/v1/models` (validates HTTP reachability and auth token).
  - Check 3: Nemotron model availability check (`nvidia/nemotron-3-ultra-550b-a55b` in models list) without consuming generation credits.
- **D-08:** Doctor formatting & exit code policy:
  - Formatted human-readable ANSI summary table with status icons (`✓`, `⚠`, `✗`) and remediation tips box.
  - Machine-readable `--json` output and minimal summary `--quiet` output.
  - Exit code 0 if all critical checks pass (even if warnings exist); exit code 2 if any critical check fails.

### Packaging & Distribution Readiness
- **D-09:** Whitelisted npm package distribution with bundled WASM:
  - Configure `package.json: "files"` to strictly include `["dist", "README.md", "LICENSE"]`.
  - Build script copies Tree-sitter WASM grammars into `dist/wasm/` so `npx octate review` runs self-contained without missing grammar errors.
- **D-10:** CLI binary entrypoint hygiene:
  - `dist/cli.js` includes `#!/usr/bin/env node` shebang.
  - Post-build script sets executable permissions (`chmod +x dist/cli.js`).
  - Top-level handlers in `src/cli.ts` for `uncaughtException` and `unhandledRejection` sanitize errors and exit with code 5.
- **D-11:** Documentation suite:
  - Root `README.md` covering quickstart (`npx octate review`), feature highlights, installation, CLI flags reference, and architecture diagram.
  - Dedicated guides in `docs/`:
    - `docs/configuration.md` (`octate.yaml` schema, rules, architecture boundaries).
    - `docs/ci-cd.md` (GitHub Actions workflow example with SARIF upload).
    - `docs/troubleshooting.md` (common doctor warnings, API keys, cache clearing).
- **D-12:** Pre-publish verification script:
  - Implement `npm run pack:check` which builds the project, copies WASM grammars, and runs `npm pack --dry-run` to assert tarball size, included files whitelist, and zero dev-file leakage.

### Performance & Quality Benchmark Reporting
- **D-13:** Dedicated benchmark runner and test suite (`npm run bench` / `npm run eval`):
  - Executes the full evaluation fixture corpus, records review latency and token usage, and verifies precision/recall thresholds.
- **D-14:** 5-factor evaluation scorecard:
  - False-positive rate (< 30% target).
  - Useful finding precision (> 70% target).
  - Review latency (p50 < 30s target, p95).
  - Token budget utilization (budgeted vs consumed).
  - Cache hit speedup (cold vs warm review duration).
- **D-15:** Committed evaluation documentation:
  - Record benchmark results in `.planning/phases/08-cli-integration-polish-evaluation/EVALUATION.md` alongside terminal summary table output.
- **D-16:** Critic prompt and heuristic tuning loop:
  - Inspect any misclassified evaluation test cases, refine deterministic hard floor rules or `critic.v1.md` prompt, and rerun benchmark until targets are met.

### the agent's Discretion
- Exact fixture file naming and internal mock directory organization in `test/fixtures/`.
- Visual styling nuances of the `octate doctor` remediation recommendations box.
- Internal benchmarking utility helper script architecture.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specifications & Requirements
- `.planning/PROJECT.md` — What Octate is, core values, constraints, and scope boundaries.
- `.planning/REQUIREMENTS.md` — All functional requirements (REPO, PARSE, ANAL, CTX, REV, MODEL, TUI, OUT, CONF, CACHE).
- `.planning/ROADMAP.md` — Milestone roadmap and Phase 8 success criteria.

### CLI & Subcommand Architecture
- `src/cli.ts` — Main Commander.js entrypoint, global options, and error handling.
- `src/commands/review.ts` — Review subcommand pipeline orchestrator and TUI launcher.
- `src/commands/doctor.ts` — Current doctor command implementation.
- `src/commands/init.ts` — Init subcommand configuration generator.

### Evaluation & Diagnostics References
- `src/review/critic.ts` — Two-stage Critic implementation (deterministic hard floor + LLM Critic).
- `src/review/ranking.ts` — 6-factor composite score calculation.
- `src/model/prompts/critic.v1.md` — Critic prompt template.
- `src/analysis/diagnostics/tools.ts` — Subprocess tool execution and detection.
- `src/analysis/parser/languages.ts` — Tree-sitter WASM grammar loader.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DoctorCheck` and `DoctorResult` interfaces in `src/commands/doctor.ts`.
- `MockReviewModel` in `src/review/__tests__/mocks.ts` for deterministic mock reviewer responses.
- `spawnWithSignal` and `which` helper in `src/cancellation/subprocess.ts` for tool detection.
- `createCacheStore` and `getCacheDir` in `src/cache/index.ts` for cache diagnostics.
- `LocalNvidiaProvider` in `src/model/providers/nvidia.ts` for API validation.

### Established Patterns
- Strict error hierarchy with typed exit codes (0=success, 1=blocking findings, 2=config/doctor fail, 3=repo, 4=model, 5=internal).
- Zero-dependency ANSI formatting via `picocolors`.
- Jest with native ESM (`NODE_OPTIONS=--experimental-vm-modules`) and `ts-jest`.
- Biome for formatting and linting.

### Integration Points
- `src/commands/doctor.ts` — Extend with Node engine, tool discovery, and WASM checks.
- `package.json` — Add `files` whitelist, `pack:check`, `bench` scripts, and post-build WASM copy step.
- `test/fixtures/` — Create evaluation fixtures and golden review suites.
- `README.md` and `docs/` — Create production user documentation.

</code_context>

<specifics>
## Specific Ideas

- Ensure `octate doctor` can be run both inside and outside of a git repository without crashing (reporting git status as warning/info when run outside a repo).
- Make sure Tree-sitter WASM files are properly bundled into `dist/wasm/` during `npm run build` so that `npx octate review` works seamlessly in clean environments without needing git-cloned dev directories.
- Provide a clear, actionable failure summary when `octate doctor` discovers missing tools.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within Phase 8 scope.

</deferred>

---

*Phase: 08-cli-integration-polish-evaluation*
*Context gathered: 2026-09-11*

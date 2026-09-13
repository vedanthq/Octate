# Phase 0 Baseline Audit: Test Suite Execution

**Command:** `npm test` (`NODE_OPTIONS=--experimental-vm-modules jest`)  
**Execution Timestamp:** 2026-09-14T01:11:32+05:30  
**Commit SHA:** `5363e288bc267d011e2369aeba1935a5ff451951`

---

## 1. Test Suite Summary

- **Total Test Suites:** 76 passed, 76 total (100%)
- **Total Tests:** 895 passed, 895 total (100%)
- **Snapshots:** 0 total
- **Execution Duration:** 16.97s – 17.14s
- **Exit Code:** `0`

---

## 2. Test Architecture Breakdown

| Layer / Subsystem | Test Suites | Test Count | Harness Mode | Notes |
|-------------------|-------------|------------|--------------|-------|
| `src/types/` | 1 | 21 | Unit | Type guards, invariants |
| `src/repository/` | 7 | 84 | Integration / Mock Git | Discovery, ignore, filter, scope, monorepo |
| `src/analysis/` | 14 | 142 | Real Parser + WASM | Tree-sitter WASM grammars, AST extraction, diagnostics |
| `src/context/` | 8 | 96 | Unit / Integration | Token budgeting, dependency graph, context ranking |
| `src/model/` | 12 | 118 | Mock Provider / Schema | Prompt escaping, schema extraction, resilience, retry |
| `src/review/` | 11 | 154 | Unit + Mock Model | Review DAG, heuristics, dedup, ranking, 2-stage critic |
| `src/application/` | 4 | 42 | Application Unit | Review orchestration, event emitters |
| `src/renderers/` | 6 | 68 | Unit / Golden | JSON, SARIF, Terminal, TUI state |
| `src/cli/` | 5 | 58 | Subprocess / CLI Mock | CLI flags, exit codes, config loading |
| `test/evaluation/` | 8 | 112 | Mock Harness Integrity | Quarantined harness checks (MockReviewModel) |

---

## 3. Notable Observabilities & Diagnostics During Test Execution

1. **Unsafe npm `tsc` Placeholder Invocation Warning:**
   During diagnostic tool testing, Jest logged:
   ```
   {"level":40,"module":"diagnostics/tools","tool":"tsc","error":{"stdout":"This is not the tsc command you are looking for","stderr":"npm notice run npx 'tsc' --noEmit"},"name":"SubprocessError","msg":"Tool execution failed - graceful degradation"}
   ```
   - *Observation:* When `tsc` is invoked via `npx` in an environment where `typescript` is not globally installed, `npx` hits the unmaintained/phishing placeholder package `tsc` on the npm registry.
   - *Behavior:* Gracefully caught and degraded by `src/analysis/diagnostics/tools.ts`, but adds latency overhead (~800ms) and invokes an untrusted package placeholder.

2. **Fast-path Bypass Verification:**
   During DAG execution for documentation and test files:
   ```
   {"module":"review/dag","allDocFiles":true,"msg":"Fast path: skipping heavy model reviewers on doc-only / test-only diff"}
   {"module":"review/critic","msg":"Zero candidate findings survived deterministic hard floor; skipping Critic LLM call"}
   ```
   Fast path works as designed, bypassing model LLM calls for docs-only and test-only diffs.

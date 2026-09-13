---
task: evaluation-validity
created: 2026-09-12
completed: 2026-09-12
status: complete
---

# Quick Task Summary: Benchmark & Evaluation Methodological Validity Audit

## Objective
Audit and fix the evaluation framework and runner so that mock tests are clearly quarantined as harness integrity checks, a dedicated live evaluation command is provided, realistic Git diff scopes are tested, and live evaluation never falls back to mocks.

## Changes Implemented
1. **Separated Evaluation Modes & Domain Models (`test/evaluation/types.ts`)**:
   - Explicitly defined `EvaluationMode = 'harness_mock' | 'live_pipeline'`.
   - Expanded `EvaluationResult` to record granular per-fixture metrics: `truePositives`, `falsePositives`, `falseNegatives`, `precision`, `recall`, `vulnerableFindings`, `cleanFindings`, `matchedFindings`, `unmatchedFindings`, `latencyMs` (vulnerable and clean), `promptTokens`, `completionTokens`, `totalTokens`, and `apiFailures`.
   - Updated `EvaluationScorecard` with clear labeling and mandatory disclaimers for mock mode.

2. **Refactored Evaluation Harness (`test/evaluation/harness.ts`)**:
   - Initialized temporary Git repositories with committed baseline files.
   - Evaluated vulnerable and clean variants independently against the baseline commit to generate realistic Git diff hunks.
   - Enforced strict live-mode invariants: requires `NVIDIA_API_KEY` and rejects any `MockReviewModel` instance, preventing silent fallback to mocks.
   - Added mandatory disclaimer on mock runs: *"These numbers verify harness integrity only and MUST NOT be cited as evidence of Octate's detection quality."*

3. **Created Live Evaluation CLI Command (`benchmark/evaluate.ts`)**:
   - Added `pnpm exec tsx benchmark/evaluate.ts` supporting `--live`, `--fixtures <filter>`, `--verbose`, and `--report <path>`.
   - Renders rich per-fixture breakdown tables with ANSI styling via `picocolors`.
   - Automatically writes/updates `.planning/phases/08-cli-integration-polish-evaluation/EVALUATION.md`.
   - Updated `scripts/bench.ts` to delegate directly to `benchmark/evaluate.ts`.

4. **Added Live Invariant Unit Tests (`test/evaluation/evaluation.test.ts`)**:
   - Added test asserting that `--live` rejects `MockReviewModel` overrides with an explicit invariant error.
   - Added test asserting that `--live` fails if `NVIDIA_API_KEY` is missing.

5. **Fixed Diagnostic Subprocess File Scoping (`src/analysis/diagnostics/tools.ts`)**:
   - Fixed empty block bug where changed files were omitted from linter arguments.
   - Appended relative file paths to `biome` and other file-level tools, preventing full-repo scanning.
   - Resolved local `node_modules/.bin` binaries to bypass `npx` wrapper overhead.

6. **Empirical Live Pipeline Findings**:
   - Executed live review against `security/sql-injection` using `nvidia/nemotron-3-ultra-550b-a55b`.
   - **Vulnerable Variant:** Successfully detected the SQL injection defect at `src/db/users.ts:12-16` with 100% recall (TP = 1, FN = 0).
   - **Clean Variant:** Structural/Semantic reviewers emitted a false positive on the clean code (type assertion/error handling), resulting in FP = 1.
   - **Empirical Precision:** 50.0% (Failed target > 70%).
   - **False-Positive Rate:** 50.0% (Failed target < 30%).
   - **Live Latency:** 428,432 ms (~7.1 min, failed target < 30s).
   - **Readiness Decision:** `BLOCKED` for production release until clean false-positive suppression and latency optimizations are implemented.

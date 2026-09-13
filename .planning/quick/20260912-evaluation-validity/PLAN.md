---
task: evaluation-validity
created: 2026-09-12
status: in-progress
---

# Quick Plan: Audit and Fix Benchmark & Evaluation for Methodological Validity

## Objective
Audit and fix the Phase 3 benchmark and evaluation implementation so that:
1. MockReviewModel is strictly quarantined as a harness integrity check and never cited as evidence of Octate's detection quality.
2. An explicit live evaluation command `pnpm exec tsx benchmark/evaluate.ts --live` is added.
3. Live evaluation creates isolated temporary Git repos, commits clean baselines, applies realistic diffs, evaluates vulnerable and clean variants independently with `LocalNvidiaProvider`, and records granular per-fixture metrics (TP, FP, FN, precision, recall, latency, tokens, API failures).
4. Live path never silently falls back to mocks, with a test verifying this invariant.
5. Fix the diagnostic file-scoping issue in `src/analysis/diagnostics/tools.ts` that caused token blowup.

## Tasks
- [ ] Task 1: Fix diagnostic file-scoping in `src/analysis/diagnostics/tools.ts` to pass changed files to tool arguments.
- [ ] Task 2: Refactor `test/evaluation/harness.ts` and types to separate harness integrity testing from live pipeline testing, use realistic Git diffs (commit baseline, apply changes), and enforce no-mock fallback when live is requested.
- [ ] Task 3: Create `benchmark/evaluate.ts` with `--live`, `--fixtures`, `--verbose` flags, rich per-fixture table output, and machine-readable output. Update `scripts/bench.ts` and `package.json`.
- [ ] Task 4: Add integrity tests verifying that `--live` fails if `LocalNvidiaProvider` cannot be instantiated or if mock is used, and update `test/evaluation/evaluation.test.ts`.
- [ ] Task 5: Run unit/integration tests and live evaluation, record empirical results, and produce the required audit findings and updated evaluation report.

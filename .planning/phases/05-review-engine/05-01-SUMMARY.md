---
phase: 05-review-engine
plan: 01
subsystem: review
tags: [domain-models, heuristics, dag, concurrency, fault-tolerance]
requires: []
provides:
  - authoritative Layer 5 domain models (ReviewResult, RankedFinding, ScoreBreakdown, ReviewSummary, ExecutionMetadata)
  - deterministic AST diff parsing and heuristic triggers (shouldTriggerSemanticReviewer, shouldTriggerSecurityReviewer, isDeliberateIntentOrMock)
  - staged review DAG concurrency runner with graceful degradation and role-specialized diagnostics
affects:
  - src/review/types.ts
  - src/review/__tests__/mocks.ts
  - src/review/heuristics.ts
  - src/review/heuristics.test.ts
  - src/review/dag.ts
  - src/review/dag.test.ts
tech-stack:
  added: []
  patterns: [staged-dag, bounded-promise-pool, deterministic-heuristics, graceful-degradation, role-sliced-diagnostics]
key-files:
  created:
    - src/review/types.ts
    - src/review/__tests__/mocks.ts
    - src/review/heuristics.ts
    - src/review/heuristics.test.ts
    - src/review/dag.ts
    - src/review/dag.test.ts
key-decisions:
  - "D-01: Baseline Structural Reviewer runs first, followed by conditional Semantic and Security reviewers within PromisePool(2)"
  - "D-02: Deterministic heuristic triggers inspect AST function overlap, control flow keywords, dependency changes, and security patterns without LLM calls"
  - "D-03: Graceful reviewer degradation records warning in metadata on reviewer failure and retains surviving reviewer findings; fail-fast with ModelError only if all reviewers fail"
  - "D-04: Diagnostics sliced per reviewer role (compiler/linters for Structural, tests for Semantic, scanner advisories for Security)"
requirements-completed:
  - REV-01
duration: 10 min
completed: 2026-09-10
---

# Phase 5 Plan 01 Summary: Domain Models, Heuristic Triggers & Staged Review DAG

## Objectives Delivered
- **Domain Models & Test Doubles (`src/review/types.ts`, `src/review/__tests__/mocks.ts`)**:
  - Defined authoritative types: `ReviewSeverity`, `FindingCategory`, `ScoreBreakdown`, `RankedFinding`, `ReviewSummary`, `ExecutionMetadata`, `ReviewResult`, and `ReviewEngineInput`.
  - Implemented `MockReviewModel` with role-based handlers and test fixture generators (`createTestFinding`, `createTestContext`).
- **Deterministic Heuristic Triggers (`src/review/heuristics.ts`)**:
  - `parseDiffRanges`: Unified diff parser extracting line intervals `{ start, end }` per file.
  - `shouldTriggerSemanticReviewer`: Triggers when AST function/method line intervals intersect diff ranges, with control-flow regex fallback for added lines.
  - `shouldTriggerSecurityReviewer`: Triggers on dependency modifications (`package.json`, `.env*`), diff security keywords (`jwt`, `crypto`, `eval`, `admin`), and security symbol identifiers.
  - `isDeliberateIntentOrMock`: Filters deliberate test harnesses (`__tests__`, `mocks/`, `fixtures/`, `dummy_`) and intent markers (`@deprecated`, `@ts-ignore`, `eslint-disable`, `octate:ignore`, `# noqa`).
- **Staged Review DAG Concurrency Runner (`src/review/dag.ts`)**:
  - Orchestrates staged execution: Structural Reviewer baseline first, then conditional Semantic and Security reviewers in parallel bounded by `createPromisePool(2)`.
  - `sliceDiagnosticsForRole`: Slices static analysis diagnostics to match reviewer specialties (compiler for Structural, test runners for Semantic, security scanners for Security).
  - Graceful degradation: Catches single-reviewer errors, appends structured warnings to `metadata.warnings`, retains surviving findings, and throws `ModelError` (exit code 4) only if all reviewers fail.
  - AbortSignal support: Propagates cancellation cleanly across all stages.

## Verification
- Unit tests:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/heuristics.test.ts src/review/dag.test.ts` passed (28/28 tests across 2 suites).
- TypeScript:
  - `npx tsc --noEmit` passed with 0 errors.
- Code style:
  - `npx @biomejs/biome check src/review/` passed with 0 errors and 0 warnings.

## Self-Check: PASSED

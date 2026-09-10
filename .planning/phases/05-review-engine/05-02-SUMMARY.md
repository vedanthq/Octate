---
phase: 05-review-engine
plan: 02
subsystem: review
tags: [deduplication, critic, quality-gate, evidence-merging, schema-repair, deterministic-filtering]
requires:
  - 05-01
provides:
  - Multi-factor deduplication engine with pre-Critic syntactic clustering and post-Critic consolidation (preCriticDeduplicate, postCriticConsolidate, mergeFindingCluster)
  - Attribute conflict resolution with severity escalation, max confidence, reviewer attribution, and evidence union capped at 5
  - Two-stage Critic quality gate with deterministic hard floor (grounding, confidence, evidence count, actionability, intentionality) and LLM critic execution (filterDeterministicHardFloor, executeCriticStage)
  - Resilient Critic invocation with single schema-repaired retry and fail-fast ModelError (exit code 4)
affects:
  - src/review/dedup.ts
  - src/review/dedup.test.ts
  - src/review/critic.ts
  - src/review/critic.test.ts
tech-stack:
  added: []
  patterns: [disjoint-set-union, multi-factor-clustering, deterministic-hard-floor, two-stage-critic, schema-repair-retry, fail-fast-quality-gate]
key-files:
  created:
    - src/review/dedup.ts
    - src/review/dedup.test.ts
    - src/review/critic.ts
    - src/review/critic.test.ts
key-decisions:
  - "D-05 & D-06: Deterministic hard floor pre-filters ungrounded, low confidence (<0.6), empty evidence, non-actionable, and deliberate intent findings before calling LLM Critic"
  - "D-07: Critic LLM failure attempts one immediate schema repair retry; if retry fails, fails fast with ModelError (exit code 4)"
  - "D-08: Actionability gate requires suggestedFix >= 15 chars and rejects generic placeholder phrases"
  - "D-09 & D-10: Multi-factor deduplication clusters by line interval overlap, enclosing AST symbol with same category, and normalized defect signature, resolving conflicts by escalating severity and selecting max confidence"
  - "D-11: Evidence items from duplicate findings are unioned, deduplicated, and strictly capped at 5 items"
  - "D-12: Two-phase deduplication: syntactic clustering before Critic (preCriticDeduplicate) and full consolidation after Critic (postCriticConsolidate)"
requirements-completed:
  - REV-02
  - REV-03
duration: 10 min
completed: 2026-09-10
---

# Phase 5 Plan 02 Summary: Multi-Factor Deduplication & Two-Stage Critic Quality Gate

## Objectives Delivered
- **Multi-Factor Deduplication Engine (`src/review/dedup.ts`)**:
  - `mergeFindingCluster`: Merges duplicate finding clusters by escalating severity (`critical > high > medium > low > info`), adopting maximum confidence, selecting representative finding content, combining reviewer attribution in `contributingReviewers`, unioning unique related files and symbols, and deduplicating evidence anchors capped strictly at 5 items (`slice(0, 5)`).
  - `normalizeTitle`: Strips non-alphanumeric characters, collapses whitespace, and canonicalizes common defect phrases (`null pointer`, `sql injection`, `unhandled error`, `resource leak`, `xss`, `rce`, `path traversal`).
  - `preCriticDeduplicate`: Performs pre-Critic syntactic clustering on DAG output using Disjoint-Set Union (DSU) to collapse overlapping line intervals in the same file and minimize prompt token footprint.
  - `postCriticConsolidate`: Executes multi-factor consolidation on Critic output matching: (1) line interval overlap in the same file, (2) identical enclosing AST symbol and category, or (3) matching normalized title signatures.
- **Two-Stage Critic Quality Gate (`src/review/critic.ts`)**:
  - `isActionableFix`: Verifies concrete remediation by rejecting empty or short suggested fixes (< 15 characters) and generic placeholders (`TODO`, `fix this`, `be careful`, `N/A`).
  - `filterDeterministicHardFloor`: Stage 3A hard floor rejecting ungrounded files or phantom line numbers beyond file length (`groundFinding`), findings below confidence threshold (< 0.6), findings without verified evidence anchors (`evidence.length === 0`), non-actionable suggestions, and intentional test/mock code (`isDeliberateIntentOrMock`).
  - `executeCriticStage`: Stage 3B execution pipeline. Skips LLM call completely (0 tokens, 0 latency) if 0 candidate findings survive Stage 3A. Invokes `critic.v1` prompt on surviving candidates. Retries once with schema repair instructions upon model failure. Fails fast with `ModelError` (exit code 4) if Critic quality gate fails after retry. Propagates abort signals without conversion.

## Verification
- Unit tests:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/dedup.test.ts src/review/critic.test.ts` passed (27/27 tests across 2 suites).
  - Full suite `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/` passed (55/55 tests across 4 suites).
- TypeScript:
  - `npx tsc --noEmit` passed with 0 errors.

## Self-Check: PASSED

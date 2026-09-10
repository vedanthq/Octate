---
phase: 05-review-engine
plan: 03
subsystem: review
tags: [composite-ranking, blast-radius, critical-protection, review-engine, orchestrator, cli-integration, schema]
requires:
  - 05-01
  - 05-02
provides:
  - ReferenceGraph extension with getIncoming accessor
  - Normalized 0-100 composite ranking formula (30% Severity, 20% Confidence, 15% Evidence Strength, 15% Blast Radius, 10% Security Impact, 10% Regression Probability)
  - Critical-protected truncation ensuring Critical severity findings are never dropped
  - Authoritative ReviewEngine orchestrator executing the 5-stage pipeline
  - Barrel export for Layer 5 Review Engine (src/review/index.ts)
  - Configuration schema extension with minConfidence option
  - CLI review command integration wired to ReviewEngine
affects:
  - src/intelligence/graph/reference.ts
  - src/review/ranking.ts
  - src/review/ranking.test.ts
  - src/review/engine.ts
  - src/review/engine.test.ts
  - src/review/index.ts
  - src/config/schema.ts
  - src/config/schema.test.ts
  - src/config/merger.ts
  - src/config/merger.test.ts
  - src/commands/review.ts
  - src/commands/review.test.ts
tech-stack:
  added: []
  patterns: [composite-scoring, logarithmic-blast-radius, critical-protected-truncation, pipeline-orchestrator, barrel-export]
key-files:
  created:
    - src/review/ranking.ts
    - src/review/ranking.test.ts
    - src/review/engine.ts
    - src/review/engine.test.ts
    - src/review/index.ts
  modified:
    - src/intelligence/graph/reference.ts
    - src/config/schema.ts
    - src/config/schema.test.ts
    - src/config/merger.ts
    - src/config/merger.test.ts
    - src/commands/review.ts
    - src/commands/review.test.ts
key-decisions:
  - "D-13: Normalized composite score: 30% Severity, 20% Confidence, 15% Evidence Strength, 15% Blast Radius, 10% Security Impact, 10% Regression Probability"
  - "D-14: Blast radius deterministically computed from ReferenceGraph callers and file importers via logarithmic curve: B = min(100, round(10 + 90 * min(1.0, log2(N + 1) / 4)))"
  - "D-15: Pre-ranking minSeverity filter and Critical-protected truncation: findings with severity === 'critical' are unconditionally preserved, never dropped even when maxFindings is exceeded"
  - "D-16: ReviewEngine orchestrates all 5 pipeline stages (DAG -> Pre-Critic Dedup -> Two-Stage Critic -> Post-Critic Consolidation -> Ranking & Truncation) into authoritative ReviewResult domain object"
requirements-completed:
  - REV-04
  - REV-01
  - REV-02
  - REV-03
duration: 15 min
completed: 2026-09-10
---

# Phase 5 Plan 03 Summary: Composite Ranking, ReviewEngine Orchestration & CLI Integration

## Objectives Delivered
- **ReferenceGraph Extension (`src/intelligence/graph/reference.ts`)**:
  - Implemented `getIncoming(nodeId: string): GraphEdge[]` public accessor to enable dependent and importer lookups on graph nodes and normalized file paths.
- **Confidence-Weighted Composite Ranking Engine (`src/review/ranking.ts`)**:
  - `calculateSeverityScore`: Maps severity level to score (`critical: 100, high: 75, medium: 50, low: 25, info: 10`).
  - `calculateConfidenceScore`: Clamps confidence float to integer `0-100`.
  - `calculateEvidenceStrength`: Base score by evidence count (0=0, 1=40, 2=70, 3+=90) plus multi-file diversity bonus (+10) and line span specificity bonus (+5).
  - `calculateBlastRadius`: Resolves callers of enclosing AST symbols from `SymbolIndex` and file importers from `ReferenceGraph.getIncoming()`, scaling logarithmically: `B = min(100, round(10 + 90 * min(1.0, log2(N + 1) / 4)))` ($N=0 \to 10, N=1 \to 33, N=3 \to 55, N\ge 15 \to 100$).
  - `calculateSecurityImpact`: Maps security category severities (100 down to 20), and awards 15 for non-security findings matching CVE/injection keywords.
  - `calculateRegressionProbability`: Category base score with +15 coupling bonus when blast radius $\ge 50$.
  - `calculateCompositeScore`: Implements exact normalized formula: `0.30 * S + 0.20 * C + 0.15 * E + 0.15 * B + 0.10 * SI + 0.10 * RP`.
  - `rankAndTruncateFindings`: Filters out findings below `minSeverity`, attaches deterministic SHA256 IDs, sorts descending by composite score, and applies Critical-Protected Truncation (Critical findings are never truncated, remaining slots allocated to non-critical findings up to `maxFindings`).
- **ReviewEngine Orchestrator & Public API Barrel (`src/review/engine.ts`, `src/review/index.ts`)**:
  - `ReviewEngine`: End-to-end orchestrator running all 5 pipeline stages:
    1. Cancellation checking (`signal?.throwIfAborted()`) at each stage boundary.
    2. Empty diff short-circuit returning clean `ReviewResult` with 0 tokens.
    3. Stage 1 (DAG): `executeReviewDAG` collecting candidate findings, DAG warnings, triggered reviewers, and model token usage.
    4. Stage 2 (Pre-Critic Dedup): `preCriticDeduplicate` syntactic clustering to minimize prompt tokens.
    5. Stage 3 (Two-Stage Critic): `executeCriticStage` deterministic hard floor + `critic.v1` model quality gate with schema-repaired retry.
    6. Stage 4 (Post-Critic Consolidation): `postCriticConsolidate` multi-factor consolidation pass.
    7. Stage 5 (Ranking & Truncation): `rankAndTruncateFindings` scoring, sorting, and Critical-protected cap.
    8. Assembly of authoritative `ReviewSummary` and `ExecutionMetadata` into authoritative `ReviewResult`.
  - `src/review/index.ts`: Re-exports domain models, `ReviewEngine`, `executeReviewDAG`, `rankAndTruncateFindings`, `preCriticDeduplicate`, `postCriticConsolidate`, `executeCriticStage`, and heuristic trigger functions.
- **Configuration Schema Extension & CLI Integration (`src/config/schema.ts`, `src/commands/review.ts`)**:
  - Added `minConfidence: z.number().min(0).max(1).default(0.6)` to `ReviewConfigSchema` and updated `DefaultConfig.review`.
  - Updated `src/config/merger.ts` with `DeepPartial` support for clean nested CLI and environment overrides.
  - Replaced mock review types in `src/commands/review.ts` with domain imports from `src/review/index.ts`.
  - Wired `executeReview` in `src/commands/review.ts` to instantiate `LocalNvidiaProvider` and invoke `ReviewEngine.run()`.
  - Updated output formatters (`formatDefaultOutput`, `convertToSarif`, `formatQuietOutput`) to consume `RankedFinding` and `ReviewResult`.

## Verification
- **TypeScript**: `npx tsc --noEmit` passed with 0 errors.
- **Unit & Integration Tests**:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/` passed (76/76 tests across 6 suites).
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/config/schema.test.ts src/config/merger.test.ts src/commands/review.test.ts` passed (33/33 tests).
  - Full test suite `npm test` passed (631/631 tests across 54 suites).
- **Code Quality**: `npx biome format` applied formatting across all review, config, and command files.

## Summary of Commits
1. `feat(05-03): reference graph getIncoming accessor and composite ranking`
2. `feat(05-03): review engine orchestrator and public api`
3. `feat(05-03): review config schema minConfidence and cli review command integration`
4. `style(05-03): format code with biome`

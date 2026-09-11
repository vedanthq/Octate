---
phase: 06-application-layer
plan: 03
subsystem: application
tags: [application-orchestrator, review-usecase, progress-streaming, scope-resolution, cli-wiring, signal-lifecycle, exit-codes]
requires:
  - "06-01"
  - "06-02"
provides:
  - functional statusMatrix inspection for staged and working tree changes (getStagedFiles, getWorkingFiles)
  - updated ReviewConfigSchema and DefaultConfig with failOnSeverity defaulting to critical
  - decoupled Layer 5 progress callback (ReviewStageProgressEvent, ReviewStageProgressCallback)
  - end-to-end 8-stage ReviewUseCase application orchestrator (createReviewUseCase, ReviewUseCase)
  - CLI review command with --fail-on option, double-SIGINT lifecycle, renderer integration, and exit code 1 / 130 boundaries
affects:
  - src/config/schema.ts
  - src/repository/scope.ts
  - src/repository/scope.test.ts
  - src/review/types.ts
  - src/review/engine.ts
  - src/review/engine.test.ts
  - src/application/review.ts
  - src/application/index.ts
  - src/application/review.test.ts
  - src/commands/review.ts
  - src/commands/review.test.ts
  - src/cli.ts
tech-stack:
  added: []
  patterns: [end-to-end-orchestrator, double-sigint-trap, clean-listener-cleanup, status-matrix-inspection, pluggable-renderer-wiring, exit-code-preservation]
key-files:
  created:
    - src/application/review.ts
    - src/application/index.ts
    - src/application/review.test.ts
  modified:
    - src/config/schema.ts
    - src/repository/scope.ts
    - src/repository/scope.test.ts
    - src/review/types.ts
    - src/review/engine.ts
    - src/review/engine.test.ts
    - src/commands/review.ts
    - src/commands/review.test.ts
    - src/cli.ts
key-decisions:
  - "D-01/D-02: Added failOnSeverity to ReviewConfigSchema defaulting to 'critical' with 'none'/'off' advisory support, overridable via CLI --fail-on <severity>"
  - "D-05/D-08: ReviewUseCase orchestrates all 8 canonical review stages with live progress streaming to StderrProgressReporter and cancellation signal checks at every boundary"
  - "D-09/D-12: Registered double-SIGINT lifecycle with sigintCount >= 2 immediate exit(130), first-hit graceful AbortController cascade, stderr cancellation banner, and process.off cleanup in finally"
  - "Pitfall 1: Implemented getStagedFiles and getWorkingFiles via git.statusMatrix so --staged and --working populate real file changes without empty-scope false negatives"
  - "Pitfall 2: getScopeOptions gracefully resolves default invocation to working-tree and parses positional refs (ranges base..head / base...head or commits)"
requirements-completed:
  - OUT-02
duration: 25 min
completed: 2026-09-11
---

# Phase 6 Plan 03 Summary: ReviewUseCase Pipeline, Scope Matrix Fix & CLI Lifecycle

## Objectives Delivered
- **Configuration Schema & Scope Matrix Resolution (`src/config/schema.ts`, `src/repository/scope.ts`, `src/repository/scope.test.ts`)**:
  - Extended `ReviewConfigSchema`, `OctateConfigSchema`, and `DefaultConfig` with `failOnSeverity` (`'critical' | 'high' | 'medium' | 'low' | 'info' | 'none' | 'off'`).
  - Implemented `getStagedFiles(repoRoot)` and `getWorkingFiles(repoRoot)` using exact `isomorphic-git` `statusMatrix` evaluation (`[filepath, head, workdir, stage]`), properly extracting `'added'`, `'modified'`, and `'deleted'` file changes.
  - Verified `--staged` and `--working` tests in `scope.test.ts` populate real changed file sets.
- **ReviewEngine Progress Hooks & ReviewUseCase Orchestrator (`src/review/types.ts`, `src/review/engine.ts`, `src/application/review.ts`, `src/application/index.ts`, `src/application/review.test.ts`)**:
  - Defined decoupled `ReviewStageProgressEvent` and `ReviewStageProgressCallback` in Layer 5 (`src/review/types.ts`).
  - Wired `ReviewEngine.run()` to emit start and complete progress events for internal stages: Stage 6 (`review:dag`), Stage 7 (`review:critic`), and Stage 8 (`review:rank`).
  - Implemented `ReviewUseCase` (`src/application/review.ts`) coordinating the complete 8-stage pipeline:
    1. `git:read` (repository discovery, scope resolution, empty diff short-circuiting)
    2. `index:update` (Tree-sitter AST parse and symbol extraction)
    3. `symbols:resolve` (SymbolIndex, PathResolver, ReferenceGraph assembly)
    4. `diagnostics:collect` (static analysis diagnostics via external linters)
    5. `context:build` (ContextEngine token budgeting and context serialization)
    6. `review:dag` (concurrent reviewer DAG execution)
    7. `review:critic` (two-stage critic quality gate)
    8. `review:rank` (composite ranking, critical-protected truncation, ReviewResult assembly)
  - Created public API barrel `src/application/index.ts`.
- **CLI Review Command Wiring, Signal Lifecycle, & Exit Codes (`src/commands/review.ts`, `src/commands/review.test.ts`, `src/cli.ts`)**:
  - Registered `--fail-on <severity>` CLI option and updated `ReviewOptions`.
  - Updated `validateScope` to allow default scope execution (0 flags) while enforcing exclusivity when multiple scope flags conflict.
  - Implemented `getScopeOptions` resolving explicit flags, positional range/commit refs (`HEAD~1..HEAD`, `main...HEAD`, `deadbeef`), and defaulting to `working-tree`.
  - Implemented two-stage SIGINT handler (`sigintCount >= 2` force kill on code 130, first Ctrl+C graceful abort with stderr notice) with mandatory `process.off('SIGINT', ...)` in `finally`.
  - Integrated `StderrProgressReporter`, `createReviewUseCase`, and polymorphic `createRenderer` (`json`, `sarif`, `quiet`, `console`).
  - Implemented blocking exit code policy evaluation: exit code 1 with `formatFailureBanner` on stderr for blocking findings; exit code 0 for passed or advisory runs (`--fail-on none`/`off`).
  - Updated `src/cli.ts` to preserve `process.exitCode` in `main()` and map cancellation errors to exit code 130.

## Verification
- TypeScript type-checking:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npm run build` completed with 0 errors.
- Test suites:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/repository/scope.test.ts src/application/review.test.ts src/commands/review.test.ts` passed (38/38 tests across 3 suites).
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/repository/scope.test.ts src/application/review.test.ts src/commands/review.test.ts src/application/policy.test.ts src/application/progress.test.ts src/renderers/json.test.ts src/renderers/sarif.test.ts src/renderers/quiet.test.ts src/renderers/console.test.ts` passed (84/84 tests across 9 suites).
  - Full repo test suite (`pnpm test`): 61/61 test suites passed, 689/689 tests passed.
- Biome check:
  - `npx @biomejs/biome check src/application/ src/renderers/` passed with 0 errors.
- Acceptance criteria:
  - All grep checks passed across all 3 tasks.

## Self-Check: PASSED

---
phase: 06-application-layer
plan: 01
subsystem: application
tags: [application-layer, domain-types, exit-codes, policy, progress-streaming, stderr-isolation]
requires: []
provides:
  - authoritative Layer 6 domain types (CanonicalReviewStage, ReviewProgressEvent, ReviewFailOnSeverity, ReviewUseCaseOptions, ReviewExitCodes)
  - application test fixtures and MockReviewModel (createMockFinding, createMockReviewResult, MockReviewModel)
  - blocking severity threshold policy with advisory mode bypass and failure banner (isBlockingFinding, countBlockingFindings, evaluateExitCode, formatFailureBanner)
  - stderr-isolated canonical progress reporting with mode suppression for quiet, json, and sarif (StderrProgressReporter)
affects:
  - src/application/types.ts
  - src/application/__tests__/mocks.ts
  - src/application/policy.ts
  - src/application/policy.test.ts
  - src/application/progress.ts
  - src/application/progress.test.ts
tech-stack:
  added: []
  patterns: [domain-contracts, deterministic-policy, stderr-stream-isolation, tty-progress-overwriting, zero-stdout-pollution]
key-files:
  created:
    - src/application/types.ts
    - src/application/__tests__/mocks.ts
    - src/application/policy.ts
    - src/application/policy.test.ts
    - src/application/progress.ts
    - src/application/progress.test.ts
key-decisions:
  - "D-01/D-02: SEVERITY_LEVELS maps critical (5) down to info (1); isBlockingFinding and evaluateExitCode compare findingLevel >= thresholdLevel, while 'none' and 'off' bypass blocking for advisory CI mode"
  - "D-03: Blocking threshold policy evaluates final visible ranked findings list to guarantee exit code consistency"
  - "D-04: formatFailureBanner prints red picocolors failure notice with grammatically correct singular/plural phrasing"
  - "D-05/D-06: ReviewProgressEvent schema standardizes 8 typed canonical review stages with optional step counters and payload"
  - "D-07: StderrProgressReporter disables all output when quiet, json, or sarif is true, preserving stdout stream cleanliness for machine-readable consumers"
  - "D-08: TTY streams use \\r\\x1b[K carriage return overwriting, while non-TTY streams emit only on complete and error to avoid CI log clutter"
requirements-completed:
  - OUT-02
duration: 12 min
completed: 2026-09-11
---

# Phase 6 Plan 01 Summary: Domain Types, Severity Policy & Stderr Progress Streaming

## Objectives Delivered
- **Domain Models & Exit Codes (`src/application/types.ts`, `src/application/__tests__/mocks.ts`)**:
  - Defined 8 canonical review stages in chronological sequence: `git:read`, `index:update`, `symbols:resolve`, `diagnostics:collect`, `context:build`, `review:dag`, `review:critic`, `review:rank`.
  - Defined `ReviewProgressEvent`, `ReviewProgressStatus`, `ReviewProgressStep`, and `ReviewProgressCallback`.
  - Defined `ReviewFailOnSeverity` union with advisory modes (`'none' | 'off'`).
  - Defined `ReviewUseCaseOptions` orchestration contract.
  - Defined standardized `ReviewExitCodes` mapping: `SUCCESS: 0`, `BLOCKING_FINDINGS: 1`, `CONFIG_ERROR: 2`, `REPOSITORY_ERROR: 3`, `MODEL_ERROR: 4`, `INTERNAL_ERROR: 5`, `CANCELLED: 130`.
  - Built test fixtures in `__tests__/mocks.ts`: `createMockFinding`, `createMockReviewResult`, and `MockReviewModel`.
- **Severity Threshold Policy (`src/application/policy.ts`, `src/application/policy.test.ts`)**:
  - Numeric severity weighting: `critical: 5`, `high: 4`, `medium: 3`, `low: 2`, `info: 1`.
  - `isBlockingFinding`: Evaluates finding severity against threshold; returns `false` on `'none'` or `'off'`.
  - `countBlockingFindings`: Tallies blocking findings across result array.
  - `evaluateExitCode`: Returns `1` when blocking findings exist, `0` when clean or advisory.
  - `formatFailureBanner`: Colorized failure banner using `picocolors` with singular/plural noun formatting.
- **Stderr Progress Streaming (`src/application/progress.ts`, `src/application/progress.test.ts`)**:
  - `StderrProgressReporter`: Routes formatted progress exclusively to `stderr`.
  - Non-interactive mode suppression: Automatically disables progress when `quiet`, `json`, or `sarif` options are enabled.
  - Terminal awareness: Writes carriage return `\r\x1b[K` updates on TTY streams and restricts non-TTY streams to `complete` and `error` events.
  - Line cleanup: Provides `clear()` method for terminal line resets before final rendering.

## Verification
- Unit test suites:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest src/application/policy.test.ts src/application/progress.test.ts` passed (23/23 tests across 2 suites).
- TypeScript:
  - `npm run build` (`tsc`) passed with 0 errors.
- Biome check:
  - `npx @biomejs/biome check src/application/` passed with 0 errors.
- Acceptance criteria grep checks:
  - All 10 grep assertions passed.

## Self-Check: PASSED

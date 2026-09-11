---
phase: 07-terminal-presentation
plan: 03
subsystem: renderers/tui
tags: [ink, react, tui, renderer, review-command, lifecycle, progress-streaming, exit-code]

requires:
  - phase: 07-terminal-presentation
    plan: 01
    provides: Terminal lifecycle manager, ANSI highlighter, git diff, clipboard
  - phase: 07-terminal-presentation
    plan: 02
    provides: Pure state reducer, presentation components, focus-locked modals, root App coordinator
provides:
  - InteractiveTuiRenderer implementing ReviewRenderer with alternate screen buffer lifecycle and progress streaming
  - 'tui' OutputFormat registered in createRenderer factory
  - CLI review command integration with automatic TTY/CI/TERM detection and graceful fallback to ConsoleRenderer
  - Live 8-stage progress event dispatching into running Ink app without buffer flicker
  - In-place re-review handling via onReReview preserving full context
  - Dynamic file contents and git diff text resolution for all finding references
  - Real-time exit code calculation based strictly on unsuppressed blocking findings on session exit
affects:
  - CLI execution workflows (octate review)
  - CI/automation pipelines (--json, --sarif, --quiet, CI=true)

tech-stack:
  added: []
  patterns:
    - ReviewRenderer interface implementation driving React 19 / Ink 7 lifecycle
    - Dual-mode execution (interactive TUI vs headless console/automation) selected deterministically via environment interrogation
    - Event-driven live progress streaming via EventEmitter bridge into React hooks
    - Primary screen restoration guarantee through unconditional try/finally lifecycle.exit() hooks

key-files:
  created:
    - src/renderers/tui/renderer.ts
    - src/renderers/tui/renderer.test.ts
  modified:
    - src/renderers/index.ts
    - src/renderers/tui/app.tsx
    - src/commands/review.ts
    - src/commands/review.test.ts

key-decisions:
  - "InteractiveTuiRenderer starts alternate screen buffer immediately and renders in progress view mode, streaming live events and transitioning smoothly to workspace without screen teardown."
  - "CLI interrogation through shouldUseTui strictly disables TUI in CI environments (CI=true), dumb terminals (TERM=dumb), non-TTY pipes, or when automation flags (--json, --sarif, --quiet, --no-tui) are present."
  - "Session exit code is dynamically computed against unsuppressed findings at quit time: returns 1 if active blocking findings remain, 0 if clean or all blocking findings were suppressed in-session."

patterns-established:
  - "Pluggable review renderers: all presentation formats (console, json, sarif, quiet, tui) share the unified ReviewRenderer contract."
  - "Clean error traps: unhandled exceptions during pipeline execution guarantee alternate screen teardown via tuiRenderer.exit()."

requirements-completed:
  - TUI-01
  - TUI-02
  - TUI-03
  - OUT-01

duration: 18min
completed: 2026-09-11
---

# Phase 7: Plan 03 Summary

**Interactive TUI renderer implementation conforming to `ReviewRenderer`, registration in renderer factory, CLI review command wiring with environment interrogation, live progress streaming, and comprehensive verification.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-11T16:19:00Z
- **Completed:** 2026-09-11T16:37:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Implemented `InteractiveTuiRenderer` in `src/renderers/tui/renderer.ts` implementing `ReviewRenderer`:
  - Immediate entry into alternate screen buffer (`\x1b[?1049h`) and hidden cursor (`\x1b[?25l`) on `start()`.
  - Progress streaming via `dispatchProgress(event)` driving `<ProgressView />` during review execution.
  - Smooth in-place transition to findings workspace upon `dispatchResult(result)` without buffer flickering or terminal reset.
  - In-place re-review handler `onReReview` preserving active invocation parameters.
  - Automatic loading of file contents and git diff text across all unique finding and evidence file paths.
  - Exit code policy: evaluates `finalBlockingCount` strictly against unsuppressed findings (`!finalSuppressedIds.has(f.id)`), setting `process.exitCode` to 1 or 0 and printing concise stderr status.
  - Unconditional primary screen and cursor restoration in `finally` block and error traps.
- Registered `'tui'` in `OutputFormat` and `createRenderer` switch statement in `src/renderers/index.ts`.
- Integrated interactive TUI routing in `src/commands/review.ts` using `shouldUseTui()` to inspect TTY, CI, TERM, and output flags.
- Updated `src/commands/review.test.ts` with 10 integration tests covering TUI selection, `--no-tui`, `CI=true`, `TERM=dumb`, automation formats (`--json`, `--sarif`, `--quiet`), exit code evaluation, and exception error traps.
- Validated with 100% passing tests (68 suites, 750 tests) across the entire project.

## Task Commits

Each task was committed atomically:

1. **Task 07-03-01: implement InteractiveTuiRenderer and register tui format** - `711f902` (feat)
2. **Task 07-03-02: wire CLI review command with TUI detection and progress streaming** - `2bc0690` (feat)

## Files Created/Modified

- `src/renderers/tui/renderer.ts` - `InteractiveTuiRenderer` implementing `ReviewRenderer`
- `src/renderers/tui/renderer.test.ts` - Unit tests for `InteractiveTuiRenderer`
- `src/renderers/index.ts` - Exported `'tui'` format and updated `createRenderer`
- `src/renderers/tui/app.tsx` - Added `actionEmitter` bridge and suppressedIds propagation to `onQuit`
- `src/commands/review.ts` - CLI review command with TUI detection and progress callbacks
- `src/commands/review.test.ts` - Routing, fallback, exit code, and error trap tests

## Decisions Made

- When `isInteractiveTui` is true, `InteractiveTuiRenderer` is started before pipeline execution starts so users receive immediate terminal buffer switch and live visual feedback from step 1/8 (`git:read`).
- Kept domain layers and review use case strictly independent from Ink and React, bridging live progress through `dispatchProgress` callbacks.

## Deviations from Plan

None - plan executed exactly as specified.

## Self-Check: PASSED
- `src/renderers/tui/renderer.ts`: verified exists on disk and exports `InteractiveTuiRenderer`
- `src/renderers/index.ts`: verified exports `'tui'` and handles `case 'tui'`
- `src/commands/review.ts`: verified calls `shouldUseTui` and routes to `InteractiveTuiRenderer`
- `src/renderers/tui/renderer.test.ts`: verified 5 passing tests
- `src/commands/review.test.ts`: verified 27 passing tests (including 10 `runReview` routing tests)
- `npx tsc --noEmit` clean with 0 errors
- `npx @biomejs/biome check src/renderers/tui/ src/renderers/index.ts src/commands/review.ts src/commands/review.test.ts` clean with 0 errors
- Full test suite passes: 68 suites, 750 tests passed

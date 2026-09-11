---
phase: 07-terminal-presentation
plan: 01
subsystem: renderers/tui
tags: [ink, react, terminal, alternate-screen, syntax-highlighting, diff, clipboard, osc52]

requires:
  - phase: 06-application-layer
    provides: ReviewUseCase, ReviewResult contracts, policy thresholds, and progress events
provides:
  - TUI domain state types, navigation items, actions, and modal types
  - TerminalLifecycleManager with alternate screen entry and unconditional exit traps
  - TTY/CI detection and fallback predicate (shouldUseTui)
  - Zero-dependency syntax highlighter and gutter formatter using picocolors
  - Unified git diff hunk extractor for target finding files
  - Cross-platform clipboard utility supporting OSC 52 and native OS fallback
affects:
  - 07-02 (TUI state reducer, Ink presentation components, modal overlays)
  - 07-03 (InteractiveTuiRenderer, CLI integration, progress wiring)

tech-stack:
  added:
    - ink 7.1.1
    - react 19.2.8
  patterns:
    - Zero-dependency ANSI formatting with picocolors createColors
    - Alternate screen buffer with signal-safe lifecycle management
    - OSC 52 terminal clipboard sequences with OS binary fallback

key-files:
  created:
    - src/renderers/tui/types.ts
    - src/renderers/tui/terminal.ts
    - src/renderers/tui/terminal.test.ts
    - src/renderers/tui/syntax.ts
    - src/renderers/tui/syntax.test.ts
    - src/renderers/tui/diff.ts
    - src/renderers/tui/diff.test.ts
    - src/renderers/tui/clipboard.ts
    - src/renderers/tui/clipboard.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - tsconfig.json
    - jest.config.ts

key-decisions:
  - "Configured picocolors createColors(true) in syntax highlighter to ensure deterministic ANSI sequences regardless of TTY detection in tests and headless environments."
  - "Used OSC 52 escape sequences as primary clipboard copy path to enable remote SSH and tmux clipboard operations without OS desktop clipboard daemons."
  - "Configured react-jsx JSX transform in tsconfig and updated Jest to treat tsx as ESM."

patterns-established:
  - "Gutter formatting: right-aligned numeric line width calculation with red > target pointers and dim │ context lines."
  - "Single-pass regex alternation for syntax tokenization to avoid token overlap or ANSI code corruption."

requirements-completed:
  - TUI-01
  - OUT-01

duration: 12min
completed: 2026-09-11
---

# Phase 7: Plan 01 Summary

**Foundational TUI state models, alternate screen lifecycle management, zero-dependency ANSI syntax highlighting, unified diff hunk extraction, and cross-platform clipboard copying.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-11T15:50:00Z
- **Completed:** 2026-09-11T16:02:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Installed `ink@7.1.1` and `react@19.2.8` dependencies, configured `tsconfig.json` with `jsx: react-jsx`, and enabled `.tsx` test handling in `jest.config.ts`.
- Defined pure domain contracts in `src/renderers/tui/types.ts` for immutable `TuiState`, `TuiAction`, `NavItem`, and modal types.
- Implemented `TerminalLifecycleManager` in `src/renderers/tui/terminal.ts` with alternate screen buffer (`\x1b[?1049h`), cursor hiding (`\x1b[?25l`), and signal traps (`exit`, `SIGINT`, `SIGTERM`, `uncaughtException`) ensuring clean terminal restoration.
- Implemented `shouldUseTui` fallback predicate checking `isTTY`, `CI`, `TERM === 'dumb'`, `--plain`, `--no-tui`, and structured output flags (`--json`, `--sarif`, `--quiet`).
- Implemented `highlightTokens`, `formatCodeSnippet`, and `formatDiffLines` in `src/renderers/tui/syntax.ts` with ANSI injection control-char sanitization (T-07-02) and dynamic gutters.
- Implemented `extractFileDiffHunk` in `src/renderers/tui/diff.ts` to isolate file-specific diff hunks from multi-file git diffs.
- Implemented `copyToClipboard` in `src/renderers/tui/clipboard.ts` supporting OSC 52 escape sequences and OS command fallback, plus `formatPatchPreview`.

## Task Commits

Each task was committed atomically:

1. **Task 07-01-01: install dependencies and configure terminal lifecycle and types** - `efdbc0a` (feat)
2. **Task 07-01-02: implement syntax highlighter, diff extractor, and clipboard utility** - `41e1252` (feat)

## Files Created/Modified

- `package.json` - Added ink 7.1.1 and react 19.2.8 dependencies
- `tsconfig.json` - Configured jsx react-jsx transform
- `jest.config.ts` - Added tsx extensions and ESM support
- `src/renderers/tui/types.ts` - TUI domain state and action contracts
- `src/renderers/tui/terminal.ts` - Screen lifecycle and TTY fallback
- `src/renderers/tui/terminal.test.ts` - Unit tests for terminal manager and shouldUseTui
- `src/renderers/tui/syntax.ts` - Token highlighter and gutter decorator
- `src/renderers/tui/syntax.test.ts` - Unit tests for syntax and diff formatter
- `src/renderers/tui/diff.ts` - Git diff hunk parser
- `src/renderers/tui/diff.test.ts` - Unit tests for diff parser
- `src/renderers/tui/clipboard.ts` - OSC 52 and OS clipboard utility
- `src/renderers/tui/clipboard.test.ts` - Unit tests for clipboard utility

## Decisions Made

- Configured `picocolors.createColors(true)` in `syntax.ts` to guarantee color escape codes in all environments.
- Sanitized control characters `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]` to protect against terminal ANSI injection from untrusted source snippets.

## Deviations from Plan

None - plan executed exactly as specified.

## Self-Check: PASSED
- `src/renderers/tui/types.ts`: verified exists on disk
- `src/renderers/tui/terminal.ts`: verified exists on disk
- `src/renderers/tui/syntax.ts`: verified exists on disk
- `src/renderers/tui/diff.ts`: verified exists on disk
- `src/renderers/tui/clipboard.ts`: verified exists on disk
- All test suites passing (23 tests across 4 suites)
- `npx tsc --noEmit` clean with 0 errors
- `npx @biomejs/biome check src/renderers/tui/` clean with 0 errors

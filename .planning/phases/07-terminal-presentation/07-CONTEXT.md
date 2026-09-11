# Phase 7: Terminal Presentation - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 delivers the interactive Terminal User Interface (TUI) workspace for Octate using Ink 7.1.1 and React 19, allowing developers to interactively explore, inspect, explain, and suppress review findings with keyboard-first navigation and live progress streaming.

Non-interactive renderers (`JsonRenderer`, `SarifRenderer`, `QuietRenderer`, `ConsoleRenderer`) were implemented and verified in Phase 6. Phase 7 implements `InteractiveTuiRenderer` adhering to the existing `ReviewRenderer` interface (`render(result: ReviewResult): Promise<void> | void`) and completes requirements `TUI-01`, `TUI-02`, `TUI-03`, and `OUT-01`.

Core review and application logic remain strictly decoupled from Ink (zero Ink/React imports in `src/application/`, `src/review/`, or `src/intelligence/`).
</domain>

<decisions>
## Implementation Decisions

### TUI Layout & Pane Structure
- **D-01 (Responsive split layout):** Responsive layout rendering side-by-side (left navigator ~35-40% width, right details & code ~60-65% width) on wide terminals (>= 100 columns), automatically collapsing to vertically stacked (top navigator, bottom details) on narrower terminals (< 100 columns).
- **D-02 (Grouped severity sections):** Navigator groups findings under severity sections (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW/INFO`) with collapsible/expanded headers, findings sorted by composite ranking within each group, displaying severity icon/badge, `file:line`, category, and title.
- **D-03 (Standard header and footer bars):** 1-2 line top header (Octate banner, repo name, scope/branch, total findings breakdown, blocking status badge) and persistent bottom footer cheatsheet (`↑/↓: Nav  Enter: Expand  f: Fix  e: Explain  s: Suppress  d: Diff  ?: Help  q: Quit`).
- **D-04 (Single-focus list with shortcut overlays):** Navigator list maintains active cursor (`↑`/`k`, `↓`/`j`); pressing shortcut keys (`d`, `e`, `f`, `c`, `?`) opens dedicated modal/full-screen overlays; `Esc` immediately closes the overlay and returns focus to the list.

### Source & Diff Snippet Presentation
- **D-05 (Source snippet with diff toggle):** Detail pane defaults to showing source code snippet context around the finding (±4 context lines with line numbers and highlighted issue range); pressing `d` toggles to the git diff hunk view.
- **D-06 (Evidence breadcrumbs):** Primary snippet displayed by default with an evidence indicator bar (`[1: Primary] [2: Caller] [3: Sanitizer gap]`); pressing `Tab` or `[` / `]` cycles through snippets for all supporting evidence locations.
- **D-07 (Lightweight ANSI styling):** Clean line-number gutter (`142 │ ...`), diff color markers (`+` green, `-` red, `>` yellow for finding lines), and regex-based token coloring (keywords, strings, comments) using `picocolors`. No heavy external tokenizers needed.
- **D-08 (Modal Before/After suggested fix):** Pressing `f` opens a dedicated Before/After diff overlay showing proposed code changes, explanation, and action shortcuts (`c: Copy snippet, Esc: Close`).

### Interactive Action Handling
- **D-09 (Clipboard copy & patch preview):** Pressing `f` displays patch preview; pressing `c` copies fix code to clipboard, or `p` outputs git-apply compatible patch. No autonomous silent file mutations.
- **D-10 (Session-level dismissal with toggle):** Pressing `s` marks finding as suppressed/dismissed in the active session (dimmed/strikethrough), recalculating blocking severity status and exit code in real time; pressing `s` again un-suppresses.
- **D-11 (Structured reasoning explain modal):** Pressing `e` opens full-screen scrollable overlay with root-cause explanation, blast radius & affected symbols from ReferenceGraph, critic justification, and verification guidance.
- **D-12 (In-place re-review):** Pressing `r` switches TUI into the 8-stage progress tracker, re-runs `ReviewUseCase.execute()` in-place, and refreshes findings explorer seamlessly without restarting process.

### Progress-to-Results Lifecycle & Clean Exit
- **D-13 (Alternate screen buffer from start):** Enters alternate screen buffer immediately upon start; Ink renders an elegant 8-stage progress tracker, then transitions smoothly into findings workspace when review finishes.
- **D-14 (Celebratory clean dashboard on 0 findings):** When review produces 0 findings (or 0 non-ignored findings), renders a green celebratory screen (`✓ Clean Review — No issues found in {scope}`) with summary metrics (files analyzed, duration) and `Press q to return to terminal`.
- **D-15 (Comprehensive TTY/CI auto-fallback):** Automatically bypasses Ink TUI and uses `ConsoleRenderer` if: `!process.stdout.isTTY`, `process.env.CI` is true, `TERM === 'dumb'`, or explicit `--no-tui` / `--plain` CLI flag.
- **D-16 (Clean terminal restore & exit code propagation):** Quitting (`q` or `Ctrl+C`) restores alternate screen cleanly (preserving user shell history intact), prints a concise 1-line summary to stderr (e.g. `Octate review finished: 2 blocking findings (exit 1)` or `Octate review finished: clean (exit 0)`), and exits with the final calculated exit code.

### the agent's Discretion
- Visual theme details (exact borders: single vs rounded, ANSI color palette tuning matching Octate brand).
- Responsive breakpoint calculation using terminal dimensions (`process.stdout.columns`, `process.stdout.rows`).
- Clipboard copy cross-platform fallback handling (e.g. via platform commands or OSC 52 escape sequences).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Architecture
- `.planning/REQUIREMENTS.md` § Interactive TUI (TUI-01, TUI-02, TUI-03, OUT-01)
- `.planning/ROADMAP.md` § Phase 7: Terminal Presentation
- `AGENTS.md` § TUI Framework & Constraints (Ink 7.1.1, React 19.2.8, picocolors, pure core separation)

### Upstream Contracts & Types
- `src/renderers/types.ts` — `ReviewRenderer`, `RendererOptions`, and `writeRenderedOutput`
- `src/review/types.ts` — `ReviewResult`, `RankedFinding`, `FindingEvidence`, `Severity`
- `src/application/types.ts` — `ReviewProgressEvent`, `CanonicalReviewStage`, `ReviewExitCodes`
- `src/application/policy.ts` — `evaluateExitCode`, `countBlockingFindings`, `formatFailureBanner`
- `src/application/review.ts` — `ReviewUseCase`, `ReviewUseCaseOptions`
- `src/commands/review.ts` — CLI command entry, output format routing, signal handling
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderers/console.ts`: `formatBadge` and ANSI color palettes for severities (`critical: red`, `high: magenta`, `medium: yellow`, `low: blue`, `info: cyan`).
- `src/application/policy.ts`: `isBlockingFinding`, `countBlockingFindings`, `evaluateExitCode` for real-time recalculation on finding suppression (`s`).
- `src/application/progress.ts`: `CANONICAL_REVIEW_STAGES` (8 stages) for progress tracking view.
- `src/commands/review.ts`: CLI wiring currently selecting `console` when interactive; will route to `tui` (`InteractiveTuiRenderer`) when TTY is true and no automation flags are passed.

### Established Patterns
- Pluggable `ReviewRenderer`: `InteractiveTuiRenderer` implements `ReviewRenderer.render(result: ReviewResult): Promise<void> | void`.
- Exact optional property types: `prop?: Type | undefined` across all interfaces.
- ES module imports with `.js` extensions.

### Integration Points
- `src/renderers/interactive.ts` or `src/tui/`: Ink component tree (`App`, `Header`, `FindingList`, `DetailPane`, `CodeSnippet`, `Modals`).
- `src/renderers/index.ts`: Register `tui` in `OutputFormat` and `createRenderer` factory.
- `src/commands/review.ts`: Route interactive TTY invocations to `tui` renderer.
</code_context>

<specifics>
## Specific Ideas
- "Responsive split: Side-by-side on wide screens (>= 100 cols); vertically stacked on narrower terminals (< 100 cols)."
- "Single-focus list with shortcut overlays: List always maintains active cursor (↑/k, ↓/j); pressing 'd', 'e', 'f', 'c', or '?' opens dedicated modal/full-view overlay; Esc closes overlay."
- "Evidence breadcrumbs: Primary snippet shown by default with an evidence indicator bar ('[1: Primary] [2: Caller]'); Tab or '[' / ']' cycles snippets."
- "Modal Before/After diff: Pressing 'f' opens dedicated overlay showing colorized Before/After diff with 'c: Copy snippet, Esc: Close'."
- "Session-level dismissal with unsuppress toggle: Pressing 's' marks finding as dismissed (dimmed/strikethrough), recalculating blocking status in real time."
- "Alternate screen from start: Enter alternate screen buffer immediately; Ink renders 8-stage progress tracker, then transitions into findings workspace."
</specifics>

<deferred>
## Deferred Ideas
- Autonomous file patch application from TUI (deferred per PROJECT.md constraint: "no autonomous fixes before review quality proven").
- Persistent `.octate/suppressions.json` file authoring from interactive prompt (deferred to post-v1; session suppression supported now).
- Interactive Git hunk staging directly from TUI (feature for future milestone).
</deferred>

---

*Phase: 07-terminal-presentation*
*Context gathered: 2026-09-11*

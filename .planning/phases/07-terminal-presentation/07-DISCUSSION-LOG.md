# Phase 7: Terminal Presentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 07-terminal-presentation
**Areas discussed:** TUI Layout & Pane Structure, Source & Diff Snippet Presentation, Interactive Action Handling, Progress-to-Results Lifecycle & Clean Exit

---

## TUI Layout & Pane Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Responsive split | Side-by-side (left list, right details/diff) on wide screens (>= 100 cols); vertically stacked on narrower terminals (< 100 cols). | ✓ |
| Fixed side-by-side | Dedicated left finding navigator (35-40% width) and right details/diff pane (60-65% width) with minimum width warning if terminal < 80 cols. | |
| Focus/drill-down style | Full-width findings list; pressing Enter or right-arrow transitions to a dedicated full-width detail & diff view with Esc to go back. | |

**User's choice:** Responsive split (side-by-side on wide screens >= 100 cols; vertically stacked on narrower terminals).
**Notes:** Adapts smoothly across developer terminal window sizes without clipping or horizontal overflow.

---

## Finding Navigator List Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by Severity sections | Collapsible/expanded headers (Critical, High, Medium, Low/Info) with findings sorted by composite ranking within each group, showing severity icon/badge, file:line, and title. | ✓ |
| Flat composite ranking list | Pure linear list ordered by composite score (1 to N) with colorized severity badges, category pills, and confidence percentage, matching exact ranking order. | |
| Top tab bar filter | Tab bar switching between All, Critical, High, Medium, Low/Info (via Tab/Shift-Tab or number keys 1-5), rendering a clean filtered list underneath. | |

**User's choice:** Grouped by Severity sections.
**Notes:** Helps developers prioritize blocking findings immediately while retaining composite score ordering within each severity tier.

---

## Header and Footer Bars

| Option | Description | Selected |
|--------|-------------|----------|
| Standard TUI Bar | 1-2 line top header (Octate banner, repo, scope/branch, total count, blocking status badge) and persistent bottom footer cheatsheet ('↑/↓: Nav  Enter: Expand  f: Fix  e: Explain  s: Suppress  d: Diff  ?: Help  q: Quit'). | ✓ |
| Minimal Bars | Single-line header (repo + count badge) and single-line dynamic footer that only displays hotkeys relevant to the current focused pane or modal. | |
| Rich Dashboard Header | Header box displaying repository name, scope, model provider, latency/duration, and severity count breakdown pills; footer with hotkeys and exit code preview. | |

**User's choice:** Standard TUI Bar.
**Notes:** Provides vital context (repo, scope, counts, blocking status) without consuming excessive vertical terminal real estate.

---

## Focus and Modal Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Single-focus list with shortcut overlays | List always maintains active cursor (↑/k, ↓/j); pressing 'd', 'e', 'f', 'c', or '?' opens a dedicated modal/full-view overlay; 'Esc' closes overlay and returns to list. | ✓ |
| Vim-style mode switching | List mode (j/k navigates findings, Enter focuses details pane) -> Detail mode (j/k scrolls detail/diff text, Esc returns focus to list pane). '?' opens centered help modal. | |
| Tab-based pane cycling | Tab/Shift-Tab toggles active focus border between List pane and Detail pane; arrow keys scroll whichever pane has active focus. '?' opens modal overlay. | |

**User's choice:** Single-focus list with shortcut overlays.
**Notes:** Highly ergonomic and fast keyboard navigation without complex focus-ring cycling.

---

## Code Context & Diff Display

| Option | Description | Selected |
|--------|-------------|----------|
| Source snippet with diff toggle | Default to source context around the finding (±4 lines with line numbers and highlighted issue range); pressing 'd' toggles to git diff view. | ✓ |
| Always unified diff hunk | Display the exact git diff hunk (additions '+', deletions '-') that introduced the change, with finding line annotations. | |
| Full file pager | Embed a scrollable file view showing the full file, centered on the finding range with syntax coloring. | |

**User's choice:** Source snippet with diff toggle.
**Notes:** Offers immediate surrounding code clarity with fast access to raw git diff hunk via 'd'.

---

## Multi-Location Evidence Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence breadcrumbs | Primary snippet shown by default with an evidence indicator bar ('[1: Primary] [2: Caller] [3: Sanitizer gap]'); press Tab or '[' / ']' to cycle snippets. | ✓ |
| Collapsible evidence cards | List supporting evidence items below the primary snippet as collapsible accordions; pressing Enter on an evidence item expands its snippet. | |
| Static vertical list | Display primary code snippet followed by compact 1-line evidence summaries without snippet expansion. | |

**User's choice:** Evidence breadcrumbs.
**Notes:** Makes multi-location taint/call traces effortless to inspect without cluttering the pane.

---

## Syntax Highlighting & Code Styling

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight ANSI highlighting | Clean line-number gutter, diff color markers (+ green, - red, > yellow for finding line), and regex-based token coloring (keywords, strings, comments) via picocolors. | ✓ |
| Minimal clean gutter | Line numbers and diff +/- indicators only, using terminal default foreground with bold finding lines, avoiding external tokenizers. | |
| Rich syntax highlighter | Full language tokenizer (cli-highlight / prism) for comprehensive syntax coloring per file extension. | |

**User's choice:** Lightweight ANSI highlighting.
**Notes:** Extremely fast rendering in Ink without bloated grammar dependencies or startup latency.

---

## Suggested Fix Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Modal Before/After diff | Pressing 'f' opens a dedicated overlay showing a colorized Before/After diff of the fix, rationale, and instructions ('c: Copy snippet, Esc: Close'). | ✓ |
| Inline fix card | Render the suggested fix directly below the finding description in the detail pane, highlighting replacement code with green borders. | |
| Dedicated Fix Tab | Tab bar in detail pane ('[Details] [Diff] [Fix]') where pressing 'f' toggles directly to the Fix tab view. | |

**User's choice:** Modal Before/After diff.
**Notes:** Gives a prominent, clear comparison of current vs proposed fix.

---

## Fix Action ('f') Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Clipboard copy & patch preview | Pressing 'f' displays the patch modal; pressing 'c' copies the fix code to system clipboard, or 'p' outputs a git-apply compatible patch. No autonomous silent file mutations. | ✓ |
| Interactive patch confirmation | Show the diff modal; pressing 'y' / 'apply' prompts for confirmation and writes the patch directly to the file on disk. | |
| Display instructions only | Show the suggested fix code and description as an educational reference without clipboard or write operations. | |

**User's choice:** Clipboard copy & patch preview.
**Notes:** Aligns with project safety constraint ("no autonomous fixes before review quality proven") while empowering developer action.

---

## Suppress Action ('s')

| Option | Description | Selected |
|--------|-------------|----------|
| Session-level dismissal with unsuppress toggle | Pressing 's' marks the finding as dismissed (dimmed/strikethrough), recalculates blocking status / exit code in real time, and can be toggled back. | ✓ |
| Prompt choice | On 's', prompt user with quick options ('[s] Session only', '[p] Add to permanent .octate/suppressions.json', 'Esc: Cancel'). | |
| Comment generator | Show inline suppression code snippet to copy (e.g. '// octate-ignore-next-line: rule-id') without modifying runtime state. | |

**User's choice:** Session-level dismissal with unsuppress toggle.
**Notes:** Allows immediate triage and exit code adjustment during interactive review without mutating project files prematurely.

---

## Explain Action ('e')

| Option | Description | Selected |
|--------|-------------|----------|
| Structured reasoning modal | Full-screen scrollable overlay with root-cause explanation, blast radius & affected symbols from ReferenceGraph, critic justification, and verification steps. | ✓ |
| Context drawer | Tabbed modal switching between '[1] Full Explanation', '[2] Graph Callers & Dependencies', and '[3] Diagnostics & Evidence Details'. | |
| Simple popup | Lightweight centered box with the complete raw explanation and impact description. | |

**User's choice:** Structured reasoning modal.
**Notes:** Surpasses typical superficial linters by giving senior-engineer depth and context directly on demand.

---

## Re-review Action ('r')

| Option | Description | Selected |
|--------|-------------|----------|
| In-place re-review | Switch TUI to the 8-stage progress view, re-run ReviewUseCase, and refresh the findings explorer seamlessly in the same terminal session. | ✓ |
| Confirmation prompt with options | Ask '[r] Re-run review', '[c] Clear cache & re-run', 'Esc: Cancel' before re-triggering the pipeline. | |
| Exit with instructions | Exit the TUI and output 'To re-run review with fresh changes: octate review'. | |

**User's choice:** In-place re-review.
**Notes:** Enables rapid developer iteration cycle: edit code in another terminal/editor, press 'r' in Octate, verify findings cleared.

---

## Progress-to-Results Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Alternate screen from the start | Enter alternate screen buffer immediately; Ink renders an elegant 8-stage progress tracker, then transitions smoothly into the findings workspace when review finishes. | ✓ |
| Inline progress then TUI | StderrProgressReporter prints inline stages in the normal terminal; only launches the full-screen alternate buffer TUI if there are findings to inspect. | |
| Progress bar banner | Small 2-line Ink component in standard terminal buffer that expands into full screen when findings arrive. | |

**User's choice:** Alternate screen from the start.
**Notes:** Delivers a unified, polished, cohesive terminal application experience from command launch to exit.

---

## Zero-Findings Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Clean TUI Dashboard | Display a green celebratory screen ('✓ Clean Review — No issues found in {scope}') with summary metrics (files analyzed, duration) and 'Press q to return to terminal'. | ✓ |
| Immediate auto-exit | Unmount alternate screen immediately and print a single green summary line to stdout ('✓ Review clean: 0 issues found.') with exit code 0. | |
| Timed exit | Show the clean dashboard for 2 seconds with an option to press any key to exit immediately. | |

**User's choice:** Clean TUI Dashboard.
**Notes:** Positive confirmation giving developers assurance and summary metrics.

---

## Non-TTY & CI Environment Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Comprehensive TTY/CI auto-fallback | Automatically use ConsoleRenderer if not a TTY (!process.stdout.isTTY), CI environment detected (process.env.CI), dumb terminal (TERM === 'dumb'), or explicit '--no-tui' flag. | ✓ |
| Strict TTY check only | Only check process.stdout.isTTY and explicit '--no-tui' flag, ignoring CI environment variables. | |
| Explicit opt-in | Always use ConsoleRenderer by default; only launch Ink TUI if '--tui' or '-i' is explicitly provided. | |

**User's choice:** Comprehensive TTY/CI auto-fallback.
**Notes:** Guarantees CI pipelines, git hooks, and headless environments never hang or render garbage escape sequences.

---

## Terminal Restoration & Exit Code

| Option | Description | Selected |
|--------|-------------|----------|
| Clean restore + stderr summary | Exit alternate screen cleanly (restoring user shell history intact), print concise 1-line summary to stderr, and exit with code (1 if blocking findings remain, 0 if clean/advisory). | ✓ |
| Snapshot to stdout | Exit alternate screen and dump a compact non-interactive summary of findings to stdout scrollback before terminating. | |
| Completely silent unmount | Exit alternate screen and terminate immediately with the calculated exit code without printing additional messages. | |

**User's choice:** Clean restore + stderr summary.
**Notes:** Leaves shell history pristine while logging final outcome and setting accurate exit code.

---

## the agent's Discretion

- Responsive breakpoint calculation and terminal resize handling (`process.stdout.on('resize')`).
- Clipboard copy fallback mechanism across Linux (xclip/wl-copy/OSC 52), macOS (pbcopy), and Windows.
- Fine-grained visual styling (borders, padding, color accents).

## Deferred Ideas

- Autonomous file patch application from TUI (deferred to proven review milestone).
- Persistent `.octate/suppressions.json` file creation.
- Direct git hunk staging from TUI.

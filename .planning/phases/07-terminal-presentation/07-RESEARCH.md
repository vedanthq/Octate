# Phase 7: Terminal Presentation - Research

**Gathered:** 2026-09-11
**Status:** Complete
**Target Phase:** Phase 07 (Terminal Presentation)
**Requirements Covered:** TUI-01, TUI-02, TUI-03, OUT-01

---

## Executive Summary

Phase 7 delivers the interactive Terminal User Interface (TUI) workspace for Octate using **Ink 7.1.1** and **React 19.2.8**. It fulfills all interactive requirements (`TUI-01`, `TUI-02`, `TUI-03`) and completes the output renderer family (`OUT-01`) alongside the non-interactive renderers (`JsonRenderer`, `SarifRenderer`, `QuietRenderer`, `ConsoleRenderer`) established in Phase 6.

The architecture strictly adheres to Octate's layer separation:
1. **Core Decoupling**: Application (`src/application/`), review engine (`src/review/`), and intelligence graphs (`src/intelligence/`) contain **zero** dependencies on Ink or React.
2. **Pluggable Renderer Contract**: `InteractiveTuiRenderer` implements the existing `ReviewRenderer` interface (`render(result: ReviewResult): Promise<void> | void`).
3. **Alternate Screen Lifecycle**: Immediately switches to the alternate screen buffer (`\x1b[?1049h`), renders an 8-stage progress tracker during review, seamlessly transitions into the interactive findings workspace (or celebratory clean dashboard on 0 findings), and restores the terminal (`\x1b[?1049l`) on exit with exit code propagation and concise stderr summary.
4. **Deterministic State Machine**: Navigation, group expansion, shortcut modal overlays (`f`, `e`, `?`), evidence cycling (`Tab`, `[` / `]`), and session-level finding suppression (`s`) are driven by a pure reducer state machine, allowing 100% deterministic headless testing without flaky terminal timing.

---

## 1. User Constraints (from CONTEXT.md)

The following locked decisions from `07-CONTEXT.md` govern this phase:

### TUI Layout & Pane Structure
- **D-01 (Responsive split layout):** Responsive layout rendering side-by-side (left navigator ~35-40% width, right details & code ~60-65% width) on wide terminals ($\ge$ 100 columns), automatically collapsing to vertically stacked (top navigator, bottom details) on narrower terminals (< 100 columns).
- **D-02 (Grouped severity sections):** Navigator groups findings under severity sections (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW/INFO`) with collapsible/expanded headers, findings sorted by composite ranking within each group, displaying severity icon/badge, `file:line`, category, and title.
- **D-03 (Standard header and footer bars):** 1-2 line top header (Octate banner, repo name, scope/branch, total findings breakdown, blocking status badge) and persistent bottom footer cheatsheet (`↑/↓: Nav  Enter: Expand  f: Fix  e: Explain  s: Suppress  d: Diff  ?: Help  q: Quit`).
- **D-04 (Single-focus list with shortcut overlays):** Navigator list maintains active cursor (`↑`/`k`, `↓`/`j`); pressing shortcut keys (`d`, `e`, `f`, `c`, `?`) opens dedicated modal/full-screen overlays; `Esc` immediately closes the overlay and returns focus to the list.

### Source & Diff Snippet Presentation
- **D-05 (Source snippet with diff toggle):** Detail pane defaults to showing source code snippet context around the finding ($\pm 4$ context lines with line numbers and highlighted issue range); pressing `d` toggles to the git diff hunk view.
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

---

## 2. Architectural Responsibility Map

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 7: Terminal Presentation (src/renderers/tui/)                    │
│                                                                        │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │ InteractiveTuiRenderer (implements ReviewRenderer)            │    │
│   │ • Terminal lifecycle (alternate screen, cursor visibility)    │    │
│   │ • Exit code calculation & stderr summary on quit              │    │
│   └───────────────────────┬───────────────────────────────────────┘    │
│                           ▼                                            │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │ App Root (src/renderers/tui/components/App.tsx)               │    │
│   │ • useTerminalSize (responsive breakpoint >= 100 cols)         │    │
│   │ • useTuiState (pure reducer state machine)                    │    │
│   │ • useInput keyboard router                                    │    │
│   └──────┬──────────────────────┬──────────────────────────┬──────┘    │
│          ▼                      ▼                          ▼           │
│   ┌───────────────┐      ┌───────────────┐          ┌───────────────┐  │
│   │ ProgressView  │      │ CleanDashboard│          │   Workspace   │  │
│   │ (8 stages)    │      │ (0 findings)  │          │ (Split View)  │  │
│   └───────────────┘      └───────────────┘          └───────┬───────┘  │
│                                                             │          │
│          ┌──────────────────────────────────────────────────┴─────┐    │
│          ▼                                                        ▼    │
│   ┌───────────────┐                                        ┌────────┐  │
│   │  Navigator    │                                        │ Detail │  │
│   │ (Collapsible  │                                        │  Pane  │  │
│   │  Severity     │                                        │ (Code/ │  │
│   │  Sections)    │                                        │  Diff) │  │
│   └───────────────┘                                        └───┬────┘  │
│                                                                │       │
│          ┌─────────────────────────────────────────────────────┴──┐    │
│          ▼                                                        ▼    │
│   ┌───────────────┐                                        ┌────────┐  │
│   │  CodeSnippet  │                                        │Evidence│  │
│   │ (ANSI Gutter &│                                        │  Bar   │  │
│   │  Highlights)  │                                        │(Tabs)  │  │
│   └───────────────┘                                        └────────┘  │
│                                                                        │
│   Modal Overlays (Focus Lock):                                         │
│   • FixModal (Before/After patch diff, 'c' copy to clipboard)          │
│   • ExplainModal (Root cause, blast radius, symbols, critic, verify)   │
│   • HelpModal (Full keyboard shortcuts cheatsheet)                     │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ (Zero imports upward)
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 6: Application Layer (src/application/)                          │
│ • ReviewUseCase, ReviewProgressEvent, Policy, Exit Codes               │
└────────────────────────────────────────────────────────────────────────┘
```

### Module Layout
```
src/renderers/
├── console.ts              (ConsoleRenderer - fallback)
├── json.ts                 (JsonRenderer)
├── quiet.ts                (QuietRenderer)
├── sarif.ts                (SarifRenderer)
├── types.ts                (ReviewRenderer interface)
├── index.ts                (Factory registering 'tui')
└── tui/                    (Layer 7 TUI implementation)
    ├── index.ts            (InteractiveTuiRenderer class)
    ├── terminal.ts         (Alternate buffer & cursor escape codes)
    ├── types.ts            (TuiState, TuiAction, navigation types)
    ├── state.ts            (Pure reducer for navigation & modals)
    ├── syntax.ts           (Lightweight ANSI syntax & gutter decorator)
    ├── clipboard.ts        (Cross-platform clipboard copy helper)
    ├── diff.ts             (Unified diff hunk extractor & formatter)
    └── components/
        ├── App.tsx         (Root coordinator)
        ├── Header.tsx      (Banner, scope, counts, blocking badge)
        ├── Footer.tsx      (Persistent cheatsheet footer)
        ├── Workspace.tsx   (Responsive flex split container)
        ├── Navigator.tsx   (Collapsible severity groups & list items)
        ├── DetailPane.tsx  (Finding description, snippet & diff view)
        ├── CodeSnippet.tsx (ANSI line gutter, ±4 context, highlight)
        ├── EvidenceBar.tsx (Breadcrumb snippet cycler)
        ├── FixModal.tsx    (Suggested fix Before/After diff overlay)
        ├── ExplainModal.tsx(Structured reasoning overlay)
        ├── HelpModal.tsx   (Cheatsheet modal)
        ├── ProgressView.tsx(8-stage progress tracker)
        └── CleanDashboard.tsx (0 findings celebration screen)
```

---

## 3. Dependencies & Setup

### Exact Dependency Versions
- **`ink`**: `7.1.1` (in `dependencies`)
  - Ink 7 requires **Node.js $\ge$ 22** and **React $\ge$ 19.2** (Octate's `package.json` specifies `"engines": { "node": ">=22.0.0" }`).
- **`react`**: `19.2.8` (in `dependencies`)
- **`@types/react`**: `^19.0.0` (in `devDependencies`)
- **`picocolors`**: `1.1.1` (already installed in `dependencies`)

### TypeScript & Build Configuration
1. **`tsconfig.json`**:
   Add `"jsx": "react-jsx"` to `compilerOptions` so TSX files compile to standard modern React JSX transforms without requiring `import React from 'react'` in every file:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "jsx": "react-jsx",
       "strict": true,
       ...
     }
   }
   ```
2. **`jest.config.ts`**:
   Ensure ts-jest transforms `.tsx` files and Jest recognizes them as ESM modules:
   ```ts
   roots: ['<rootDir>/src'],
   testMatch: ['**/*.test.ts', '**/*.test.tsx'],
   transform: {
     '^.+\\.tsx?$': ['ts-jest', {
       tsconfig: 'tsconfig.json',
       useESM: true,
     }],
   },
   extensionsToTreatAsEsm: ['.ts', '.tsx'],
   moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
   ```
3. **`package.json`**:
   Add `"ink": "7.1.1"` and `"react": "19.2.8"` to `"dependencies"`.

---

## 4. Standard Stack / Ecosystem & Headless Testing Strategy

### Ink Testing Without External Peer-Dependency Traps
Historically, `ink-testing-library` has been used for testing Ink components. However, research into npm registries reveals that `ink-testing-library` maintains peer dependencies tied to React 18, which causes `npm install` `ERESOLVE` conflicts in pure React 19 projects.

Fortunately, Ink 7 provides two native testing mechanisms that are substantially faster and completely avoid peer dependency conflicts:

#### 1. Synchronous String Assertion via `renderToString`
Ink 7 exports `renderToString(tree: ReactNode): string`.
- Executes synchronously.
- Returns the exact terminal text (including ANSI colors).
- Does not attach stdin listeners or spawn timers.
- Ideal for testing `<Header />`, `<Footer />`, `<Navigator />`, `<CodeSnippet />`, `<DetailPane />`, `<FixModal />`, `<ExplainModal />`, `<CleanDashboard />`.
```ts
import { renderToString } from 'ink';
import { Header } from './Header.js';

test('renders header with blocking badge', () => {
  const output = renderToString(<Header repoRoot="/repo" blockingCount={2} ... />);
  expect(output).toContain('FAILING');
  expect(output).toContain('Octate');
});
```

#### 2. Pure State Machine Testing
All keyboard navigation, active index calculation, group collapsing, suppression toggling, modal opening, and exit code calculation are implemented in a pure reducer function:
```ts
export function tuiStateReducer(state: TuiState, action: TuiAction): TuiState
```
Because the reducer is a pure TypeScript function, 100% of interactive behaviors can be verified with instant, deterministic Jest unit tests without any stream mocking or event loop delays.

#### 3. Interactive Stream Testing with Custom Mock Streams
For testing components that use `useInput` or asynchronous effects, Ink's `render` accepts custom `stdout` and `stdin` streams:
```ts
import { PassThrough } from 'node:stream';
import { render } from 'ink';

const mockStdout = new PassThrough();
const mockStdin = new PassThrough();
const instance = render(<App ... />, { stdout: mockStdout, stdin: mockStdin, debug: true });

mockStdin.write('j'); // simulate Down arrow
instance.unmount();
```

---

## 5. Component Hierarchy & Architecture Patterns

### Component Hierarchy

```
<App>
  ├── [If viewMode === 'progress']
  │     └── <ProgressView stages={stages} activeStage={activeStage} message={msg} />
  │
  ├── [Else If viewMode === 'clean']
  │     └── <CleanDashboard summary={summary} metadata={metadata} onReReview={reReview} />
  │
  └── [Else (viewMode === 'workspace')]
        ├── <Header scope={scope} findings={activeFindings} blockingCount={blockingCount} />
        │
        ├── <Workspace columns={cols} rows={rows}> (Flex split)
        │     ├── <Navigator
        │     │     groups={groupedFindings}
        │     │     cursorIndex={cursorIndex}
        │     │     expandedGroups={expandedGroups}
        │     │     suppressedIds={suppressedIds}
        │     │   />
        │     └── <DetailPane
        │           finding={selectedFinding}
        │           mode={snippetMode} /* 'source' | 'diff' */
        │           activeEvidenceIndex={evidenceIndex}
        │           repoRoot={repoRoot}
        │         >
        │           ├── <EvidenceBar evidence={finding.evidence} activeIndex={evidenceIndex} />
        │           └── <CodeSnippet file={targetFile} range={targetRange} ... />
        │         </DetailPane>
        │
        ├── <Footer activeModal={activeModal} />
        │
        └── Overlays (Modals rendered on top):
              ├── <FixModal finding={selectedFinding} onClose={closeModal} onCopy={copyFix} />
              ├── <ExplainModal finding={selectedFinding} onClose={closeModal} />
              └── <HelpModal onClose={closeModal} />
```

### Layout Specifications
- **Header (`<Header />`)**:
  - Top line: Brand logo/banner (`Octate Code Review`), repository path or name, scope indicator (`working-tree`, `HEAD~1..HEAD`, etc.).
  - Second line: Summary count breakdown:
    `[CRITICAL: 2] [HIGH: 1] [MEDIUM: 3] [LOW: 0] [INFO: 0]`
    Followed by blocking status badge:
    `[FAILING]` in bold red if `blockingCount > 0`, or `[PASSING]` in bold green if `blockingCount === 0`.
- **Navigator (`<Navigator />`)**:
  - Groups findings by severity: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW/INFO`.
  - Header line: `▼ CRITICAL (2 findings)` or `▶ CRITICAL (2 findings)` when collapsed.
  - Findings inside each group sorted by `compositeScore` descending.
  - Item row:
    - Cursor indicator (`>` in cyan or reverse background when selected).
    - Severity badge (`CRIT`, `HIGH`, `MED`, `LOW`, `INFO`).
    - `file:startLine` location.
    - Category tag (e.g. `[security]`).
    - Title truncated to fit pane width.
    - Suppressed items: formatted with `pc.dim(pc.strikethrough(title))` and `pc.dim('[SUPPRESSED]')`.
- **Detail Pane (`<DetailPane />`)**:
  - Finding overview: Title, composite score badge, category, confidence, blast radius, contributing reviewers.
  - Evidence bar: `[1: Primary (auth.ts:18)] [2: Caller (server.ts:45)]` with active tab highlighted.
  - Source snippet: Context lines ($\pm 4$) with ANSI line-number gutter (`142 │ ...`), highlighted target lines (`142 > ...`), and syntax coloring.
  - Pressing `d`: Toggles to Git diff hunk view with green `+` and red `-` coloring.
- **Footer (`<Footer />`)**:
  - Persistent bottom cheatsheet:
    `↑/↓: Nav  Enter: Expand  f: Fix  e: Explain  s: Suppress  d: Diff  ?: Help  q: Quit`
  - In modal view:
    `Esc: Close  c: Copy Code  p: Copy Patch  ↑/↓: Scroll`

---

## 6. Alternate Screen Buffer & Terminal Lifecycle Management

### Standard Terminal Control Sequences
To ensure the TUI behaves like standard Unix terminal applications (`vim`, `less`, `htop`), we use standard ANSI DEC private mode escape sequences:

| Action | Escape Sequence | Description |
|---|---|---|
| **Enter Alternate Screen** | `\x1b[?1049h` | Saves cursor & switches to clean alternate screen buffer |
| **Exit Alternate Screen** | `\x1b[?1049l` | Restores original screen buffer and scrollback history |
| **Hide Cursor** | `\x1b[?25l` | Hides the blinking terminal cursor during TUI rendering |
| **Show Cursor** | `\x1b[?25h` | Restores terminal cursor visibility on exit |
| **Clear Buffer** | `\x1b[2J\x1b[H` | Clears screen and places cursor at row 1, col 1 |

### Robust Terminal Restoration
A critical pitfall of terminal apps is leaving the user's terminal in an unusable state (hidden cursor or trapped in alternate buffer) if an error occurs or the process is interrupted.

We implement a dedicated `TerminalLifecycleManager`:
```ts
export class TerminalLifecycleManager {
  private active = false;

  public enter(): void {
    if (this.active) return;
    this.active = true;
    process.stdout.write('\x1b[?1049h\x1b[?25l');
    this.installSignalTraps();
  }

  public exit(): void {
    if (!this.active) return;
    this.active = false;
    process.stdout.write('\x1b[?1049l\x1b[?25h');
    this.removeSignalTraps();
  }

  private installSignalTraps(): void {
    process.once('exit', this.handleCleanup);
    process.once('SIGINT', this.handleSignal);
    process.once('SIGTERM', this.handleSignal);
    process.once('uncaughtException', this.handleException);
  }
}
```

### Exit Code Propagation & Stderr Summary
Per D-16:
- When the developer presses `q` or `Ctrl+C`:
  1. TUI unmounts cleanly.
  2. `TerminalLifecycleManager.exit()` restores the screen and cursor.
  3. Real-time blocking findings are calculated:
     $$\text{activeFindings} = \text{findings.filter}(f \Rightarrow !\text{suppressedIds.has}(f.id))$$
     $$\text{blockingCount} = \text{countBlockingFindings}(\text{activeFindings}, \text{failOnSeverity})$$
     $$\text{exitCode} = \text{blockingCount} > 0 \ ? \ 1 : 0$$
  4. Concise 1-line summary is written to `process.stderr`:
     - If blocking findings remain:
       `pc.red(`\nOctate review finished: ${blockingCount} blocking findings (exit 1)\n`)`
     - If clean/advisory:
       `pc.green(`\nOctate review finished: clean (exit 0)\n`)`
  5. `process.exitCode = exitCode` is set.

---

## 7. Keyboard Navigation & Input State Machine (`useInput`)

### Navigation State Machine
The state is managed using a pure reducer:

```ts
export interface TuiState {
  findings: RankedFinding[];
  suppressedIds: Set<string>;
  cursorIndex: number;
  expandedGroups: Set<SeverityGroupKey>;
  activeModal: 'fix' | 'explain' | 'help' | null;
  viewMode: 'workspace' | 'progress' | 'clean';
  snippetMode: 'source' | 'diff';
  evidenceIndex: number;
  explainScrollOffset: number;
}
```

### Keybinding Router
The `useInput` hook routes keystrokes based on modal priority:

```ts
useInput((input, key) => {
  // 1. Modal Overlay Priority
  if (state.activeModal !== null) {
    if (key.escape) {
      dispatch({ type: 'CLOSE_MODAL' });
      return;
    }
    if (state.activeModal === 'fix') {
      if (input === 'c') copyFixToClipboard();
      if (input === 'p') copyPatchToClipboard();
      return;
    }
    if (state.activeModal === 'explain') {
      if (key.upArrow || input === 'k') dispatch({ type: 'SCROLL_EXPLAIN', delta: -1 });
      if (key.downArrow || input === 'j') dispatch({ type: 'SCROLL_EXPLAIN', delta: 1 });
      return;
    }
    if (state.activeModal === 'help') {
      // Any key closes help
      dispatch({ type: 'CLOSE_MODAL' });
      return;
    }
  }

  // 2. Main Workspace Navigation
  if (key.upArrow || input === 'k') dispatch({ type: 'NAVIGATE_UP' });
  if (key.downArrow || input === 'j') dispatch({ type: 'NAVIGATE_DOWN' });
  if (key.return) dispatch({ type: 'TOGGLE_GROUP_EXPAND' });
  if (input === 'f') dispatch({ type: 'OPEN_MODAL', modal: 'fix' });
  if (input === 'e') dispatch({ type: 'OPEN_MODAL', modal: 'explain' });
  if (input === 's') dispatch({ type: 'TOGGLE_SUPPRESSION' });
  if (input === 'd') dispatch({ type: 'TOGGLE_SNIPPET_MODE' });
  if (key.tab || input === ']') dispatch({ type: 'CYCLE_EVIDENCE', direction: 'next' });
  if (input === '[') dispatch({ type: 'CYCLE_EVIDENCE', direction: 'prev' });
  if (input === 'r') triggerReReview();
  if (input === '?' || input === 'h') dispatch({ type: 'OPEN_MODAL', modal: 'help' });
  if (input === 'q') quitTui();
});
```

### Flattened Navigation List
To allow smooth `↑`/`↓` cursor motion across both section headers and findings:
The navigator flattens visible items into a list of discriminated entries:
```ts
export type NavItem =
  | { type: 'header'; groupKey: SeverityGroupKey; count: number; expanded: boolean }
  | { type: 'finding'; finding: RankedFinding; groupKey: SeverityGroupKey };
```
- If the cursor is on a `{ type: 'header' }`, pressing `Enter` or `Space` toggles `expanded`.
- If the cursor is on a `{ type: 'finding' }`, the detail pane updates immediately to display that finding.

---

## 8. Don't Hand-Roll & Common Pitfalls

### Don't Hand-Roll
1. **Flexbox Layout Engine**: Do not calculate terminal column/row widths with manual math. Ink embeds the Yoga flexbox layout engine. Use `<Box flexDirection="row" width="38%">` and `<Box flexGrow={1}>`.
2. **Heavy External Syntax Parsers in TUI Loop**: Do not import full Tree-sitter WASM or heavy syntax highlighter libraries (e.g. Prism or Shiki) into the React render loop. Instead, use a lightweight, zero-dependency ANSI regex tokenizer with `picocolors` that colors keywords, strings, comments, numbers, and identifiers in $< 0.1\text{ms}$.
3. **External Clipboard Binaries as Hard Dependencies**: Do not depend strictly on native desktop packages that require compilation. Implement OSC 52 terminal clipboard escape sequences (`\x1b]52;c;<base64>\x07`) with graceful fallback to `pbcopy` (macOS), `wl-copy`/`xclip` (Linux), and `clip.exe` (Windows).

### Common Pitfalls & Landmines
- **Pitfall 1: Stdout Corruption by Background Logging**:
  If any background code calls `console.log` while Ink is actively rendering, the terminal output will flicker and cursor alignment will break.
  *Mitigation*: Pass `patchConsole: true` to Ink's `render()`, and ensure Pino loggers are redirected or muted in TUI mode.
- **Pitfall 2: Cursor Remains Invisible After Crash**:
  If an unhandled error throws inside a React component, Node might terminate while the cursor is still hidden (`\x1b[?25l`).
  *Mitigation*: The `TerminalLifecycleManager` hooks `uncaughtException`, `unhandledRejection`, `exit`, `SIGINT`, and `SIGTERM` to write `\x1b[?1049l\x1b[?25h` synchronously to `process.stdout`.
- **Pitfall 3: TTY & CI Auto-Fallback**:
  Running the TUI inside a GitHub Action or piped to a file (`octate review > out.txt`) causes crashes because `process.stdout.isTTY` is undefined.
  *Mitigation*: Per D-15, `shouldUseTui()` strictly checks:
  `process.stdout.isTTY && !process.env.CI && process.env.TERM !== 'dumb' && !options.json && !options.sarif && !options.quiet && options.tui !== false && !options.output`.
  If false, it routes automatically to `ConsoleRenderer`.
- **Pitfall 4: Memory Leaks on In-Place Re-Review ('r')**:
  Pressing `r` triggers a re-run of `ReviewUseCase.execute()`. If state listeners or old subscriptions are not cleaned up, memory and CPU usage will leak.
  *Mitigation*: The re-review action triggers via an async handler inside the TUI coordinator that resets `evidenceIndex` and `selectedItemIndex` while preserving `suppressedIds` as appropriate.
- **Pitfall 5: React 19 JSX Configuration**:
  TypeScript 5.9 will fail to compile `.tsx` files if `"jsx": "react-jsx"` is not present in `tsconfig.json`.
  *Mitigation*: Explicitly set `"jsx": "react-jsx"` in `tsconfig.json` during setup.

---

## 9. Validation Architecture

### Verification Commands
```bash
# 1. Typecheck including TSX components
npm run build

# 2. Biome lint & formatting for TS/TSX
npm run check

# 3. Jest unit & component tests
npm test -- src/renderers/tui/

# 4. End-to-end review CLI tests with fallback checks
npm test -- src/commands/review.test.ts
```

### Test Strategy Matrix

| Test File | Target | Strategy |
|---|---|---|
| `state.test.ts` | `tuiStateReducer` | Unit tests verifying all keyboard actions: cursor navigation, boundary clamping, group toggle, modal open/close, suppression toggle, real-time blocking count recalculation. |
| `syntax.test.ts` | `formatCodeSnippet`, `highlightTokens` | Unit tests verifying ANSI gutter format (`142 │ ...`), target line marker (`>`), keyword/string/comment regex highlighting. |
| `terminal.test.ts` | `TerminalLifecycleManager`, `shouldUseTui` | Unit tests asserting ANSI escape sequences and CI/non-TTY fallback conditions. |
| `clipboard.test.ts` | `copyToClipboard` | Unit tests verifying OSC 52 base64 escape sequence emission and non-crashing fallback. |
| `components.test.tsx` | Ink UI Components | Headless rendering tests using `renderToString` from `ink`: asserting `<Header />` badges, `<Navigator />` grouped items, `<DetailPane />`, `<FixModal />`, `<ExplainModal />`, `<HelpModal />`, `<ProgressView />`, and `<CleanDashboard />`. |
| `review.test.ts` | CLI dispatch & lifecycle | Integration tests verifying `--no-tui` fallback, TTY detection, and exit code propagation. |

---

## 10. Implementation Plan Breakdown (Preview for Planner)

1. **Plan 07-01: Foundation, Dependencies & Terminal Lifecycle**:
   - Install `ink@7.1.1` and `react@19.2.8`.
   - Update `tsconfig.json` (`"jsx": "react-jsx"`) and `jest.config.ts` (`.tsx` support).
   - Implement `TerminalLifecycleManager` (alternate buffer, cursor visibility, signal traps).
   - Implement `shouldUseTui` fallback detector.
   - Implement lightweight `syntax.ts` (ANSI gutter, token highlighting) and `clipboard.ts`.
2. **Plan 07-02: State Machine & TUI Components**:
   - Implement `tuiStateReducer` and types (`TuiState`, `TuiAction`, `NavItem`).
   - Implement UI components: `Header`, `Footer`, `Navigator`, `DetailPane`, `CodeSnippet`, `EvidenceBar`, `ProgressView`, `CleanDashboard`.
   - Implement Modal Overlays: `FixModal`, `ExplainModal`, `HelpModal`.
   - Implement `App` coordinator with responsive layout hook (`useTerminalSize`).
3. **Plan 07-03: Interactive Renderer, CLI Wiring & Verification**:
   - Implement `InteractiveTuiRenderer` implementing `ReviewRenderer`.
   - Register `'tui'` in `src/renderers/index.ts`.
   - Update `src/commands/review.ts` to route interactive runs to TUI with progress lifecycle, clean exit codes, and stderr summary.
   - Full test suite execution and verification.

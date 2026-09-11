# Phase 7: Terminal Presentation - Pattern Mapping

**Phase:** 07 — Terminal Presentation  
**Domain:** Interactive Terminal User Interface (TUI) Workspace (`InteractiveTuiRenderer`), Responsive Split Layout, Collapsible Severity Navigator, Source & Diff Snippets with Syntax Highlighting, Modal Overlays (Fix, Explain, Help), Session-Level Finding Suppression, Cross-Platform Clipboard Copy, In-Place Re-Review, Alternate Screen Lifecycle, and Clean Terminal Restoration  
**Status:** Completed  
**Author:** gsd-pattern-mapper  
**Canonical Inputs:** [07-CONTEXT.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/07-terminal-presentation/07-CONTEXT.md), [07-RESEARCH.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/07-terminal-presentation/07-RESEARCH.md)  

---

## 1. Architectural Positioning & Responsibilities

The Terminal Presentation layer serves as **Layer 7** in Octate's 8-layer strict architecture:

```
Layer 7: Terminal Presentation (Phase 7: Ink 7.1.1 / React 19 interactive workspace & renderer)
               ▲
Layer 6: Application Layer (Phase 6: ReviewUseCase, Pluggable Renderers, Policy, Lifecycle)
               ▲
Layer 5: Review Engine (Phase 5: ReviewDAG, CriticStage, Deduplicator, CompositeRanker)
               ▲
Layer 4: Model Provider (Phase 4: ReviewModel, LocalNvidiaProvider, Schema, Prompts)
               ▲
Layer 3: Intelligence Layer (Phase 3: ReferenceGraph, SymbolIndex, ContextEngine)
               ▲
Layer 2: Analysis Layer (Phase 2: Tree-sitter Parser, Symbols, DiagnosticsOrchestrator)
               ▲
Layer 1: Repository Layer (Phase 1: Git diff, Scope resolution, CacheStore, Cancellation)
```

### Layer Boundary & Invariants

1. **Strict Core Decoupling:**  
   Layers 1 through 6 (`src/application/`, `src/review/`, `src/intelligence/`, `src/model/`, `src/analysis/`, `src/repository/`) contain **zero** dependencies on Ink, React, or terminal escape sequences. Presentation concerns are strictly quarantined inside `src/renderers/tui/`.
2. **Pluggable ReviewRenderer Contract:**  
   `InteractiveTuiRenderer` implements the standard polymorphic `ReviewRenderer` contract (`render(result: ReviewResult): Promise<void> | void`) defined in [`src/renderers/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/types.ts#L38-L45). The CLI routes to this renderer when stdout is a TTY and no automation flags (`--json`, `--sarif`, `--quiet`, `--no-tui`) are passed.
3. **Alternate Screen Buffer Lifecycle:**  
   The TUI immediately switches to the alternate screen buffer (`\x1b[?1049h`) and hides the cursor (`\x1b[?25l`). On termination (via `q`, `Ctrl+C`, or process interruption), it cleanly restores the user's terminal (`\x1b[?1049l\x1b[?25h`), writes a concise 1-line summary to `stderr`, and exits with the final calculated exit code.
4. **Deterministic Pure Reducer State Machine:**  
   All interactive state transitions (cursor navigation, group expansion, suppression toggling, modal opening, evidence cycling) are governed by a pure reducer (`tuiStateReducer`). This guarantees 100% testability in headless Jest environments without flaky stream timing.

---

## 2. File Inventory & Classification

| File Path | Architectural Role / Layer | Data Flow (Input ➔ Transform ➔ Output) | Closest Codebase Analog |
|:---|:---|:---|:---|
| `src/renderers/tui/types.ts` | **Domain Contracts & State Types**<br>(Layer 7 Types) | Defines immutable state, actions, navigation items, view modes, and modal types. | [`src/renderers/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/types.ts)<br>[`src/application/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/types.ts) |
| `src/renderers/tui/terminal.ts` | **Terminal Lifecycle & Detection**<br>(Screen & Cursor Management) | Process environment + stdout streams ➔ ANSI escape codes (`?1049h`, `?25l`, etc.) + signal cleanup traps ➔ Clean alternate screen session & TTY fallback logic. | [`src/application/progress.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/progress.ts)<br>[`src/cancellation/subprocess.ts`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/subprocess.ts) |
| `src/renderers/tui/syntax.ts` | **Lightweight ANSI Syntax Highlighting**<br>(Code & Diff Formatter) | Source code lines / git diff text ➔ Regex tokenization + `picocolors` formatting ➔ Colorized line gutters (`142 │ ...`), markers (`>`), and code tokens. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts)<br>[`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts) |
| `src/renderers/tui/clipboard.ts` | **Cross-Platform Clipboard Utility**<br>(OSC 52 & Native Subprocesses) | Fix code snippet or git patch string ➔ OSC 52 escape sequences or OS binary execution (`pbcopy`, `wl-copy`, `xclip`, `clip.exe`) ➔ System clipboard write status (`boolean`). | [`src/cancellation/subprocess.ts`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/subprocess.ts) |
| `src/renderers/tui/state.ts` | **Pure State Reducer**<br>(State Machine & Navigation) | `(TuiState, TuiAction)` ➔ Immutable calculation of cursor clamping, group collapse, suppression toggles, and blocking severity counts ➔ New `TuiState`. | [`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts)<br>[`src/application/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/review.ts) |
| `src/renderers/tui/components/Header.tsx` | **Header Bar Component**<br>(Presentation) | Active findings, blocking count, scope, repo root ➔ Octate banner, severity count badges, and FAILING/PASSING status ➔ Ink `<Box>` and `<Text>` elements. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts)<br>[`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts) |
| `src/renderers/tui/components/Footer.tsx` | **Footer Cheatsheet Component**<br>(Presentation) | Active modal state ➔ Context-sensitive keyboard shortcut cheatsheet (`↑/↓: Nav  f: Fix  e: Explain  s: Suppress ...`) ➔ Persistent Ink `<Box>` element. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts) |
| `src/renderers/tui/components/Navigator.tsx` | **Findings Navigator Component**<br>(Navigation List) | Grouped findings by severity, cursor index, suppressed set, expanded groups ➔ Collapsible section headers (`▼ CRITICAL (2)`) and finding rows (`> [CRIT] auth.ts:18`) ➔ Ink vertical list. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts) |
| `src/renderers/tui/components/DetailPane.tsx` | **Detail Inspector Component**<br>(Details & Tabs) | Selected finding, snippet mode (`source` vs `diff`), active evidence index, repoRoot ➔ Finding overview, evidence tabs, and code snippet / diff view ➔ Ink flexible panel. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts)<br>[`src/model/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/types.ts) |
| `src/renderers/tui/components/CodeSnippet.tsx` | **Code Snippet Component**<br>(ANSI Gutter & Highlight) | File path, target line range, context radius (±4 lines), syntax decorator ➔ Numbered gutter lines (`142 │ ...`), target pointers (`>`), token styling ➔ Ink `<Box>`. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts)<br>[`src/application/progress.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/progress.ts) |
| `src/renderers/tui/components/ProgressView.tsx` | **8-Stage Progress Tracker**<br>(Live Pipeline View) | Canonical stages, active stage, status icon, step counter `[3/8]`, stage message ➔ Visual stage progress tracker ➔ Ink animated view. | [`src/application/progress.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/progress.ts)<br>[`src/application/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/types.ts) |
| `src/renderers/tui/components/CleanDashboard.tsx` | **Clean Review Celebration Screen**<br>(0 Findings View) | Review summary metrics (files analyzed, duration, scope) ➔ Celebratory green checkmark banner (`✓ Clean Review`), metric cards, return hint (`Press q to exit`) ➔ Ink dashboard. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts) |
| `src/renderers/tui/components/Modals.tsx` | **Modal Overlays Component Family**<br>(Fix, Explain, Help Modals) | Selected finding, blast radius, symbols, critic rationale, proposed fix diff ➔ Focus-locked modal overlay (Before/After fix diff, structured reasoning, help cheatsheet) ➔ Ink framed `<Box>`. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts)<br>[`src/intelligence/graph/reference.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.ts) |
| `src/renderers/tui/app.tsx` | **TUI Root Coordinator**<br>(Layout, View Router & Input) | Terminal dimensions (`stdout.columns`, `stdout.rows`), `useTuiState`, `useInput` ➔ Responsive split calculation (horizontal if $\ge 100$ cols, vertical if $< 100$), view routing (`progress` vs `clean` vs `workspace`), modal overlays. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts)<br>[`src/application/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/review.ts) |
| `src/renderers/tui/renderer.ts` | **Interactive TUI ReviewRenderer**<br>(ReviewRenderer Implementation) | `ReviewResult` ➔ Screen buffer entry (`\x1b[?1049h`), Ink component mount, exit event wait, screen restoration (`\x1b[?1049l`), exit code evaluation, stderr summary. | [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts)<br>[`src/renderers/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/types.ts) |
| `src/renderers/index.ts` *(modify)* | **Renderer Factory & Barrel** | Adds `'tui'` to `OutputFormat`, instantiates `InteractiveTuiRenderer`, re-exports TUI contracts. | [`src/renderers/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/index.ts) |
| `src/commands/review.ts` *(modify)* | **CLI Review Command Routing** | Evaluates `shouldUseTui` (checking TTY, CI, `--no-tui`, `--plain`), hooks live review progress callback to TUI, propagates calculated exit code. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts) |
| `package.json` *(modify)* | **Dependency Manifest** | Adds `"ink": "7.1.1"` and `"react": "19.2.8"` to `"dependencies"`. | [`package.json`](file:///home/ved/Desktop/project_i/Octate/package.json) |
| `tsconfig.json` *(modify)* | **TypeScript Configuration** | Adds `"jsx": "react-jsx"` to `compilerOptions`. | [`tsconfig.json`](file:///home/ved/Desktop/project_i/Octate/tsconfig.json) |
| `jest.config.ts` *(modify)* | **Jest Test Configuration** | Adds `.tsx` to `testMatch`, `moduleFileExtensions`, and `extensionsToTreatAsEsm`. | [`jest.config.ts`](file:///home/ved/Desktop/project_i/Octate/jest.config.ts) |

---

## 3. Component Analog Mapping & Concrete Excerpts

### 3.1 Domain Contracts & State Types (`src/renderers/tui/types.ts`)

#### Architectural Role & Analog
- **Role:** Pure type definitions for TUI state management, navigation items, discriminated actions, and modal types.
- **Closest Analog:** [`src/renderers/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/types.ts) and [`src/application/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/types.ts).
- **Conventions:**
  - Exact optional property types (`prop?: Type | undefined`).
  - Discriminated union for navigation items (`NavItem`) and actions (`TuiAction`).
  - Strict type narrowing for severity groups (`'critical' | 'high' | 'medium' | 'low' | 'info'`).

#### Concrete Code Excerpt from Analog ([`src/application/types.ts:13-46`](file:///home/ved/Desktop/project_i/Octate/src/application/types.ts#L13-L46))
```typescript
export type CanonicalReviewStage =
  | 'git:read'
  | 'index:update'
  | 'symbols:resolve'
  | 'diagnostics:collect'
  | 'context:build'
  | 'review:dag'
  | 'review:critic'
  | 'review:rank';

export type ReviewProgressStatus = 'start' | 'progress' | 'complete' | 'error';

export interface ReviewProgressStep {
  current: number;
  total: number;
}

export interface ReviewProgressEvent {
  stage: CanonicalReviewStage;
  status: ReviewProgressStatus;
  message: string;
  step?: ReviewProgressStep | undefined;
  payload?: Record<string, unknown> | undefined;
}
```

#### Established Pattern for `src/renderers/tui/types.ts`
```typescript
import type { ReviewFailOnSeverity, ReviewProgressEvent } from '../../application/types.js';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../../review/types.js';

export type SeverityGroupKey = ReviewSeverity;

export type NavItem =
  | { type: 'header'; groupKey: SeverityGroupKey; count: number; expanded: boolean }
  | { type: 'finding'; finding: RankedFinding; groupKey: SeverityGroupKey };

export type SnippetMode = 'source' | 'diff';
export type ModalType = 'fix' | 'explain' | 'help' | null;
export type ViewMode = 'workspace' | 'progress' | 'clean';

export interface TuiState {
  readonly findings: RankedFinding[];
  readonly suppressedIds: ReadonlySet<string>;
  readonly cursorIndex: number;
  readonly expandedGroups: ReadonlySet<SeverityGroupKey>;
  readonly activeModal: ModalType;
  readonly viewMode: ViewMode;
  readonly snippetMode: SnippetMode;
  readonly evidenceIndex: number;
  readonly explainScrollOffset: number;
  readonly failOnSeverity: ReviewFailOnSeverity;
  readonly repoRoot: string;
  readonly scopeType: string;
  readonly progressEvent?: ReviewProgressEvent | undefined;
}

export type TuiAction =
  | { type: 'NAVIGATE_UP' }
  | { type: 'NAVIGATE_DOWN' }
  | { type: 'TOGGLE_GROUP_EXPAND' }
  | { type: 'TOGGLE_SUPPRESSION' }
  | { type: 'TOGGLE_SNIPPET_MODE' }
  | { type: 'CYCLE_EVIDENCE'; direction: 'next' | 'prev' }
  | { type: 'OPEN_MODAL'; modal: Exclude<ModalType, null> }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SCROLL_EXPLAIN'; delta: number }
  | { type: 'SET_PROGRESS'; event: ReviewProgressEvent }
  | { type: 'FINISH_REVIEW'; result: ReviewResult }
  | { type: 'START_RE_REVIEW' };
```

---

### 3.2 Terminal Lifecycle & TTY Auto-Fallback (`src/renderers/tui/terminal.ts`)

#### Architectural Role & Analog
- **Role:** Encapsulates terminal control sequences (alternate screen buffer, cursor visibility), handles signal cleanup traps (`SIGINT`, `SIGTERM`, `exit`, `uncaughtException`), and provides the robust TTY/CI fallback detector per D-15 and D-16.
- **Closest Analog:** [`src/application/progress.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/progress.ts) (TTY stream checking and line clearing) and [`src/cancellation/subprocess.ts`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/subprocess.ts) (signal management).
- **Conventions:**
  - Idempotent cleanup handlers using `.once()` and bound arrow functions.
  - Standard ANSI DEC private mode escape codes.
  - Comprehensive fallback predicate evaluating `process.stdout.isTTY`, `CI`, `TERM`, and CLI flags.

#### Concrete Code Excerpt from Analog ([`src/application/progress.ts:28-32, 73-77`](file:///home/ved/Desktop/project_i/Octate/src/application/progress.ts#L28-L32))
```typescript
  constructor(options: ProgressReporterOptions = {}) {
    this.enabled = !options.quiet && !options.json && !options.sarif;
    this.stream = options.stream ?? process.stderr;
    this.isTTY = Boolean((this.stream as { isTTY?: boolean | undefined }).isTTY);
  }

  public clear(): void {
    if (this.enabled && this.isTTY) {
      this.stream.write('\r\x1b[K');
    }
  }
```

#### Established Pattern for `src/renderers/tui/terminal.ts`
```typescript
export const ANSI_ENTER_ALT_SCREEN = '\x1b[?1049h';
export const ANSI_EXIT_ALT_SCREEN = '\x1b[?1049l';
export const ANSI_HIDE_CURSOR = '\x1b[?25l';
export const ANSI_SHOW_CURSOR = '\x1b[?25h';
export const ANSI_CLEAR_BUFFER = '\x1b[2J\x1b[H';

export interface TerminalFallbackOptions {
  isTTY?: boolean | undefined;
  ci?: boolean | undefined;
  term?: string | undefined;
  plain?: boolean | undefined;
  noTui?: boolean | undefined;
  json?: boolean | undefined;
  sarif?: boolean | undefined;
  quiet?: boolean | undefined;
  outputFile?: string | undefined;
}

export function shouldUseTui(options: TerminalFallbackOptions = {}): boolean {
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY);
  const isCI = options.ci ?? Boolean(process.env.CI);
  const term = options.term ?? process.env.TERM ?? '';
  const isDumb = term === 'dumb';

  if (!isTTY || isCI || isDumb) return false;
  if (options.plain || options.noTui) return false;
  if (options.json || options.sarif || options.quiet || options.outputFile) return false;

  return true;
}

export class TerminalLifecycleManager {
  private active = false;
  private readonly stream: NodeJS.WriteStream;

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
  }

  public enter(): void {
    if (this.active) return;
    this.active = true;
    this.stream.write(`${ANSI_ENTER_ALT_SCREEN}${ANSI_HIDE_CURSOR}`);
    this.installTraps();
  }

  public exit(): void {
    if (!this.active) return;
    this.active = false;
    this.stream.write(`${ANSI_EXIT_ALT_SCREEN}${ANSI_SHOW_CURSOR}`);
    this.removeTraps();
  }

  private handleSignal = (): void => {
    this.exit();
  };

  private installTraps(): void {
    process.once('exit', this.handleSignal);
    process.once('SIGINT', this.handleSignal);
    process.once('SIGTERM', this.handleSignal);
    process.once('uncaughtException', this.handleSignal);
  }

  private removeTraps(): void {
    process.off('exit', this.handleSignal);
    process.off('SIGINT', this.handleSignal);
    process.off('SIGTERM', this.handleSignal);
    process.off('uncaughtException', this.handleSignal);
  }
}
```

---

### 3.3 Lightweight ANSI Syntax Highlighting (`src/renderers/tui/syntax.ts`)

#### Architectural Role & Analog
- **Role:** Fast, zero-dependency ANSI syntax highlighting and code snippet context formatter with line gutters and target line markers per D-07.
- **Closest Analog:** [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts) and [`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts).
- **Conventions:**
  - `picocolors` styling exclusively (no heavy tokenizers or Tree-sitter in the React render loop).
  - Clean vertical divider gutter: `142 │ ...`.
  - Target line indicator: `143 > ...` in yellow or red.
  - Diff hunk colorization: `+` in green, `-` in red, `@@` in cyan.

#### Concrete Code Excerpt from Analog ([`src/renderers/console.ts:15-28`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts#L15-L28))
```typescript
export function formatBadge(severity: ReviewSeverity): string {
  switch (severity) {
    case 'critical':
      return pc.bgRed(pc.white(pc.bold(' CRITICAL ')));
    case 'high':
      return pc.bgYellow(pc.black(pc.bold(' HIGH ')));
    case 'medium':
      return pc.yellow(pc.bold('[MEDIUM]'));
    case 'low':
      return pc.cyan(pc.bold('[LOW]'));
    case 'info':
      return pc.dim('[INFO]');
  }
}
```

#### Established Pattern for `src/renderers/tui/syntax.ts`
```typescript
import pc from 'picocolors';

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|interface|type|extends|implements|async|await|try|catch|finally|throw|new|switch|case|break|default|typeof|instanceof)\b/g;
const STRINGS = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
const COMMENTS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
const NUMBERS = /\b(\d+(\.\d+)?)\b/g;

export function highlightTokens(code: string): string {
  return code
    .replace(COMMENTS, (match) => pc.dim(pc.italic(match)))
    .replace(STRINGS, (match) => pc.green(match))
    .replace(KEYWORDS, (match) => pc.blue(pc.bold(match)))
    .replace(NUMBERS, (match) => pc.yellow(match));
}

export interface CodeSnippetOptions {
  lines: string[];
  startLine: number; // 1-indexed start line of code chunk
  highlightStart: number;
  highlightEnd: number;
  contextRadius?: number | undefined; // default 4
}

export function formatCodeSnippet(options: CodeSnippetOptions): string[] {
  const { lines, startLine, highlightStart, highlightEnd, contextRadius = 4 } = options;
  const targetIndex = highlightStart - startLine;
  const minIdx = Math.max(0, targetIndex - contextRadius);
  const maxIdx = Math.min(lines.length - 1, highlightEnd - startLine + contextRadius);

  const maxLineNum = startLine + maxIdx;
  const gutterWidth = String(maxLineNum).length;

  const result: string[] = [];

  for (let i = minIdx; i <= maxIdx; i++) {
    const lineNum = startLine + i;
    const isTarget = lineNum >= highlightStart && lineNum <= highlightEnd;
    const numPadded = String(lineNum).padStart(gutterWidth, ' ');
    const lineContent = lines[i] ?? '';
    const coloredContent = highlightTokens(lineContent);

    if (isTarget) {
      result.push(`${pc.red(numPadded)} ${pc.bold(pc.red('>'))} ${pc.bold(coloredContent)}`);
    } else {
      result.push(`${pc.dim(numPadded)} ${pc.dim('│')} ${coloredContent}`);
    }
  }

  return result;
}

export function formatDiffLines(diffText: string): string[] {
  return diffText.split('\n').map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return pc.green(line);
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return pc.red(line);
    }
    if (line.startsWith('@@')) {
      return pc.cyan(line);
    }
    return pc.dim(line);
  });
}
```

---

### 3.4 Cross-Platform Clipboard & Patch Formatting (`src/renderers/tui/clipboard.ts`)

#### Architectural Role & Analog
- **Role:** Copies suggested fix snippets and git patches to the system clipboard via OSC 52 terminal escape sequences and native OS binaries, without external npm packages.
- **Closest Analog:** [`src/cancellation/subprocess.ts`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/subprocess.ts) (`spawnWithSignal`, child process spawning, and error handling).
- **Conventions:**
  - Non-throwing function returning a `Promise<boolean>`.
  - Primary mechanism: OSC 52 terminal clipboard escape sequence (`\x1b]52;c;<base64>\x07`).
  - Fallback mechanism: Native desktop utilities (`pbcopy`, `wl-copy`, `xclip`, `clip.exe`).

#### Concrete Code Excerpt from Analog ([`src/cancellation/subprocess.ts:68-76`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/subprocess.ts#L68-L76))
```typescript
    const child = spawn(command, args, {
      ...spawnOptions,
      signal,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
```

#### Established Pattern for `src/renderers/tui/clipboard.ts`
```typescript
import { spawn } from 'node:child_process';
import type { RankedFinding } from '../../review/types.js';

export function copyViaOsc52(text: string, stream: NodeJS.WriteStream = process.stdout): boolean {
  try {
    const base64 = Buffer.from(text, 'utf-8').toString('base64');
    stream.write(`\x1b]52;c;${base64}\x07`);
    return true;
  } catch {
    return false;
  }
}

export async function copyViaOsCommand(text: string): Promise<boolean> {
  const platform = process.platform;
  let command: string;
  let args: string[] = [];

  if (platform === 'darwin') {
    command = 'pbcopy';
  } else if (platform === 'win32') {
    command = 'clip.exe';
  } else {
    // Linux / BSD: check wl-copy, fallback to xclip
    command = process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip';
    if (command === 'xclip') {
      args = ['-selection', 'clipboard'];
    }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      child.stdin.write(text);
      child.stdin.end();
    } catch {
      resolve(false);
    }
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Try OSC 52 first (works over SSH, inside tmux, etc.)
  const oscSuccess = copyViaOsc52(text);
  if (oscSuccess) return true;

  // Fallback to local desktop tool
  return copyViaOsCommand(text);
}

export function formatPatchPreview(finding: RankedFinding): string {
  const file = finding.file;
  const start = finding.startLine ?? finding.line ?? 1;
  const fix = finding.suggestedFix ?? '';

  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start},1 +${start},1 @@`,
    `+${fix}`,
  ].join('\n');
}
```

---

### 3.5 Pure State Reducer & Navigation Model (`src/renderers/tui/state.ts`)

#### Architectural Role & Analog
- **Role:** Pure reducer managing all TUI state transitions (cursor movement, group expanding, finding suppression, evidence cycling, modal toggling) and real-time blocking count recalculation.
- **Closest Analog:** [`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts) (`countBlockingFindings`, `isBlockingFinding`) and [`src/review/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/types.ts).
- **Conventions:**
  - Immutability: uses `ReadonlySet` and pure transformations.
  - Flattened navigation list (`buildNavItems`) allowing smooth cursor movement across severity headers and finding rows.
  - Cursor boundary clamping: always within `[0, navItems.length - 1]`.

#### Concrete Code Excerpt from Analog ([`src/application/policy.ts:48-56`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts#L48-L56))
```typescript
export function countBlockingFindings(
  findings: RankedFinding[],
  threshold: ReviewFailOnSeverity
): number {
  if (threshold === 'none' || threshold === 'off') {
    return 0;
  }
  return findings.filter((f) => isBlockingFinding(f, threshold)).length;
}
```

#### Established Pattern for `src/renderers/tui/state.ts`
```typescript
import { countBlockingFindings } from '../../application/policy.js';
import type { RankedFinding, ReviewSeverity } from '../../review/types.js';
import type { NavItem, SeverityGroupKey, TuiAction, TuiState } from './types.js';

export const SEVERITY_ORDER: SeverityGroupKey[] = ['critical', 'high', 'medium', 'low', 'info'];

export function buildNavItems(
  findings: readonly RankedFinding[],
  expandedGroups: ReadonlySet<SeverityGroupKey>
): NavItem[] {
  const items: NavItem[] = [];

  for (const groupKey of SEVERITY_ORDER) {
    const groupFindings = findings
      .filter((f) => f.severity === groupKey)
      .sort((a, b) => b.compositeScore - a.compositeScore);

    if (groupFindings.length === 0) continue;

    const isExpanded = expandedGroups.has(groupKey);
    items.push({
      type: 'header',
      groupKey,
      count: groupFindings.length,
      expanded: isExpanded,
    });

    if (isExpanded) {
      for (const finding of groupFindings) {
        items.push({
          type: 'finding',
          finding,
          groupKey,
        });
      }
    }
  }

  return items;
}

export function getActiveFinding(state: TuiState): RankedFinding | undefined {
  const navItems = buildNavItems(state.findings, state.expandedGroups);
  const current = navItems[state.cursorIndex];
  return current?.type === 'finding' ? current.finding : undefined;
}

export function calculateActiveBlockingCount(state: TuiState): number {
  const activeFindings = state.findings.filter((f) => !state.suppressedIds.has(f.id));
  return countBlockingFindings(activeFindings, state.failOnSeverity);
}

export function tuiStateReducer(state: TuiState, action: TuiAction): TuiState {
  const navItems = buildNavItems(state.findings, state.expandedGroups);

  switch (action.type) {
    case 'NAVIGATE_UP': {
      const nextIndex = Math.max(0, state.cursorIndex - 1);
      return { ...state, cursorIndex: nextIndex, evidenceIndex: 0 };
    }

    case 'NAVIGATE_DOWN': {
      const nextIndex = Math.min(Math.max(0, navItems.length - 1), state.cursorIndex + 1);
      return { ...state, cursorIndex: nextIndex, evidenceIndex: 0 };
    }

    case 'TOGGLE_GROUP_EXPAND': {
      const current = navItems[state.cursorIndex];
      if (!current || current.type !== 'header') return state;

      const nextExpanded = new Set(state.expandedGroups);
      if (nextExpanded.has(current.groupKey)) {
        nextExpanded.delete(current.groupKey);
      } else {
        nextExpanded.add(current.groupKey);
      }
      return { ...state, expandedGroups: nextExpanded };
    }

    case 'TOGGLE_SUPPRESSION': {
      const current = navItems[state.cursorIndex];
      if (!current || current.type !== 'finding') return state;

      const nextSuppressed = new Set(state.suppressedIds);
      if (nextSuppressed.has(current.finding.id)) {
        nextSuppressed.delete(current.finding.id);
      } else {
        nextSuppressed.add(current.finding.id);
      }
      return { ...state, suppressedIds: nextSuppressed };
    }

    case 'TOGGLE_SNIPPET_MODE': {
      return {
        ...state,
        snippetMode: state.snippetMode === 'source' ? 'diff' : 'source',
      };
    }

    case 'CYCLE_EVIDENCE': {
      const current = navItems[state.cursorIndex];
      if (!current || current.type !== 'finding') return state;

      const evidenceCount = (current.finding.evidence?.length ?? 0) + 1; // 0 is primary, 1..N are evidence
      if (evidenceCount <= 1) return state;

      const delta = action.direction === 'next' ? 1 : -1;
      const nextEvidenceIndex = (state.evidenceIndex + delta + evidenceCount) % evidenceCount;
      return { ...state, evidenceIndex: nextEvidenceIndex };
    }

    case 'OPEN_MODAL': {
      return { ...state, activeModal: action.modal, explainScrollOffset: 0 };
    }

    case 'CLOSE_MODAL': {
      return { ...state, activeModal: null };
    }

    case 'SCROLL_EXPLAIN': {
      const nextOffset = Math.max(0, state.explainScrollOffset + action.delta);
      return { ...state, explainScrollOffset: nextOffset };
    }

    case 'SET_PROGRESS': {
      return { ...state, progressEvent: action.event };
    }

    case 'FINISH_REVIEW': {
      const hasFindings = action.result.findings.length > 0;
      return {
        ...state,
        findings: action.result.findings,
        viewMode: hasFindings ? 'workspace' : 'clean',
        cursorIndex: 0,
        evidenceIndex: 0,
      };
    }

    case 'START_RE_REVIEW': {
      return {
        ...state,
        viewMode: 'progress',
        activeModal: null,
      };
    }

    default:
      return state;
  }
}
```

---

### 3.6 Presentation Components

#### 3.6.1 Header Component (`src/renderers/tui/components/Header.tsx`)
- **Role:** Renders the top 2 lines of the TUI: brand logo, repo path, scope, findings breakdown by severity, and real-time blocking status badge (`[FAILING]` or `[PASSING]`).
- **Closest Analog:** [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts#L49-L56) and [`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts#L81-L87).
- **Ink Pattern:**
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { RankedFinding } from '../../../review/types.js';

export interface HeaderProps {
  repoRoot: string;
  scopeType: string;
  findings: readonly RankedFinding[];
  suppressedIds: ReadonlySet<string>;
  blockingCount: number;
}

export function Header({ repoRoot, scopeType, findings, suppressedIds, blockingCount }: HeaderProps) {
  const activeFindings = findings.filter((f) => !suppressedIds.has(f.id));
  const counts = {
    critical: activeFindings.filter((f) => f.severity === 'critical').length,
    high: activeFindings.filter((f) => f.severity === 'high').length,
    medium: activeFindings.filter((f) => f.severity === 'medium').length,
    low: activeFindings.filter((f) => f.severity === 'low').length,
    info: activeFindings.filter((f) => f.severity === 'info').length,
  };

  const statusBadge =
    blockingCount > 0 ? (
      <Text bold color="red">
        [FAILING ({blockingCount} blocking)]
      </Text>
    ) : (
      <Text bold color="green">
        [PASSING]
      </Text>
    );

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          OCTATE REVIEW <Text dimColor>│ {repoRoot} ({scopeType})</Text>
        </Text>
        {statusBadge}
      </Box>
      <Box gap={1}>
        <Text color="red" bold>CRIT: {counts.critical}</Text>
        <Text color="magenta" bold>HIGH: {counts.high}</Text>
        <Text color="yellow">MED: {counts.medium}</Text>
        <Text color="blue">LOW: {counts.low}</Text>
        <Text dimColor>INFO: {counts.info}</Text>
        {suppressedIds.size > 0 && (
          <Text dimColor italic>({suppressedIds.size} suppressed)</Text>
        )}
      </Box>
    </Box>
  );
}
```

#### 3.6.2 Footer Component (`src/renderers/tui/components/Footer.tsx`)
- **Role:** Persistent bottom bar displaying context-aware keyboard shortcuts.
- **Ink Pattern:**
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ModalType } from '../types.js';

export interface FooterProps {
  activeModal: ModalType;
}

export function Footer({ activeModal }: FooterProps) {
  if (activeModal === 'fix') {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          <Text bold color="cyan">c</Text>: Copy Code  <Text bold color="cyan">p</Text>: Copy Patch  <Text bold color="cyan">Esc</Text>: Close Modal
        </Text>
      </Box>
    );
  }

  if (activeModal === 'explain') {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          <Text bold color="cyan">↑/↓</Text> (or <Text bold color="cyan">j/k</Text>): Scroll  <Text bold color="cyan">Esc</Text>: Close Modal
        </Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        <Text bold color="cyan">↑/↓</Text>: Nav  <Text bold color="cyan">Enter</Text>: Expand  <Text bold color="cyan">f</Text>: Fix  <Text bold color="cyan">e</Text>: Explain  <Text bold color="cyan">s</Text>: Suppress  <Text bold color="cyan">d</Text>: Diff  <Text bold color="cyan">Tab</Text>: Evidence  <Text bold color="cyan">r</Text>: Re-review  <Text bold color="cyan">?</Text>: Help
      </Text>
      <Text dimColor>
        <Text bold color="red">q</Text>: Quit
      </Text>
    </Box>
  );
}
```

#### 3.6.3 Navigator Component (`src/renderers/tui/components/Navigator.tsx`)
- **Role:** Displays collapsible severity groups and finding items with cursor indication, suppression strike-through, and truncated titles.
- **Ink Pattern:**
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { NavItem } from '../types.js';

export interface NavigatorProps {
  navItems: readonly NavItem[];
  cursorIndex: number;
  suppressedIds: ReadonlySet<string>;
}

export function Navigator({ navItems, cursorIndex, suppressedIds }: NavigatorProps) {
  return (
    <Box flexDirection="column" width="100%">
      {navItems.map((item, index) => {
        const isSelected = index === cursorIndex;
        const cursorMarker = isSelected ? <Text color="cyan" bold>&gt; </Text> : <Text>  </Text>;

        if (item.type === 'header') {
          const arrow = item.expanded ? '▼' : '▶';
          return (
            <Box key={`header-${item.groupKey}`} marginY={0}>
              {cursorMarker}
              <Text bold color="yellow">
                {arrow} {item.groupKey.toUpperCase()} ({item.count})
              </Text>
            </Box>
          );
        }

        const finding = item.finding;
        const isSuppressed = suppressedIds.has(finding.id);
        const line = finding.startLine ?? finding.line ?? 1;
        const fileLoc = `${finding.file}:${line}`;

        return (
          <Box key={`finding-${finding.id}`}>
            {cursorMarker}
            <Text color={isSuppressed ? 'gray' : isSelected ? 'cyan' : undefined} strikethrough={isSuppressed}>
              [{finding.category}] {fileLoc} — {finding.title}
            </Text>
            {isSuppressed && <Text dimColor> [SUPPRESSED]</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
```

#### 3.6.4 CodeSnippet & DetailPane (`src/renderers/tui/components/CodeSnippet.tsx` & `DetailPane.tsx`)
- **Role:** Detail view showing finding metadata, evidence tabs, source code context (±4 lines with line gutters), and git diff view toggle (`d`).
- **Ink Pattern:**
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { RankedFinding } from '../../../review/types.js';
import { formatCodeSnippet, formatDiffLines } from '../syntax.js';
import type { SnippetMode } from '../types.js';

export interface DetailPaneProps {
  finding?: RankedFinding | undefined;
  snippetMode: SnippetMode;
  evidenceIndex: number;
  fileLines: string[];
  diffText: string;
}

export function DetailPane({
  finding,
  snippetMode,
  evidenceIndex,
  fileLines,
  diffText,
}: DetailPaneProps) {
  if (!finding) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Select a finding in the navigator list to inspect details.</Text>
      </Box>
    );
  }

  const activeEvidence = evidenceIndex > 0 ? finding.evidence?.[evidenceIndex - 1] : undefined;
  const targetFile = activeEvidence ? activeEvidence.file : finding.file;
  const targetStart = activeEvidence ? activeEvidence.startLine : (finding.startLine ?? finding.line ?? 1);
  const targetEnd = activeEvidence ? activeEvidence.endLine : (finding.endLine ?? targetStart);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="white">{finding.title}</Text>
        <Text dimColor>{finding.message}</Text>
        <Box gap={1} marginTop={1}>
          <Text dimColor>Score: <Text bold color="cyan">{finding.compositeScore.toFixed(1)}</Text></Text>
          <Text dimColor>Confidence: <Text bold color="yellow">{(finding.confidence * 100).toFixed(0)}%</Text></Text>
          <Text dimColor>Blast Radius: <Text bold color="magenta">{finding.blastRadius}</Text></Text>
        </Box>
      </Box>

      {finding.evidence && finding.evidence.length > 0 && (
        <Box gap={1} marginBottom={1}>
          <Text color={evidenceIndex === 0 ? 'cyan' : 'gray'} bold={evidenceIndex === 0}>
            [0: Primary ({finding.file}:{finding.startLine})]
          </Text>
          {finding.evidence.map((ev, idx) => (
            <Text
              key={`${ev.file}-${ev.startLine}`}
              color={evidenceIndex === idx + 1 ? 'cyan' : 'gray'}
              bold={evidenceIndex === idx + 1}
            >
              [{idx + 1}: {ev.relationship} ({ev.file}:{ev.startLine})]
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column" borderStyle="single" borderColor="dim">
        <Text bold dimColor>
          {snippetMode === 'source' ? `SOURCE: ${targetFile}:${targetStart}` : `GIT DIFF: ${targetFile}`}
        </Text>
        {snippetMode === 'source' ? (
          formatCodeSnippet({
            lines: fileLines,
            startLine: 1,
            highlightStart: targetStart,
            highlightEnd: targetEnd,
            contextRadius: 4,
          }).map((line, idx) => <Text key={`code-${idx}`}>{line}</Text>)
        ) : (
          formatDiffLines(diffText).map((line, idx) => <Text key={`diff-${idx}`}>{line}</Text>)
        )}
      </Box>
    </Box>
  );
}
```

#### 3.6.5 ProgressView & CleanDashboard (`src/renderers/tui/components/ProgressView.tsx` & `CleanDashboard.tsx`)
- **Role:** Elegant 8-stage progress tracker during review run (`ProgressView`), and celebratory green screen when 0 findings exist (`CleanDashboard`).
- **Ink Pattern:**
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ReviewProgressEvent } from '../../../application/types.js';

export interface ProgressViewProps {
  progressEvent?: ReviewProgressEvent | undefined;
}

export function ProgressView({ progressEvent }: ProgressViewProps) {
  const step = progressEvent?.step ? `[${progressEvent.step.current}/${progressEvent.step.total}] ` : '';
  const icon = progressEvent?.status === 'complete' ? '✓ ' : progressEvent?.status === 'error' ? '✗ ' : '⟳ ';
  const color = progressEvent?.status === 'complete' ? 'green' : progressEvent?.status === 'error' ? 'red' : 'cyan';

  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
      <Box borderStyle="round" borderColor="cyan" padding={2} flexDirection="column" alignItems="center">
        <Text bold color="cyan">OCTATE CODE REVIEW IN PROGRESS</Text>
        <Box marginTop={1}>
          <Text bold color={color}>{icon}</Text>
          <Text dimColor>{step}</Text>
          <Text>{progressEvent?.message ?? 'Initializing review pipeline...'}</Text>
        </Box>
      </Box>
    </Box>
  );
}

export interface CleanDashboardProps {
  filesAnalyzed: number;
  durationMs: number;
  scopeType: string;
}

export function CleanDashboard({ filesAnalyzed, durationMs, scopeType }: CleanDashboardProps) {
  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
      <Box borderStyle="round" borderColor="green" padding={2} flexDirection="column" alignItems="center">
        <Text bold color="green">✓ Clean Review — No issues found!</Text>
        <Box marginTop={1} gap={2}>
          <Text dimColor>Scope: <Text bold color="white">{scopeType}</Text></Text>
          <Text dimColor>Files analyzed: <Text bold color="white">{filesAnalyzed}</Text></Text>
          <Text dimColor>Duration: <Text bold color="white">{(durationMs / 1000).toFixed(2)}s</Text></Text>
        </Box>
        <Box marginTop={2}>
          <Text dimColor>Press <Text bold color="cyan">q</Text> to exit or <Text bold color="cyan">r</Text> to re-review.</Text>
        </Box>
      </Box>
    </Box>
  );
}
```

#### 3.6.6 Modals Family (`src/renderers/tui/components/Modals.tsx`)
- **Role:** Focus-locked overlays for suggested fix Before/After diff (`FixModal`), structured reasoning and critic justification (`ExplainModal`), and keyboard shortcuts cheatsheet (`HelpModal`).
- **Ink Pattern:**
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { RankedFinding } from '../../../review/types.js';
import { formatPatchPreview } from '../clipboard.js';

export interface FixModalProps {
  finding: RankedFinding;
}

export function FixModal({ finding }: FixModalProps) {
  const patch = formatPatchPreview(finding);

  return (
    <Box borderStyle="double" borderColor="green" flexDirection="column" padding={1} width="80%">
      <Text bold color="green">SUGGESTED FIX PREVIEW</Text>
      <Box marginY={1} flexDirection="column">
        <Text dimColor>Target: {finding.file}:{finding.startLine}</Text>
        <Text>{finding.suggestedFix}</Text>
      </Box>
      <Box borderStyle="single" borderColor="dim" flexDirection="column">
        {patch.split('\n').map((line, idx) => (
          <Text key={idx} color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : 'dim'}>
            {line}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Press <Text bold color="cyan">c</Text> to copy fix, <Text bold color="cyan">Esc</Text> to close</Text>
      </Box>
    </Box>
  );
}

export interface ExplainModalProps {
  finding: RankedFinding;
  scrollOffset: number;
}

export function ExplainModal({ finding, scrollOffset }: ExplainModalProps) {
  const lines = [
    `TITLE: ${finding.title}`,
    `CATEGORY: ${finding.category.toUpperCase()} │ SEVERITY: ${finding.severity.toUpperCase()}`,
    '',
    'ROOT CAUSE & RATIONALE:',
    finding.message,
    '',
    `IMPACT & BLAST RADIUS (Score: ${finding.blastRadius}/100):`,
    finding.impact,
    '',
    `CONTRIBUTING REVIEWERS:`,
    finding.contributingReviewers.join(', ') || finding.reviewer,
    '',
    `RELATED SYMBOLS:`,
    finding.relatedSymbols?.join(', ') || 'None',
  ];

  const visibleLines = lines.slice(scrollOffset, scrollOffset + 15);

  return (
    <Box borderStyle="double" borderColor="magenta" flexDirection="column" padding={1} width="85%">
      <Text bold color="magenta">STRUCTURED REASONING & EXPLANATION</Text>
      <Box flexDirection="column" marginY={1}>
        {visibleLines.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
      </Box>
      <Text dimColor>Scroll: <Text bold color="cyan">↑/↓</Text> │ Press <Text bold color="cyan">Esc</Text> to close</Text>
    </Box>
  );
}

export function HelpModal() {
  return (
    <Box borderStyle="double" borderColor="yellow" flexDirection="column" padding={1} width="70%">
      <Text bold color="yellow">OCTATE KEYBOARD SHORTCUTS</Text>
      <Box flexDirection="column" marginY={1}>
        <Text><Text bold color="cyan">↑ / k</Text> : Navigate up</Text>
        <Text><Text bold color="cyan">↓ / j</Text> : Navigate down</Text>
        <Text><Text bold color="cyan">Enter</Text> : Expand / collapse severity section</Text>
        <Text><Text bold color="cyan">f</Text>     : Open suggested fix Before/After modal</Text>
        <Text><Text bold color="cyan">e</Text>     : Open structured reasoning explain modal</Text>
        <Text><Text bold color="cyan">s</Text>     : Toggle finding session suppression</Text>
        <Text><Text bold color="cyan">d</Text>     : Toggle source code snippet vs git diff</Text>
        <Text><Text bold color="cyan">Tab / ]</Text> : Cycle forward through supporting evidence</Text>
        <Text><Text bold color="cyan">[</Text>     : Cycle backward through supporting evidence</Text>
        <Text><Text bold color="cyan">c</Text>     : Copy fix to clipboard (in Fix modal)</Text>
        <Text><Text bold color="cyan">r</Text>     : Re-run review in-place</Text>
        <Text><Text bold color="cyan">?</Text>     : Open this help modal</Text>
        <Text><Text bold color="cyan">Esc</Text>   : Close modal overlay</Text>
        <Text><Text bold color="red">q</Text>     : Quit Octate review</Text>
      </Box>
      <Text dimColor>Press <Text bold color="cyan">Esc</Text> or <Text bold color="cyan">?</Text> to close</Text>
    </Box>
  );
}
```

---

### 3.7 TUI Root Coordinator (`src/renderers/tui/app.tsx`)

#### Architectural Role & Analog
- **Role:** Responsive split layout coordinator and global `useInput` keyboard event router.
- **Responsive Breakpoint (D-01):** Horizontal side-by-side split (navigator ~38%, detail pane flexGrow=1) when terminal columns $\ge 100$; vertically stacked when $< 100$.
- **Analog:** [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts) (orchestration & key routing).

#### Established Pattern for `src/renderers/tui/app.tsx`
```tsx
import React, { useReducer } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { copyToClipboard, formatPatchPreview } from './clipboard.js';
import { CleanDashboard } from './components/CleanDashboard.js';
import { DetailPane } from './components/DetailPane.js';
import { Footer } from './components/Footer.js';
import { Header } from './components/Header.js';
import { ExplainModal, FixModal, HelpModal } from './components/Modals.js';
import { Navigator } from './components/Navigator.js';
import { ProgressView } from './components/ProgressView.js';
import {
  buildNavItems,
  calculateActiveBlockingCount,
  getActiveFinding,
  tuiStateReducer,
} from './state.js';
import type { TuiState } from './types.js';

export interface AppProps {
  initialState: TuiState;
  onQuit: () => void;
  onReReview?: (() => Promise<void>) | undefined;
  fileContents?: Map<string, string> | undefined;
  diffText?: string | undefined;
}

export function App({ initialState, onQuit, onReReview, fileContents, diffText = '' }: AppProps) {
  const [state, dispatch] = useReducer(tuiStateReducer, initialState);
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isWide = columns >= 100;

  const navItems = buildNavItems(state.findings, state.expandedGroups);
  const activeFinding = getActiveFinding(state);
  const blockingCount = calculateActiveBlockingCount(state);

  useInput((input, key) => {
    // 1. Modal overlay priority handling
    if (state.activeModal !== null) {
      if (key.escape) {
        dispatch({ type: 'CLOSE_MODAL' });
        return;
      }
      if (state.activeModal === 'fix') {
        if (input === 'c' && activeFinding) {
          copyToClipboard(activeFinding.suggestedFix ?? '');
        }
        if (input === 'p' && activeFinding) {
          copyToClipboard(formatPatchPreview(activeFinding));
        }
        return;
      }
      if (state.activeModal === 'explain') {
        if (key.upArrow || input === 'k') dispatch({ type: 'SCROLL_EXPLAIN', delta: -1 });
        if (key.downArrow || input === 'j') dispatch({ type: 'SCROLL_EXPLAIN', delta: 1 });
        return;
      }
      if (state.activeModal === 'help') {
        if (input === '?' || key.escape) dispatch({ type: 'CLOSE_MODAL' });
        return;
      }
    }

    // 2. Base workspace navigation
    if (key.upArrow || input === 'k') dispatch({ type: 'NAVIGATE_UP' });
    if (key.downArrow || input === 'j') dispatch({ type: 'NAVIGATE_DOWN' });
    if (key.return) dispatch({ type: 'TOGGLE_GROUP_EXPAND' });
    if (input === 'f' && activeFinding) dispatch({ type: 'OPEN_MODAL', modal: 'fix' });
    if (input === 'e' && activeFinding) dispatch({ type: 'OPEN_MODAL', modal: 'explain' });
    if (input === 's' && activeFinding) dispatch({ type: 'TOGGLE_SUPPRESSION' });
    if (input === 'd') dispatch({ type: 'TOGGLE_SNIPPET_MODE' });
    if (key.tab || input === ']') dispatch({ type: 'CYCLE_EVIDENCE', direction: 'next' });
    if (input === '[') dispatch({ type: 'CYCLE_EVIDENCE', direction: 'prev' });
    if (input === '?' || input === 'h') dispatch({ type: 'OPEN_MODAL', modal: 'help' });

    if (input === 'r' && onReReview) {
      dispatch({ type: 'START_RE_REVIEW' });
      void onReReview();
    }

    if (input === 'q') {
      onQuit();
    }
  });

  if (state.viewMode === 'progress') {
    return <ProgressView progressEvent={state.progressEvent} />;
  }

  if (state.viewMode === 'clean') {
    return (
      <CleanDashboard
        filesAnalyzed={state.findings.length}
        durationMs={0}
        scopeType={state.scopeType}
      />
    );
  }

  const rawFile = activeFinding ? (fileContents?.get(activeFinding.file) ?? '') : '';
  const fileLines = rawFile ? rawFile.split('\n') : [];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header
        repoRoot={state.repoRoot}
        scopeType={state.scopeType}
        findings={state.findings}
        suppressedIds={state.suppressedIds}
        blockingCount={blockingCount}
      />

      <Box flexDirection={isWide ? 'row' : 'column'} flexGrow={1} marginY={1}>
        <Box width={isWide ? '38%' : '100%'} borderStyle="single" borderColor="gray" paddingX={1}>
          <Navigator
            navItems={navItems}
            cursorIndex={state.cursorIndex}
            suppressedIds={state.suppressedIds}
          />
        </Box>
        <DetailPane
          finding={activeFinding}
          snippetMode={state.snippetMode}
          evidenceIndex={state.evidenceIndex}
          fileLines={fileLines}
          diffText={diffText}
        />
      </Box>

      {state.activeModal === 'fix' && activeFinding && <FixModal finding={activeFinding} />}
      {state.activeModal === 'explain' && activeFinding && (
        <ExplainModal finding={activeFinding} scrollOffset={state.explainScrollOffset} />
      )}
      {state.activeModal === 'help' && <HelpModal />}

      <Footer activeModal={state.activeModal} />
    </Box>
  );
}
```

---

### 3.8 Interactive TUI ReviewRenderer (`src/renderers/tui/renderer.ts`)

#### Architectural Role & Analog
- **Role:** Implements the `ReviewRenderer` contract. Manages alternate screen buffer lifecycle, renders the React/Ink application, handles exit signals, evaluates blocking exit codes, and writes a concise stderr summary.
- **Closest Analog:** [`src/renderers/console.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts) and [`src/renderers/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/types.ts).
- **Conventions:**
  - Pluggable `render(result: ReviewResult): Promise<void> | void`.
  - Terminal restoration on exit (`TerminalLifecycleManager.exit()`).
  - Stderr failure/success summary per D-16.

#### Concrete Code Excerpt from Analog ([`src/renderers/console.ts:34-46`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts#L34-L46))
```typescript
export class ConsoleRenderer implements ReviewRenderer {
  private readonly options: RendererOptions;

  constructor(options: RendererOptions = {}) {
    this.options = options;
  }

  public async render(result: ReviewResult): Promise<void> {
    // ...
  }
}
```

#### Established Pattern for `src/renderers/tui/renderer.ts`
```typescript
import React from 'react';
import { render } from 'ink';
import pc from 'picocolors';
import { countBlockingFindings } from '../../application/policy.js';
import type { ReviewFailOnSeverity } from '../../application/types.js';
import type { ReviewResult } from '../../review/types.js';
import type { RendererOptions, ReviewRenderer } from '../types.js';
import { App } from './app.js';
import { TerminalLifecycleManager } from './terminal.js';
import type { TuiState } from './types.js';

export interface InteractiveTuiOptions extends RendererOptions {
  repoRoot?: string | undefined;
  scopeType?: string | undefined;
  failOn?: ReviewFailOnSeverity | undefined;
  onReReview?: (() => Promise<void>) | undefined;
  fileContents?: Map<string, string> | undefined;
  diffText?: string | undefined;
}

export class InteractiveTuiRenderer implements ReviewRenderer {
  private readonly options: InteractiveTuiOptions;
  private readonly lifecycle: TerminalLifecycleManager;

  constructor(options: InteractiveTuiOptions = {}) {
    this.options = options;
    this.lifecycle = new TerminalLifecycleManager(
      (options.stream as NodeJS.WriteStream | undefined) ?? process.stdout
    );
  }

  public async render(result: ReviewResult): Promise<void> {
    this.lifecycle.enter();

    const initialState: TuiState = {
      findings: result.findings,
      suppressedIds: new Set<string>(),
      cursorIndex: 0,
      expandedGroups: new Set(['critical', 'high', 'medium', 'low', 'info']),
      activeModal: null,
      viewMode: result.findings.length === 0 ? 'clean' : 'workspace',
      snippetMode: 'source',
      evidenceIndex: 0,
      explainScrollOffset: 0,
      failOnSeverity: this.options.failOn ?? 'critical',
      repoRoot: this.options.repoRoot ?? process.cwd(),
      scopeType: this.options.scopeType ?? result.metadata.scopeType,
    };

    let exitCode = 0;
    let finalBlockingCount = 0;

    await new Promise<void>((resolve) => {
      const inkInstance = render(
        React.createElement(App, {
          initialState,
          onQuit: () => {
            inkInstance.unmount();
            resolve();
          },
          onReReview: this.options.onReReview,
          fileContents: this.options.fileContents,
          diffText: this.options.diffText,
        }),
        { patchConsole: true }
      );
    });

    this.lifecycle.exit();

    finalBlockingCount = countBlockingFindings(result.findings, this.options.failOn ?? 'critical');
    exitCode = finalBlockingCount > 0 ? 1 : 0;
    process.exitCode = exitCode;

    if (finalBlockingCount > 0) {
      process.stderr.write(
        pc.red(`\nOctate review finished: ${finalBlockingCount} blocking findings (exit 1)\n`)
      );
    } else {
      process.stderr.write(pc.green('\nOctate review finished: clean (exit 0)\n'));
    }
  }
}
```

---

### 3.9 Renderer Barrel & Factory Registration (`src/renderers/index.ts`)

#### Architectural Role & Analog
- **Role:** Adds `'tui'` to `OutputFormat` and configures `createRenderer` to instantiate `InteractiveTuiRenderer`.
- **Closest Analog:** [`src/renderers/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/index.ts).

#### Concrete Code Excerpt from Analog ([`src/renderers/index.ts:17-44`](file:///home/ved/Desktop/project_i/Octate/src/renderers/index.ts#L17-L44))
```typescript
export type OutputFormat = 'json' | 'sarif' | 'quiet' | 'console';

export function createRenderer(
  format: OutputFormat,
  options?: RendererOptions | undefined
): ReviewRenderer {
  switch (format) {
    case 'json':
      return new JsonRenderer(options);
    case 'sarif':
      return new SarifRenderer(options);
    case 'quiet':
      return new QuietRenderer(options);
    case 'console':
      return new ConsoleRenderer(options);
    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unsupported review renderer format: ${exhaustiveCheck}`);
    }
  }
}
```

#### Established Modification for `src/renderers/index.ts`
```typescript
import { InteractiveTuiRenderer } from './tui/renderer.js';

export * from './tui/renderer.js';
export * from './tui/types.js';

export type OutputFormat = 'json' | 'sarif' | 'quiet' | 'console' | 'tui';

// In createRenderer switch-case:
case 'tui':
  return new InteractiveTuiRenderer(options);
```

---

### 3.10 CLI Review Command Integration (`src/commands/review.ts`)

#### Architectural Role & Analog
- **Role:** Wires up TUI auto-detection, routes interactive runs to `InteractiveTuiRenderer`, hooks progress streaming directly to the TUI progress view, and preserves terminal shell history cleanly.
- **Closest Analog:** [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L222-L248).

#### Concrete Code Excerpt from Analog ([`src/commands/review.ts:222-248`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L222-L248))
```typescript
    const format: OutputFormat = options.json
      ? 'json'
      : options.sarif
        ? 'sarif'
        : options.quiet
          ? 'quiet'
          : 'console';

    const renderer = createRenderer(format, {
      outputFile: options.output,
      color: options.color,
    });

    await renderer.render(result);

    // Evaluate exit code policy
    const threshold: ReviewFailOnSeverity =
      options.failOn ?? config.review.failOnSeverity ?? 'critical';
    const blockingCount = countBlockingFindings(result.findings, threshold);

    if (blockingCount > 0) {
      process.stderr.write(formatFailureBanner(blockingCount, threshold));
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
```

#### Established Pattern for `src/commands/review.ts`
```typescript
import { shouldUseTui } from '../renderers/tui/terminal.js';

// In runReview:
const isInteractiveTui = shouldUseTui({
  isTTY: process.stdout.isTTY,
  ci: Boolean(process.env.CI),
  term: process.env.TERM,
  noTui: options.tui === false,
  json: options.json,
  sarif: options.sarif,
  quiet: options.quiet,
  outputFile: options.output,
});

const format: OutputFormat = options.json
  ? 'json'
  : options.sarif
    ? 'sarif'
    : options.quiet
      ? 'quiet'
      : isInteractiveTui
        ? 'tui'
        : 'console';
```

---

### 3.11 Build & Config Manifests (`package.json`, `tsconfig.json`, `jest.config.ts`)

#### 1. `package.json`
Add `"ink": "7.1.1"` and `"react": "19.2.8"` to `"dependencies"`, and `"@types/react": "^19.0.0"` to `"devDependencies"`.
```json
{
  "dependencies": {
    "ink": "7.1.1",
    "react": "19.2.8"
  },
  "devDependencies": {
    "@types/react": "^19.0.0"
  }
}
```

#### 2. `tsconfig.json`
Add `"jsx": "react-jsx"` to `compilerOptions` so TSX files use the modern React 19 JSX runtime:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

#### 3. `jest.config.ts`
Extend Jest configuration to match `.tsx` files:
```typescript
testMatch: ['**/*.test.ts', '**/*.test.tsx'],
extensionsToTreatAsEsm: ['.ts', '.tsx'],
moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
transform: {
  '^.+\\.tsx?$': ['ts-jest', {
    tsconfig: 'tsconfig.json',
    useESM: true,
  }],
},
```

---

## 4. Established Conventions & Golden Rules

### Convention Matrix

| Area | Established Project Convention | Reference File |
|:---|:---|:---|
| **TypeScript Strictness** | `"exactOptionalPropertyTypes": true`. Optional properties MUST be declared as `prop?: Type \| undefined;`. | [`src/renderers/types.ts:19`](file:///home/ved/Desktop/project_i/Octate/src/renderers/types.ts#L19) |
| **ESM Imports** | All local module imports MUST specify the `.js` extension (even in `.ts`/`.tsx` files), e.g., `import { App } from './app.js';`. | [`src/renderers/index.ts:5-9`](file:///home/ved/Desktop/project_i/Octate/src/renderers/index.ts#L5-L9) |
| **Terminal Styling** | Zero-dependency ANSI coloring via `picocolors`. No heavy tokenizers or Tree-sitter during the 60fps TUI render loop. | [`src/renderers/console.ts:5-28`](file:///home/ved/Desktop/project_i/Octate/src/renderers/console.ts#L5-L28) |
| **Biome Formatting** | 2-space indentation, single quotes, trailing commas for ES5, line width 100 characters. | [`biome.json:1-37`](file:///home/ved/Desktop/project_i/Octate/biome.json#L1-L37) |
| **Terminal Cleanliness** | Alternate screen entered via `\x1b[?1049h\x1b[?25l` and unconditionally restored via `\x1b[?1049l\x1b[?25h` on quit or signal traps. | [`src/renderers/tui/terminal.ts`](file:///home/ved/Desktop/project_i/Octate/src/renderers/tui/terminal.ts) |
| **Flexbox Layout** | Use Ink's embedded Yoga engine (`<Box width="38%">`, `<Box flexGrow={1}>`). Never manually compute character widths. | [`07-RESEARCH.md:442`](file:///home/ved/Desktop/project_i/Octate/.planning/phases/07-terminal-presentation/07-RESEARCH.md#L442) |

---

## 5. Headless Testing Strategy & Test Patterns

### Test Strategy Matrix

| Test File | Target Module | Strategy | Key Assertions |
|:---|:---|:---|:---|
| `state.test.ts` | `tuiStateReducer` | Pure function unit testing with deterministic fixtures. | `NAVIGATE_DOWN` clamps at end; `TOGGLE_GROUP_EXPAND` collapses/expands severity sections; `TOGGLE_SUPPRESSION` toggles finding ID and dynamically updates blocking finding count; `CYCLE_EVIDENCE` cycles tabs. |
| `syntax.test.ts` | `formatCodeSnippet`, `highlightTokens` | String transformation assertions. | Gutter width formatting (`142 │ ...`); target marker (`>`); keyword/string regex highlighting. |
| `terminal.test.ts` | `TerminalLifecycleManager`, `shouldUseTui` | Mock stream write assertions and environment flag tests. | Writes `?1049h` on enter and `?1049l` on exit; falls back to `false` when `CI=true`, `TERM=dumb`, or `--no-tui` passed. |
| `clipboard.test.ts` | `copyToClipboard`, `formatPatchPreview` | Base64 OSC 52 verification and patch diff formatting. | OSC 52 sequence matches `\x1b]52;c;<base64>\x07`; patch format conforms to `--- a/... +++ b/...`. |
| `components.test.tsx` | Ink UI Components | Synchronous headless rendering with Ink's `renderToString`. | `<Header />` displays `[FAILING]` / `[PASSING]`; `<Navigator />` displays grouped items; `<CleanDashboard />` displays celebratory banner; `<HelpModal />` contains shortcut table. |
| `review.test.ts` | CLI routing & exit code | Command line execution with mock arguments. | Routes to `InteractiveTuiRenderer` when TTY is true; falls back to `ConsoleRenderer` when `--no-tui` is provided. |

### Concrete Test Pattern: Pure State Reducer (`state.test.ts`)
```typescript
import { describe, expect, it } from '@jest/globals';
import { createMockFinding } from '../../application/__tests__/mocks.js';
import { buildNavItems, calculateActiveBlockingCount, tuiStateReducer } from './state.js';
import type { TuiState } from './types.js';

describe('renderers:tui:state', () => {
  const mockFinding1 = createMockFinding('critical', { id: 'f-1' });
  const mockFinding2 = createMockFinding('medium', { id: 'f-2' });

  const baseState: TuiState = {
    findings: [mockFinding1, mockFinding2],
    suppressedIds: new Set<string>(),
    cursorIndex: 0,
    expandedGroups: new Set(['critical', 'medium']),
    activeModal: null,
    viewMode: 'workspace',
    snippetMode: 'source',
    evidenceIndex: 0,
    explainScrollOffset: 0,
    failOnSeverity: 'critical',
    repoRoot: '/repo',
    scopeType: 'working-tree',
  };

  it('navigates down and clamps at boundary', () => {
    const navItems = buildNavItems(baseState.findings, baseState.expandedGroups);
    let state = baseState;

    for (let i = 0; i < navItems.length + 5; i++) {
      state = tuiStateReducer(state, { type: 'NAVIGATE_DOWN' });
    }

    expect(state.cursorIndex).toBe(navItems.length - 1);
  });

  it('toggles finding suppression and recalculates blocking count dynamically', () => {
    expect(calculateActiveBlockingCount(baseState)).toBe(1);

    // Navigate to critical finding (item index 1: header is 0, finding is 1)
    const stateWithCursor = { ...baseState, cursorIndex: 1 };
    const suppressedState = tuiStateReducer(stateWithCursor, { type: 'TOGGLE_SUPPRESSION' });

    expect(suppressedState.suppressedIds.has('f-1')).toBe(true);
    expect(calculateActiveBlockingCount(suppressedState)).toBe(0);

    // Toggle again to unsuppress
    const unsuppressedState = tuiStateReducer(suppressedState, { type: 'TOGGLE_SUPPRESSION' });
    expect(unsuppressedState.suppressedIds.has('f-1')).toBe(false);
    expect(calculateActiveBlockingCount(unsuppressedState)).toBe(1);
  });
});
```

### Concrete Test Pattern: Synchronous Ink Component Assertion (`components.test.tsx`)
```tsx
import React from 'react';
import { describe, expect, it } from '@jest/globals';
import { renderToString } from 'ink';
import { createMockFinding } from '../../application/__tests__/mocks.js';
import { Header } from './components/Header.js';
import { CleanDashboard } from './components/CleanDashboard.js';

describe('renderers:tui:components', () => {
  it('renders header with FAILING badge when blocking findings exist', () => {
    const finding = createMockFinding('critical');
    const output = renderToString(
      <Header
        repoRoot="/repo"
        scopeType="working-tree"
        findings={[finding]}
        suppressedIds={new Set()}
        blockingCount={1}
      />
    );

    expect(output).toContain('OCTATE REVIEW');
    expect(output).toContain('FAILING');
    expect(output).toContain('CRIT: 1');
  });

  it('renders celebratory clean dashboard on 0 findings', () => {
    const output = renderToString(
      <CleanDashboard filesAnalyzed={5} durationMs={450} scopeType="working-tree" />
    );

    expect(output).toContain('Clean Review');
    expect(output).toContain('Files analyzed: 5');
    expect(output).toContain('Press q to exit');
  });
});
```

---

*Pattern mapping verified for Phase 07: Terminal Presentation.*

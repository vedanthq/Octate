---
phase: 7
slug: terminal-presentation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-11
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.5.1 with ts-jest (`NODE_OPTIONS=--experimental-vm-modules`) |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/` |
| **Full suite command** | `pnpm test && npx tsc --noEmit` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/`
- **After every plan wave:** Run `pnpm test && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | TUI-01, OUT-01 | T-07-01 | Guaranteed terminal restoration and clean cursor recovery on signal/exit | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/terminal.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | TUI-01 | T-07-02 | Safe ANSI gutter formatting without unescaped control character injection | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/syntax.test.ts src/renderers/tui/clipboard.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | TUI-01, TUI-02 | T-07-03 | Deterministic state machine navigation and real-time blocking count recalculation | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/state.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | TUI-01, TUI-02, TUI-03 | T-07-04 | Responsive component layout rendering without terminal overflow crashes | component | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/components.test.tsx` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | TUI-01, OUT-01 | T-07-05 | Polymorphic ReviewRenderer contract adherence and safe CI auto-fallback | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/tui/renderer.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 3 | TUI-01, TUI-02, TUI-03, OUT-01 | T-07-06 | End-to-end CLI review command wiring, progress streaming, and exit code propagation | integration | `NODE_OPTIONS=--experimental-vm-modules npx jest src/commands/review.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install `ink@7.1.1` and `react@19.2.8` in `package.json` dependencies
- [ ] Configure `"jsx": "react-jsx"` in `tsconfig.json` compilerOptions
- [ ] Update `jest.config.ts` transform patterns to handle `.tsx` component files

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual aesthetic and layout responsiveness on terminal resize | TUI-01 | Ink layout dynamic recalculation in real terminal emulator | Run `node dist/cli.js review` in terminal; resize window width and confirm layout switches between side-by-side (>=100 cols) and stacked (<100 cols). |
| Native clipboard paste verification | TUI-01, TUI-02 | OS clipboard depends on window server / desktop environment | Press 'f' on finding with suggested fix, press 'c', then paste in editor to confirm clipboard snippet matches proposed fix. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-11

---
phase: 2
slug: analysis-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.5.1 |
| **Config file** | jest.config.js (root) |
| **Quick run command** | `NODE_OPTIONS=--experimental-vm-modules npx jest src/analysis/ --no-coverage` |
| **Full suite command** | `NODE_OPTIONS=--experimental-vm-modules npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `NODE_OPTIONS=--experimental-vm-modules npx jest src/analysis/ --no-coverage`
- **After every plan wave:** Run `NODE_OPTIONS=--experimental-vm-modules npx jest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PARSE-01 | — | N/A | unit | `npx jest src/analysis/parser/` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | PARSE-01 | — | N/A | unit | `npx jest src/analysis/parser/` | ✅ | ⬜ pending |
| 02-01-03 | 01 | 1 | PARSE-02 | — | N/A | unit | `npx jest src/analysis/symbols/` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | ANAL-01 | — | N/A | unit | `npx jest src/analysis/diagnostics/` | ✅ | ⬜ pending |
| 02-02-02 | 02 | 2 | ANAL-02 | — | N/A | unit | `npx jest src/analysis/diagnostics/` | ✅ | ⬜ pending |
| 02-03-01 | 03 | 3 | PARSE-01, PARSE-02, ANAL-01, ANAL-02 | — | N/A | integration | `npx jest src/analysis/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/analysis/parser/` — Tree-sitter parser module with WASM initialization
- [ ] `src/analysis/symbols/` — Symbol extraction module with stable IDs
- [ ] `src/analysis/diagnostics/` — Static analysis orchestration module
- [ ] `src/analysis/types.ts` — Shared types for symbols, diagnostics, ASTs

*Existing infrastructure (Jest, TypeScript, Biome) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tree-sitter WASM loads correctly | PARSE-01 | WASM loading requires Node.js runtime | Run `npx tsx src/analysis/parser/index.ts` and verify no errors |
| Static analysis tools detected | ANAL-01 | Tool detection depends on repo config files | Run `npx tsx src/analysis/diagnostics/index.ts` in a test repo |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

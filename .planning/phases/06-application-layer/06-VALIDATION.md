---
phase: 6
slug: application-layer
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x with ts-jest (ES modules) |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `NODE_OPTIONS=--experimental-vm-modules npx jest src/application/ src/renderers/` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `NODE_OPTIONS=--experimental-vm-modules npx jest src/application/ src/renderers/`
- **After every plan wave:** Run `pnpm test && npx @biomejs/biome check src/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | OUT-02 | T-06-01 | Accurate threshold evaluation without false passes | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/application/policy.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | OUT-02 | T-06-02 | Clean stderr progress without polluting stdout | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/application/progress.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | OUT-02 | T-06-03 | Strict SARIF v2.1.0 and JSON schema hygiene | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/json.test.ts src/renderers/sarif.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | OUT-02 | T-06-04 | Ultra-compact quiet output and safe file writing | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/renderers/quiet.test.ts src/renderers/console.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 3 | OUT-02 | T-06-05 | Scope listing without empty file sets or crashes | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/repository/scope.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 3 | OUT-02 | T-06-06 | Full pipeline orchestration and cancellation | integration | `NODE_OPTIONS=--experimental-vm-modules npx jest src/application/review.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-03 | 03 | 3 | OUT-02 | T-06-07 | Deterministic exit code resolution (0..5, 130) | integration | `NODE_OPTIONS=--experimental-vm-modules npx jest src/commands/review.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Staging and mock utilities for `ReviewUseCase` testing in `src/application/__tests__/mocks.ts`
- [ ] Test fixtures covering `ReviewResult` domain object rendering across JSON, SARIF, Quiet, and Console

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | All phase behaviors have automated verification via unit and integration tests. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-09-11

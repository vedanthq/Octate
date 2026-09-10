---
phase: 5
slug: review-engine
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x with ts-jest (ES modules) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/`
- **After every plan wave:** Run `pnpm test && pnpm run check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | REV-01 | T-05-01 | Untrusted diffs separated from instructions | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/heuristics.test.ts` | ✅ | ✅ green |
| 05-01-02 | 01 | 1 | REV-01 | T-05-02 | Graceful reviewer degradation without stalling | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/dag.test.ts` | ✅ | ✅ green |
| 05-02-01 | 02 | 2 | REV-03 | T-05-03 | Prevent duplicate finding noise / memory blowup | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/dedup.test.ts` | ✅ | ✅ green |
| 05-02-02 | 02 | 2 | REV-02 | T-05-04 | Strict grounding & fail-fast on corrupted Critic | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/critic.test.ts` | ✅ | ✅ green |
| 05-03-01 | 03 | 3 | REV-04 | T-05-05 | Accurate composite ranking with Critical-protection | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/ranking.test.ts` | ✅ | ✅ green |
| 05-03-02 | 03 | 3 | REV-01..04 | T-05-06 | End-to-end review engine pipeline integration | integration | `NODE_OPTIONS=--experimental-vm-modules npx jest src/review/engine.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/review/__tests__/mocks.ts` — `MockReviewModel` fixture simulating structural, semantic, security reviewers and critic
- [x] Shared fixtures in `src/review/` test files covering candidate findings, diff snippets, and ReferenceGraph mock stubs

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

**Approval:** verified 2026-09-10

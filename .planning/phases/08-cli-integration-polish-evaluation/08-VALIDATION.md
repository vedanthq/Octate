---
phase: 8
slug: cli-integration-polish-evaluation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-11
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.5.1 with ts-jest (ESM preset) |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `NODE_OPTIONS=--experimental-vm-modules npx jest src/commands/doctor.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `NODE_OPTIONS=--experimental-vm-modules npx jest {relevant-test-file}`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| 08-01-01 | 01 | 1 | CONF-01, REPO-01 | T-08-05 | Node runtime >= 22 & Git validation | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/commands/doctor.test.ts` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | ANAL-01, PARSE-01 | T-08-03 | Linter discovery & Tree-sitter WASM check | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/commands/doctor.test.ts` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | MODEL-01 | T-08-05 | Three-tier NVIDIA API check | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/commands/doctor.test.ts` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 2 | REV-01, REV-02 | T-08-04 | Golden diff fixtures & schema | integration | `NODE_OPTIONS=--experimental-vm-modules npx jest test/evaluation/evaluation.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | REV-03, REV-04 | T-08-04 | Negative clean pairing Critic verification | integration | `NODE_OPTIONS=--experimental-vm-modules npx jest test/evaluation/evaluation.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-03 | 02 | 2 | OUT-01, OUT-02 | T-08-04 | Benchmark scorecard (FP < 30%, Precision > 70%) | benchmark | `npm run bench` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 3 | CONF-02, CACHE-01 | T-08-03 | WASM path resolution in dist/ | build | `npm run build && test -f dist/wasm/tree-sitter-typescript.wasm` | ❌ W0 | ⬜ pending |
| 08-03-02 | 03 | 3 | CACHE-03, OUT-02 | T-08-01, T-08-02 | Bin shebang, chmod +x & pack:check | package | `npm run pack:check` | ❌ W0 | ⬜ pending |
| 08-03-03 | 03 | 3 | TUI-01, OUT-01 | T-08-01 | Documentation suite (README & docs/) | docs | `test -f README.md && test -f docs/configuration.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/fixtures/golden/` — directories and fixture contracts for TypeScript and Python
- [ ] `test/evaluation/harness.ts` — semantic matching engine and scorecard calculator
- [ ] `test/evaluation/evaluation.test.ts` — Jest runner for golden review cases
- [ ] `scripts/copy-wasm.cjs` — build hook copying WASM grammars to `dist/wasm/`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| `npx octate review` in fresh temp dir | OUT-01 | Requires published package simulation | Run `npm pack`, install tarball in isolated `/tmp/test-octate` directory, run `octate --version` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-09-11

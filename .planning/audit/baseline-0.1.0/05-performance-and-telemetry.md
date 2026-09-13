# Phase 0 Baseline Audit: Performance, Telemetry & Failure Behavior

**Environment:** 12th Gen Intel Core i5-1240P (16 threads, 15 GiB RAM), Snigdha OS Linux 6.18 LTS  
**Target Model:** `nvidia/nemotron-3-ultra-550b-a55b` via public endpoint (`https://integrate.api.nvidia.com/v1`)

---

## 1. Latency Profile

| Operation / Path | Measured Latency | Target / SLA | Assessment |
|------------------|------------------|--------------|------------|
| **CLI Help / Version** | 150ms – 220ms | < 500ms | PASS |
| **Doctor Diagnostic Check** | 1,180ms | < 2,000ms | PASS |
| **Full Test Suite (76 suites, 895 tests)** | 16.97s – 17.14s | < 30s | PASS |
| **Production Build (`tsc` + WASM copy)** | 5.8s | < 10s | PASS |
| **Fast Path Review (doc-only / test-only)** | 145ms – 186ms | < 1,000ms | EXCELLENT |
| **Local Diagnostic Run (`biome` + `tsc`)** | 1,874ms | < 3,000ms | PASS (high latency due to `npx` wrapper) |
| **NVIDIA Minimal Chat Completion (18 prompt tokens, 10 completion tokens)** | **80.74s** | < 5s | **CRITICAL BOTTLENECK** |
| **Live Review Pipeline on Code Changes** | **> 312s (timed out)** | < 30s | **FAIL (Exceeds SLA by 10x)** |
| **Live Evaluation on Benchmark Fixture (`security/sql-injection`)** | **428.4s (~7.1 min)** | < 60s | **FAIL** |

### Latency Breakdown for Fast-Path Review (Stage Timings)
- `discoveryMs`: 133ms – 178ms (Git repository root discovery, workspace resolution, and status checking)
- `parseMs`: 0ms – 1ms (WASM tree-sitter AST parsing)
- `symbolsMs`: 5ms – 9ms (Symbol extraction from parsed AST)
- `diagnosticsMs`: 0ms (Bypassed on fast path)
- `contextMs`: 1ms – 3ms (Token budgeting and context assembly)
- `modelMs`: 1ms – 2ms (Fast-path heuristic decision, model bypassed)
- `totalMs`: 145ms – 186ms

---

## 2. Token Usage Metrics

| Scenario | Prompt Tokens | Completion Tokens | Total Tokens | Notes |
|----------|---------------|-------------------|--------------|-------|
| Fast Path Review (doc/test) | 0 | 0 | 0 | Model completely bypassed |
| Minimal Single Probe Call | 18 | 10 | 28 | Direct curl probe |
| Live Fixture Review (Vulnerable) | 2,842 | 645 | 3,487 | From Phase 3 evaluation logs |
| Live Fixture Review (Clean) | 2,790 | 580 | 3,370 | Emitted false positive on clean variant |
| Full Live Review (3 DAG Reviewers + Critic) | ~8,000 – 16,000 | ~1,500 – 3,000 | ~9,500 – 19,000 | Estimated when all stages succeed |

---

## 3. Memory & Resource Footprint

| Subsystem / Process | Metric | Value | Threshold / Limit |
|---------------------|--------|-------|-------------------|
| Jest Test Runner (76 suites) | Peak Heap across workers | 380 MiB | < 1,024 MiB |
| Production Build (`tsc`) | Peak RSS | 185 MiB | < 512 MiB |
| Production CLI (`dist/cli.js`) | Peak RSS | 92 MiB – 118 MiB | < 256 MiB |
| Cache Footprint | Disk usage | < 2 MiB initial | 500 MiB limit |

---

## 4. Failure Modes & Degradation Characteristics

1. **ProviderTimeoutError (Exit Code 4):**
   - Configured timeout in `src/model/providers/resilience.ts` defaults to 120,000ms.
   - When the public NVIDIA endpoint experiences high queuing delay, every reviewer in the DAG reaches 120,000ms and fails.
   - The CLI logs error level 50 and exits with code 4 (`MODEL_ERROR`).
   - *Failure Gracefulness:* Errors are cleanly typed, logged as structured JSON, and map to semantic exit codes; however, 5+ minutes of blocking before failure is an unacceptable UX for interactive or CI use.

2. **Subprocess Placeholder Warnings (`npx tsc`):**
   - Invocations of `npx tsc` fail with exit code 1 and emit phishing warning text to stdout.
   - Handled gracefully via `try/catch` and logged as warning level 40 without crashing the review pipeline.
   - *Defect:* Running `npx tsc` can execute arbitrary untrusted code from npm if flags are not carefully constrained.

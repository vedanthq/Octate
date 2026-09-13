# Phase 0 Baseline Audit: CLI Surface Verification

**Target Executable:** `node ./bin/octate` / `dist/cli.js`  
**Execution Environment:** Snigdha OS / Linux 6.18.49-2-lts, Node.js v26.8.1

---

## 1. Summary Matrix of Required CLI Invocations

| Command / Option | Executed Command | Exit Code | Observed Behavior | Status |
|------------------|------------------|-----------|-------------------|--------|
| **CLI Help** | `node ./bin/octate --help` | `0` | Displays usage, global options, and subcommands (`init`, `review`, `doctor`) | PASS |
| **Version** | `node ./bin/octate --version` | `0` | Outputs `0.1.0` cleanly | PASS |
| **Doctor** | `node ./bin/octate doctor` | `0` | Probes Node (pass), config (pass), Git (pass), WASM (pass), NVIDIA API (pass), Cache (pass). Warns on missing tools in PATH. | PASS (WARN) |
| **Working-Tree Review** | `node ./bin/octate review -w --json` | `0` | Analyzes working tree vs index; on doc diff bypasses model in 186ms, 0 findings | PASS |
| **Staged Review** | `node ./bin/octate review -s --json` | `0` | Analyzes staged changes vs HEAD; on doc diff bypasses model in 181ms, 0 findings | PASS |
| **Commit Review** | `node ./bin/octate review --commit 36df5f6 --json` | `4` | Full review with code changes attempts model call; times out on public NVIDIA endpoint (120s x 3 stages = 312s total). Exits code 4 (`MODEL_ERROR`). On doc-only commit (`--commit e802eae`), succeeds in 145ms. | FAIL (Live Inference Timeout) |
| **Range Review** | `node ./bin/octate review --range HEAD~1..HEAD --json` | `0` | Evaluates two-dot range `base..head`; succeeds in 147ms on doc range | PASS |
| **JSON Output** | `node ./bin/octate review --working --json` | `0` | Emits valid JSON payload with summary, findings, and metadata (stageCounts, timings) | PASS |
| **SARIF Output** | `node ./bin/octate review --staged --sarif` | `0` | Emits valid SARIF v2.1.0 document conforming to `http://json.schemastore.org/sarif-2.1.0.json` | PASS |
| **Quiet Mode** | `node ./bin/octate review --staged --quiet` | `0` | Suppresses stdout formatting, exits 0 | PASS |

---

## 2. Detailed Findings & Behavior Analysis

### 2.1 Doctor Subsystem Finding: Path Resolution of Linters/Compilers
- `octate doctor` checks `command -v` on system `PATH` only:
  ```
  ⚠ Static Analysis Tools: Detected 0/8 tools on PATH. Missing: [tsc, biome, eslint, ruff, mypy, pyright, bandit, pytest]
  ```
- *Root Cause:* `doctor` does not probe local `./node_modules/.bin/`, even though `typescript` and `@biomejs/biome` are installed in the repository's `node_modules`.
- *Consequence:* Users see a false warning on valid node projects that rely on locally installed devDependencies.

### 2.2 Live Inference Bottleneck on Public NVIDIA API
- When reviewing non-trivial code changes (e.g. `src/config/merger.ts` in commit `36df5f6`):
  - Reviewer DAG invokes `structural`, `semantic`, and `security` reviewers.
  - Each reviewer sends requests to `https://integrate.api.nvidia.com/v1/chat/completions`.
  - Public NVIDIA inference for `nvidia/nemotron-3-ultra-550b-a55b` incurs extreme queue and reasoning latency (exceeding the default 120s timeout).
  - All 3 stages fail sequentially with `ProviderTimeoutError: Request timed out after 120000ms`, totaling 312 seconds before throwing `Error: All review DAG stages failed` and exiting with code 4 (`MODEL_ERROR`).
  - *Mitigation requirement for v0.1.0:* Fast local/mock fallback option for CI, review-level caching to eliminate redundant inference, configurable timeouts, and streaming or optimized model parameters.

### 2.3 Review-Level Caching Gap
- During `octate review` invocations, logger messages show config loading and cache initialization, but review findings are neither looked up from cache before dispatching reviewers, nor stored in cache after completion.
- *Root Cause:* `src/commands/review.ts` initializes the cache store but never invokes `cache.get()` or `cache.set()` for review findings.

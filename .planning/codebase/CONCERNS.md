# Codebase Concerns

**Analysis Date:** 2026-09-11

## Tech Debt

### [Phase 6 Application Layer & UseCase Orchestration Pending]
- **Issue:** While `src/commands/review.ts` now wires `AnalysisOrchestrator`, `ContextEngine`, and `ReviewEngine`, the formal `ReviewUseCase` application orchestrator, progress event streaming (`review:progress`), live cancellation propagation, and renderer transformations (`HumanRenderer`, `JsonRenderer`, `SarifRenderer`) remain to be unified in Phase 6 and Phase 7.
- **Files:** `src/commands/review.ts`
- **Impact:** CLI works in baseline mode but does not yet emit live progress stages or full CI/CD renderer formats.
- **Fix approach:** Implement Phase 6 (Application Layer: `ReviewUseCase`, progress emitter, exit code mapper).

### [Scope Resolution - Empty Staged and Working File Lists]
- **Issue:** `getStagedFiles()` and `getWorkingFiles()` in `src/repository/scope.ts:152-165` currently return empty arrays (`return [];`).
- **Files:** `src/repository/scope.ts`
- **Impact:** When a user runs `octate review --staged` or reviews the working tree, the resolved `ReviewScope.files` contains an empty list unless files are explicitly passed or derived from the diff.
- **Fix approach:** Implement working and staged file listing using isomorphic-git's `statusMatrix` (matching the diff generation logic in `src/repository/git.ts:getStagedDiff()` and `getWorkingDiff()`).

### [Scope Resolution - Simplified Merge Base]
- **Issue:** `findMergeBase()` in `src/repository/scope.ts:170-192` returns `ref1` as the base instead of calculating the true common ancestor commit.
- **Files:** `src/repository/scope.ts`
- **Impact:** Three-dot range diffs (`--range base...head`) and branch comparisons (`--branch feature`) compute diffs against the branch ref rather than the merge-base fork point.
- **Fix approach:** Implement common ancestor traversal or leverage isomorphic-git's merge-base utilities.

### [Subprocess Tool Invocation via `npx`]
- **Issue:** `src/analysis/diagnostics/tools.ts` invokes `tsc` and `biome` using `npx tsc` and `npx biome`.
- **Files:** `src/analysis/diagnostics/tools.ts`
- **Impact:** In environments where npm/npx is present but the package is not installed globally or locally, `npx` can print interactive warning messages (e.g. "This is not the tsc command you are looking for") and introduce 1-2 second latency overhead per invocation.
- **Fix approach:** Prefer resolving local binaries in `./node_modules/.bin/tsc` and `./node_modules/.bin/biome` before falling back to `npx` or system PATH.

### [Cache Store - Directory Size Calculation on Init & O(n) Eviction]
- **Issue:** `initialize()` in `src/cache/store.ts` recursively walks the cache directory to calculate total size, and `ensureSpace()` re-scans the directory to find oldest files for eviction.
- **Files:** `src/cache/store.ts`
- **Impact:** Startup latency and cache write times increase as the cache directory approaches its size limit (500MB).
- **Fix approach:** Store the total cache size and an LRU index in a single metadata file (`metadata.json`), updating it incrementally.

## Known Bugs

### [Jest Worker Teardown / Open Handles Warning]
- **Issue:** When running the full test suite (`pnpm test`), Jest outputs: `A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown.`
- **Files:** `jest.config.ts`, `src/cancellation/subprocess.ts`, `src/analysis/diagnostics/`
- **Impact:** Tests pass 100% (54/54 suites), but worker force-exit warning adds log noise.
- **Fix approach:** Identify unref'd timers or open subprocess streams and ensure explicit `.unref()` or teardown in `afterEach`/`afterAll`.

### [PromisePool.iterate() - Unstable Async Iteration]
- **Issue:** The `iterate()` method in `src/cache/pool.ts:61-100` uses `Promise.race([p, Promise.resolve(null)])` which resolves to null immediately, failing to properly track task completion.
- **Files:** `src/cache/pool.ts`
- **Impact:** If `iterate()` is called, it yields invalid results. (Note: `run()`, `runAll()`, and `map()` are tested and working properly; review DAG and diagnostics use `run()`, so they avoid this bug).
- **Fix approach:** Rewrite `iterate()` using an async generator queue or deprecate the unused method.

### [Subprocess Timeout Detection Flag]
- **Issue:** In `src/cancellation/subprocess.ts:86-135`, `timeoutHandle` is cleared in `cleanup()` before the `close` event handler checks `if (timeout && timeoutHandle)`.
- **Files:** `src/cancellation/subprocess.ts`
- **Impact:** Subprocesses killed due to timeout may occasionally be reported as generic process failures or cancellations rather than distinct timeout errors.
- **Fix approach:** Set a dedicated boolean flag `timedOut = true` inside the timeout callback.

## Security Considerations

### [Git Remote URL Credentials in Cache Identity Hash]
- **Issue:** `computeProjectIdentity()` in `src/cache/identity.ts:40-49` hashes the Git remote URL (`git config --get remote.origin.url`). If a user has embedded personal access tokens (e.g., `https://token@github.com/...`), the token is factored into the SHA256 identity hash.
- **Files:** `src/cache/identity.ts`
- **Risk:** While the hash is irreversible (SHA256 truncated to 16 hex chars), exposure of the remote URL during debugging could expose sensitive tokens.
- **Mitigation:** Strip credentials from URLs before computing project identity: `url.replace(/\/\/[^@]+@/, '//')`.

### [Subprocess Injection & Unsanitized Tool Commands]
- **Issue:** `src/analysis/diagnostics/tools.ts` executes static analysis tools (`tsc`, `biome`, `ruff`, etc.) with arguments passed to child processes.
- **Files:** `src/analysis/diagnostics/tools.ts`, `src/cancellation/subprocess.ts`
- **Current mitigation:** `spawnWithSignal` uses `child_process.spawn` with argument arrays (not `child_process.exec` with shell interpolation). Repository-defined configurations (`tsconfig.json`, `biome.json`) control tool behavior.

## Performance & Scalability

### [Tree-sitter WASM Binary Resolution in Distributed Package]
- **Issue:** Tree-sitter WebAssembly grammars are currently stored in `test-wasm/` in the project root. `src/analysis/parser/languages.ts` resolves grammars relative to the working directory or expected test paths.
- **Files:** `src/analysis/parser/languages.ts`, `test-wasm/`
- **Impact:** When compiled to `dist/` and run as a globally installed CLI binary (`npm i -g octate`), the relative path `test-wasm/` may not exist in the user's execution directory.
- **Improvement path:** Copy `.wasm` files into `dist/wasm/` during `pnpm build` and resolve them using `fileURLToPath(import.meta.url)` to guarantee reliable resolution across all execution environments.

### [Parallel Subprocess Concurrency]
- **Issue:** Running up to 7 static analysis tools (`tsc`, `biome`, `ruff`, `mypy`, `pyright`, `bandit`, `pytest`) can cause CPU and memory spikes on large repositories.
- **Current mitigation:** Concurrency is bounded to 3 parallel jobs via `PromisePool` in `src/analysis/diagnostics/index.ts`.
- **Improvement path:** Adjust concurrency dynamically based on available hardware cores (`os.availableParallelism?.() ?? 4`).

---

*Concerns audit: 2026-09-11*
*Update as issues are resolved or new technical debt is introduced*

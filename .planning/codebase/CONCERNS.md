# Codebase Concerns

**Analysis Date:** 2026-09-08

## Tech Debt

### [Review Command - Placeholder Implementation]
- **Issue:** `executeReview()` in `src/commands/review.ts:191-216` is a placeholder that returns empty findings. Full review engine implementation deferred to "Phase 5+"
- **Files:** `src/commands/review.ts`
- **Impact:** Core functionality (code review) not implemented. CLI runs but produces no actual findings.
- **Fix approach:** Implement deterministic analysis (tree-sitter parsing, static analysis) + AI provider integration per ARCHITECTURE.md phases 2-5.

### [Scope Resolution - Incomplete Staged/Working Tree File Lists]
- **Issue:** `getStagedFiles()` and `getWorkingFiles()` in `src/repository/scope.ts:152-165` return empty arrays. Comment says "simplified implementation"
- **Files:** `src/repository/scope.ts`
- **Impact:** `--staged` and `--working` review scopes will report 0 files analyzed even when changes exist.
- **Fix approach:** Implement proper index vs HEAD and working tree vs index comparison using isomorphic-git statusMatrix (similar to `getStagedDiff`/`getWorkingDiff` in `git.ts`).

### [Merge Base Detection - Simplified]
- **Issue:** `findMergeBase()` in `src/repository/scope.ts:170-192` returns first ref as base instead of actual merge base. Comment: "A proper implementation would use git merge-base"
- **Files:** `src/repository/scope.ts`
- **Impact:** `--range base...head` (three-dot) and `--branch` scopes produce incorrect diff base for forked histories.
- **Fix approach:** Use `git.mergeBase()` from isomorphic-git or implement proper merge base algorithm.

### [Model Provider Factory - Not Implemented]
- **Issue:** `createModelProvider()` in `src/model/abstraction.ts:37-42` throws "Provider not yet implemented (Phase 4)"
- **Files:** `src/model/abstraction.ts`
- **Impact:** No AI provider integration possible. Review engine cannot call NVIDIA API.
- **Fix approach:** Implement `LocalNvidiaProvider` and `HostedProvider` classes per Phase 4 spec.

### [Tree-sitter Parsing - Not Integrated]
- **Issue:** Tree-sitter dependencies installed (`tree-sitter`, `tree-sitter-typescript`, `tree-sitter-python`) but no parsing code exists in codebase
- **Files:** `package.json` (dependencies), no implementation in `src/`
- **Impact:** No language-aware code analysis, symbol extraction, or context ranking.
- **Fix approach:** Implement parsing layer per ARCHITECTURE.md Phase 2 (Context Engine).

### [Context Engine - Not Implemented]
- **Issue:** No Context Engine implementation exists. `ModelRequest.context` in `src/model/types.ts:71` expects ranked context items but nothing produces them.
- **Files:** Missing `src/context/` directory
- **Impact:** AI receives no relevant code context; findings will be low-quality.
- **Fix approach:** Implement context ranking (changed symbols, callers/callees, related types, tests, diagnostics) per Phase 3.

### [Cache Pool - navigator.hardwareConcurrency in Node.js]
- **Issue:** `createPromisePool()` in `src/cache/pool.ts:14` uses `navigator?.hardwareConcurrency` which is undefined in Node.js (browser API)
- **Files:** `src/cache/pool.ts`
- **Impact:** Falls back to hardcoded `4` instead of actual CPU cores. Minor but indicates copy-paste from browser code.
- **Fix approach:** Use `import('node:os').then(os => os.cpus().length)` or `require('os').cpus().length`.

### [Cache Store - O(n) Eviction on Every Write]
- **Issue:** `ensureSpace()` in `src/cache/store.ts:227-281` recursively walks entire cache directory, reads+parses ALL entries, sorts by creation time on every cache miss when near capacity
- **Files:** `src/cache/store.ts`
- **Impact:** Cache write latency grows linearly with cache size. At 500MB with many entries, writes become slow.
- **Fix approach:** Maintain LRU index in memory (already have `LRUCache` in `src/cache/lru.ts`) or use separate metadata file for O(1) eviction.

### [Cache Identity - Sync createRequire in ESM]
- **Issue:** `src/cache/identity.ts:12` uses `createRequire(import.meta.url)` which is synchronous and defeats ESM benefits
- **Files:** `src/cache/identity.ts`
- **Impact:** Minor startup overhead. Pattern suggests CommonJS migration artifacts.
- **Fix approach:** Remove unused `_require` variable (not used in file).

### [Diff Generation - No Rename Detection]
- **Issue:** `getChangedFiles()` in `src/repository/git.ts:412-413` has comment: "Note: rename detection would require additional logic. For now, we don't detect renames"
- **Files:** `src/repository/git.ts`
- **Impact:** Renamed files show as deleted + added, losing history context and confusing reviewers.
- **Fix approach:** Implement rename detection using similarity index (isomorphic-git has limited support; may need custom implementation).

## Known Bugs

### [PromisePool.iterate() - Race Condition and Logic Errors]
- **Issue:** `iterate()` method in `src/cache/pool.ts:61-100` has multiple issues:
  1. `isSettled = await Promise.race([p, Promise.resolve(null)])` always resolves to `null` immediately
  2. Yields same result multiple times as `executing` set not properly managed
  3. `yield result` at line 98 uses `result` from `Promise.race` which is the resolved value of first completed, not the one being removed
- **Files:** `src/cache/pool.ts`
- **Impact:** `iterate()` is broken and should not be used. Tests don't cover it (pool.test.ts only tests `run`, `runAll`, `map`, `drain`).
- **Fix approach:** Rewrite using proper async iterator pattern with `p-limit`'s queue or remove if unused.

### [Subprocess - Timeout Handling Race]
- **Issue:** `spawnWithSignal()` in `src/cancellation/subprocess.ts:86-97` creates timeout handler that kills process, but `close` handler at line 113-135 checks `if (timeout && timeoutHandle)` - `timeoutHandle` is cleared in `cleanup()` at line 100 called before close handler runs
- **Files:** `src/cancellation/subprocess.ts`
- **Impact:** Timeout errors may not be detected correctly; process killed by timeout may resolve as success.
- **Fix approach:** Track timeout state separately from handle; use `child.killed` flag.

### [Git Diff - Binary File Handling Loses Content]
- **Issue:** `getDiff()` in `src/repository/git.ts:225-228` catches all errors reading blobs and returns `# Binary file differs` without distinguishing read errors from actual binary files
- **Files:** `src/repository/git.ts`
- **Impact:** Unreadable files (permissions, encoding) silently treated as binary.
- **Fix approach:** Check `error.code === 'EISDIR'` or encoding errors specifically; propagate other errors.

### [Config Loader - Global Config ZodError Returns Defaults Silently]
- **Issue:** `loadGlobalConfig()` in `src/config/loader.ts:94-98` catches `ZodError`, logs warning, returns `DefaultConfig` instead of failing
- **Files:** `src/config/loader.ts`
- **Impact:** Invalid global config (`~/.config/octate/config.yaml`) silently ignored. User unaware their config is broken.
- **Fix approach:** Fail fast for global config validation errors, or at least surface warning to user via doctor command.

## Security Considerations

### [Git Remote URL - Credentials in Identity Hash]
- **Issue:** `computeProjectIdentity()` in `src/cache/identity.ts:40-49` extracts `remote "origin"` URL from `.git/config` and includes it in SHA256 hash. Git URLs often contain credentials: `https://user:token@github.com/...` or `git@github.com:user/repo.git`
- **Files:** `src/cache/identity.ts`
- **Risk:** Cache directory name derived from hash of credentials. If cache dir exposed (logs, error messages), credentials leak.
- **Current mitigation:** Hash is truncated to 16 chars (SHA256), but deterministic - same credentials always produce same hash.
- **Recommendations:** Strip credentials from URL before hashing (use `new URL(url).host` + path), or use only hostname+path.

### [NVIDIA API Key - Exposure in Doctor Command]
- **Issue:** `checkNvidiaConnectivity()` in `src/commands/doctor.ts:204-209` sends `Authorization: Bearer ${apiKey}` in fetch. If logger captures fetch options (it doesn't currently), key could leak.
- **Files:** `src/commands/doctor.ts`, `src/logging/index.ts`
- **Risk:** Pino redaction covers `apiKey` field but not `Authorization` header value.
- **Current mitigation:** Logger doesn't log fetch calls.
- **Recommendations:** Add `authorization` to `redactionPaths` in `src/logging/index.ts:15`; ensure fetch wrapper redacts headers.

### [File Reading - Large File DoS]
- **Issue:** `isBinaryFile()` in `src/repository/filter.ts:69-86` reads entire file into memory: `const buffer = await readFile(filePath)`. No size limit check before read.
- **Files:** `src/repository/filter.ts`
- **Risk:** Malicious or accidental large files (>10MB limit checked AFTER read) cause memory pressure.
- **Current mitigation:** `FileFilter.analyzeFile()` checks size via `stat` first (line 239), but `isBinaryFile` called directly bypasses this.
- **Recommendations:** Add size check at start of `isBinaryFile`; use streaming read for binary detection.

### [Symlink Resolution - TOCTOU Race]
- **Issue:** `resolveSymlinkSafely()` in `src/repository/filter.ts:185-200` checks `relativePath.startsWith('..')` after `resolve()`, but symlink target could change between stat and read
- **Files:** `src/repository/filter.ts`
- **Risk:** Symlink swapped to point outside repo after check but before file read.
- **Recommendations:** Use `fs.open` with `O_NOFOLLOW` flag where available; accept risk for local-only tool.

## Performance Bottlenecks

### [Git Diff - Per-File Blob Reads]
- **Issue:** `getDiff()` in `src/repository/git.ts:181-246` calls `git.readBlob()` for each file individually in `walk()` map callback. For repos with 1000+ changed files, this is 1000+ round trips to git object database.
- **Files:** `src/repository/git.ts`
- **Impact:** Diff generation scales O(n) with file count. Large PRs (500+ files) will be slow.
- **Improvement path:** Batch blob reads; use `git.listTree()` to get all blobs then read in parallel with `p-limit`.

### [Cache Store - Directory Size Calculation on Init]
- **Issue:** `initialize()` in `src/cache/store.ts:45-51` calls `calculateDirectorySize()` which recursively walks entire cache tree on every startup
- **Files:** `src/cache/store.ts`
- **Impact:** Startup latency proportional to cache size. 500MB cache = slow startup.
- **Improvement path:** Store current size in metadata file; update incrementally on write/delete.

### [Ignore Pattern Matching - No Caching]
- **Issue:** `createIgnoreMatcher()` in `src/repository/ignore.ts:58-72` creates new `ignore()` instance per call. `loadIgnorePatterns()` called per workspace/repo but patterns not cached across invocations.
- **Files:** `src/repository/ignore.ts`, `src/repository/filter.ts:309-313`
- **Impact:** Repeated `.gitignore` parsing for each file check in large repos.
- **Improvement path:** Memoize matcher per repo root; reuse across `FileFilter` instances.

## Fragile Areas

### [Scope Resolution - Working Tree vs Index Comparison]
- **Issue:** `getWorkingDiff()` in `src/repository/git.ts:525-586` compares working tree to HEAD (approximation) instead of index. Comment at line 557: "For staged files, we need to read from index... We'll use HEAD as approximation for now"
- **Files:** `src/repository/git.ts`
- **Why fragile:** Staged + unstaged changes to same file produce incorrect diff (shows HEAD→working instead of index→working).
- **Safe modification:** Implement proper index reading via `git.readBlob({ filepath, oid: indexEntry.oid })` when isomorphic-git supports index access.

### [Monorepo Detection - Priority Order Assumptions]
- **Issue:** `detectMonorepo()` in `src/repository/monorepo.ts:25-51` assumes priority: pnpm → npm/yarn → turbo → nx. A repo with both `pnpm-workspace.yaml` AND `turbo.json` uses pnpm config even if Turborepo is primary.
- **Files:** `src/repository/monorepo.ts`
- **Why fragile:** Workspace detection may not match developer intent.
- **Safe modification:** Allow config override in `octate.yaml` to force monorepo type.

### [Config Merger - Deep Merge Array Replacement]
- **Issue:** `deepMerge()` in `src/config/merger.ts:75-97` replaces arrays entirely (line 82: `!Array.isArray(value)`). `config.ignore: ["a"]` + CLI `config.ignore: ["b"]` = `["b"]` not `["a", "b"]`.
- **Files:** `src/config/merger.ts`
- **Why fragile:** User expects additive merge for arrays (ignore patterns, rules).
- **Safe modification:** Add array merge strategy option; concatenate for `ignore`, `rules`, `boundaries`.

### [Error Handling - Error Code Mapping Incomplete]
- **Issue:** `errorCodes` in `src/errors/index.ts:5-19` maps categories to exit codes but `GitError` and `RepositoryError` both use code 3. No distinction between "not a git repo" vs "git command failed".
- **Files:** `src/errors/index.ts`
- **Why fragile:** Automation (CI/CD) cannot distinguish error types from exit code alone.
- **Safe modification:** Add sub-codes or use distinct exit codes per error class.

## Scaling Limits

### [Cache Store - Single Directory Sharding]
- **Issue:** `keyToFilePath()` in `src/cache/store.ts:287-291` uses 2-char prefix (256 directories). At millions of entries, directories become large.
- **Files:** `src/cache/store.ts`
- **Current capacity:** ~10K entries per directory before filesystem performance degrades.
- **Limit:** ~2.5M entries before rebalancing needed.
- **Scaling path:** Increase prefix length to 3-4 chars; add directory rebalancing on growth.

### [File Filter - Synchronous Ignore Check Only]
- **Issue:** `FileFilter.createFilter()` in `src/repository/filter.ts:289-291` returns sync function using only ignore patterns. Binary/generated/size checks are async and not in filter.
- **Files:** `src/repository/filter.ts`
- **Limit:** `fast-glob` + filter can process 100K files but full `analyzeFile()` is O(n) async per file.
- **Scaling path:** Parallelize `analyzeFile()` with `p-limit`; add pre-filter by extension.

## Dependencies at Risk

### [@microsoft/sarif - "latest" Version Pin]
- **Issue:** `package.json:23` uses `"@microsoft/sarif": "latest"` - non-deterministic, could break on minor/patch
- **Impact:** SARIF output may break silently on dependency update.
- **Migration plan:** Pin to specific version (e.g., `^2.1.0`); test SARIF output after updates.

### [@types/react, @types/jest - "latest" Version Pin]
- **Issue:** `package.json:41,40` use `"latest"` for type definitions
- **Impact:** TypeScript compilation may break on type definition updates.
- **Migration plan:** Pin to versions matching `react` and `jest` versions.

### [isomorphic-git - Pure JS Performance]
- **Issue:** `isomorphic-git` is pure JavaScript. Large repos (Linux kernel scale) will be significantly slower than native `git` binary.
- **Impact:** Diff generation, log, status operations CPU-bound and slow.
- **Migration path:** Consider `simple-git` (spawns native git) as fallback for large repos; keep isomorphic-git for portability.

## Missing Critical Features

### [No Tree-sitter Integration]
- **Problem:** Parsing dependencies installed but no parser initialization, language detection, or AST traversal code exists.
- **Blocks:** Context Engine (Phase 3), semantic analysis, symbol extraction, call graph.

### [No SARIF Builder Integration]
- **Issue:** `node-sarif-builder` and `@microsoft/sarif` installed but `convertToSarif()` in `src/commands/review.ts:276-307` builds SARIF manually without SDK.
- **Blocks:** Proper SARIF v2.1.0 compliance; IDE integration (VS Code, GitHub Code Scanning).

### [No Interactive TUI]
- **Issue:** `--no-tui` flag exists in `review.ts:35` but TUI implementation missing. `Ink` and `React` in deps but no `src/tui/` directory.
- **Blocks:** Interactive review mode (core UX differentiator).

### [No Configuration Validation for Rules/Architecture]
- **Issue:** `ArchitectureConfigSchema` in `src/config/schema.ts:13-16` defines `boundaries` and `forbiddenDependencies` but no code consumes them.
- **Blocks:** Architecture enforcement reviews.

## Test Coverage Gaps

### [Commands - Critically Low Coverage]
- **Untested area:** `src/commands/review.ts` (3.7% statements), `src/commands/init.ts` (14.3%), `src/commands/doctor.ts` (4.1%), `src/commands/index.ts` (0%)
- **Files:** `src/commands/*.ts`
- **Risk:** CLI command logic (scope validation, output formatting, error handling) untested.
- **Priority:** High - commands are primary user interface.

### [PromisePool.iterate() - Zero Coverage]
- **Untested area:** `iterate()` method in `src/cache/pool.ts:61-100` (lines 62-98 uncovered)
- **Files:** `src/cache/pool.ts`
- **Risk:** Broken implementation (see Known Bugs) ships untested.
- **Priority:** High - either test thoroughly or remove.

### [Subprocess - Timeout and Signal Paths]
- **Untested area:** `src/cancellation/subprocess.ts` lines 92-93, 161-164, 171, 184-213 (70% coverage)
- **Files:** `src/cancellation/subprocess.ts`
- **Risk:** Process killing, timeout, Windows taskkill paths untested.
- **Priority:** Medium - used for future git command execution.

### [Repository Discovery - Monorepo Workspace Loading]
- **Untested area:** `src/repository/discovery.ts` lines 102-132, 149 (62.5% coverage)
- **Files:** `src/repository/discovery.ts`
- **Risk:** Workspace detection, package.json name extraction, error handling untested.
- **Priority:** Medium - affects multi-package repos.

### [Git Operations - Error Paths and Edge Cases]
- **Untested area:** `src/repository/git.ts` lines 56-63, 82, 123, 141, 227, 240, 250, 421, 449, 493-505, 515, 558-574, 584, 602, 606 (84.7% coverage but key error paths missing)
- **Files:** `src/repository/git.ts`
- **Risk:** Binary file handling, missing refs, permission errors, worktree edge cases.
- **Priority:** High - core Git operations.

---

*Concerns audit: 2026-09-08*
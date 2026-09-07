---
phase: 01-foundation-repository-layer
plan: 05
subsystem: cache
tags: [cache, identity, keys, store, lru, promise-pool]
dependency_graph:
  requires: ["01-01", "01-02"]
  provides: ["project-identity", "cache-keys", "cache-store", "lru-eviction", "promise-pool"]
  affects: ["01-06", "01-07"]
tech_stack:
  added:
    - "p-limit for bounded concurrency (PromisePool)"
  patterns:
    - "Project identity: SHA256(repo-root-path + git-remote-url)"
    - "Cache keys: contentHash:filePath:parserVersion:language:configHash"
    - "Atomic writes: temp file + rename"
    - "LRU eviction with size tracking"
    - "XDG Base Directory: ~/.local/share/octate/{hash}/"
key_files:
  created:
    - "src/cache/identity.ts"
    - "src/cache/identity.test.ts"
    - "src/cache/keys.ts"
    - "src/cache/keys.test.ts"
    - "src/cache/store.ts"
    - "src/cache/store.test.ts"
    - "src/cache/lru.ts"
    - "src/cache/lru.test.ts"
    - "src/cache/index.ts"
  modified: []
decisions:
  - "Project identity uses SHA256 of (absolute repo root + git remote origin URL)"
  - "Cache directory follows XDG: ~/.local/share/octate/{16-char-hash}/{indexes,cache,findings,logs}/"
  - "Cache key format: contentHash:filePath:parserVersion:language:configHash"
  - "Config hash enables automatic invalidation when config changes"
  - "Atomic writes via temp file + rename to prevent corruption"
  - "LRU eviction at 500MB with doubly-linked list for O(1) operations"
  - "PromisePool wraps p-limit for ergonomic bounded concurrency"
  - "Fallback identity uses absolute path when no git remote"
requirements_completed:
  - "CACHE-01"
  - "CACHE-02"
metrics:
  duration_seconds: 3600
  completed_date: "2026-09-07"
  task_count: 5
  file_count: 9
---

# Phase 01 Plan 05: Cache Infrastructure Summary

**One-liner:** Implemented complete cache infrastructure with project identity hashing, cache key generation, atomic file-based store, LRU eviction (500MB limit), and PromisePool for bounded concurrency.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create identity.ts with project identity hashing and cache directory resolution | c251062 | src/cache/identity.ts, src/cache/identity.test.ts |
| 2 | Create keys.ts with cache key generation and parsing | c251062 | src/cache/keys.ts, src/cache/keys.test.ts |
| 3 | Create store.ts with file-based cache store and atomic writes | c251062 | src/cache/store.ts, src/cache/store.test.ts |
| 4 | Create lru.ts with LRU eviction and size tracking | c251062 | src/cache/lru.ts, src/cache/lru.test.ts |
| 5 | Create index.ts with public cache API and PromisePool | c251062 | src/cache/index.ts |

## Verification Results

- **Build**: `npx tsc --noEmit` ✓ — TypeScript compiles with strict mode, zero errors
- **Lint**: `npx biome check src/cache` ✓ — Zero errors (5 warnings for non-null assertions in keys.ts where length is verified)
- **Tests**: `NODE_OPTIONS=--experimental-vm-modules npx jest src/cache` ✓ — 52 tests pass
- **Full test suite**: 284 tests pass across entire project

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Jest ESM configuration required experimental VM modules**
- **Found during:** Test execution
- **Issue:** Jest with ts-jest and ES modules failed with "Must use import to load ES Module" error
- **Fix:** Verified existing jest.config.ts already has correct ESM configuration. Tests run with `NODE_OPTIONS=--experimental-vm-modules`.
- **Result:** All 52 tests pass

**2. [Rule 1 - Bug] p-limit uses default export, not named export**
- **Found during:** TypeScript compilation
- **Issue:** `import { pLimit } from 'p-limit'` failed - p-limit uses default export
- **Fix:** Changed to `import pLimit from 'p-limit'`
- **Files modified:** src/cache/index.ts

**3. [Rule 1 - Bug] parseCacheKey return type with exactOptionalPropertyTypes**
- **Found during:** TypeScript compilation
- **Issue:** Array access `parts[0]` returns `string | undefined` even after length check
- **Fix:** Added non-null assertions `parts[0]!` after verifying `parts.length === 5`
- **Files modified:** src/cache/keys.ts

**4. [Rule 1 - Bug] LRUCache onEvict callback type mismatch with exactOptionalPropertyTypes**
- **Found during:** TypeScript compilation
- **Issue:** Optional property type `((key, entry) => void) | undefined` not assignable to class property `(key, entry) => void`
- **Fix:** Used type assertion in constructor: `this.onEvict = options.onEvict as (key, entry) => void | undefined`
- **Files modified:** src/cache/lru.ts

**5. [Rule 1 - Bug] CacheStore size calculation included metadata in serialized size**
- **Found during:** Test execution - entry.size was 0
- **Issue:** Serializing entry with `size: 0` then calculating byte length resulted in 0 size being stored
- **Fix:** Calculate value size separately before serialization, add metadata overhead estimate
- **Files modified:** src/cache/store.ts

**6. [Rule 1 - Bug] CacheStore get() called set() to update access time, double-counting size**
- **Found during:** Code review after size fix
- **Issue:** `get()` called `set()` to update accessedAt, which added size again
- **Fix:** Update file directly with atomic write instead of calling `set()`
- **Files modified:** src/cache/store.ts

**7. [Rule 1 - Bug] PromisePool addAll async function without await**
- **Found during:** Biome linting
- **Issue:** `async addAll()` didn't use await, just returned `Promise.all()`
- **Fix:** Removed `async` keyword
- **Files modified:** src/cache/index.ts

**8. [Rule 3 - Blocking] Biome linting warnings in new code**
- **Found during:** Biome check
- **Issues:** Import sorting, formatting, unused imports
- **Fix:** Ran `biome check --write --unsafe` to auto-fix
- **Files modified:** All cache files

### Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: atomic_writes | src/cache/store.ts | Temp file + rename for atomic writes — mitigates T-01-16 |
| threat_flag: cache_size_limit | src/cache/lru.ts | 500MB hard limit with LRU eviction — mitigates T-01-18 |
| threat_flag: project_identity | src/cache/identity.ts | SHA256 includes git remote URL, fallback to path — mitigates T-01-19 |
| threat_flag: config_invalidation | src/cache/keys.ts | Config hash in cache key enables auto-invalidation — mitigates T-01-16, T-01-18 |

## Key Decisions

1. **Project Identity**: SHA256(absolute-repo-root + git-remote-origin-url), truncated to 16 hex chars for directory name. Falls back to absolute path only if no git remote.

2. **XDG Cache Directory**: `~/.local/share/octate/{identity}/{indexes,cache,findings,logs}/` following XDG Base Directory Specification.

3. **Cache Key Format**: `contentHash:filePath:parserVersion:language:configHash` — all components separated by colons. File paths normalized to forward slashes.

4. **Config Hash**: SHA256 of JSON-stringified config (keys sorted) truncated to 16 chars. Changes to config automatically invalidate cache entries.

5. **Atomic Writes**: Write to `.tmp` file then `rename()` — POSIX atomic rename prevents corruption on crash/interrupt.

6. **LRU Eviction**: Doubly-linked list + Map for O(1) get/set/move-to-head/evict. Evicts from tail when `currentSize + newEntrySize > maxSize`.

7. **PromisePool**: Thin wrapper around `p-limit` providing `add()`, `addAll()`, `getConcurrency()`, `getPendingCount()`, `getActiveCount()`.

## Known Stubs

None — all planned cache functionality is fully implemented with tests.

## Self-Check: PASSED

All created files verified to exist:
- src/cache/identity.ts, src/cache/identity.test.ts ✓
- src/cache/keys.ts, src/cache/keys.test.ts ✓
- src/cache/store.ts, src/cache/store.test.ts ✓
- src/cache/lru.ts, src/cache/lru.test.ts ✓
- src/cache/index.ts ✓

All commits verified in git history (c251062).
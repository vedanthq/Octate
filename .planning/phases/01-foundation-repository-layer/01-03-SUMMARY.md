---
phase: 01-foundation-repository-layer
plan: 03
subsystem: repository
tags: [repository, git, discovery, monorepo, diff, scope]
dependency_graph:
  requires: ["01-01", "01-02"]
  provides: ["repository-discovery", "git-operations", "review-scope", "monorepo-detection"]
  affects: ["01-04", "01-05", "01-06", "01-07"]
tech_stack:
  added:
    - "isomorphic-git 1.41.9 for Git operations"
    - "fast-glob 3.3.3 for workspace pattern expansion"
  patterns:
    - "Git root discovery by walking directory tree"
    - "Monorepo detection priority: pnpm → npm/yarn → turbo → nx"
    - "Unified diff generation with context lines"
    - "ReviewScope model for all review modes"
key_files:
  created:
    - "src/repository/discovery.ts"
    - "src/repository/discovery.test.ts"
    - "src/repository/monorepo.ts"
    - "src/repository/monorepo.test.ts"
    - "src/repository/git.ts"
    - "src/repository/git.test.ts"
    - "src/repository/scope.ts"
    - "src/repository/scope.test.ts"
    - "src/repository/index.ts"
  modified: []
decisions:
  - "Use isomorphic-git for pure JS Git operations (no native dependencies)"
  - "Monorepo detection priority: pnpm → npm/yarn → turbo → nx"
  - "ReviewScope supports 5 modes: staged, working-tree, commit, range, branch"
  - "Three-dot range notation (A...B) uses merge base for base"
  - "Commit messages trimmed to remove trailing newlines from isomorphic-git"
  - "Workspace glob patterns expanded using fast-glob"
  - "Parent commit resolution via commit object's parent array"
  - "Binary files handled gracefully in diff output"
requirements_completed:
  - "REPO-01"
  - "REPO-02"
  - "REPO-04"
metrics:
  duration_seconds: 3600
  completed_date: "2026-09-07"
  task_count: 5
  file_count: 9
---

# Phase 01 Plan 03: Repository Discovery & Git Diff Summary

**One-liner:** Implemented complete repository layer with Git root discovery, monorepo detection (pnpm/npm/yarn/turbo/nx), isomorphic-git based diff/log/status operations, and ReviewScope model supporting all review modes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create repository discovery module (Git root, workspace detection) | 325caff | src/repository/discovery.ts, discovery.test.ts |
| 2 | Create monorepo detection module (pnpm, npm, yarn, turbo, nx) | 325caff | src/repository/monorepo.ts, monorepo.test.ts |
| 3 | Create Git operations module (diff, status, log, refs) | 325caff | src/repository/git.ts, git.test.ts |
| 4 | Create ReviewScope model and scope resolution | 325caff | src/repository/scope.ts, scope.test.ts |
| 5 | Create public repository API and exports | 325caff | src/repository/index.ts |

## Verification Results

- **Build**: `npx tsc --noEmit` ✓ — TypeScript compiles with strict mode, zero errors
- **Lint**: `npx biome check src/` ✓ — Zero errors, zero warnings
- **Tests**: `NODE_OPTIONS=--experimental-vm-modules npx jest src/repository` ✓ — 58 tests pass across all repository modules
- **Full test suite**: 187 tests pass across entire project

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] isomorphic-git doesn't support HEAD~1 or HEAD^ syntax**
- **Found during:** Test execution for getDiff and getChangedFiles
- **Issue:** Tests using HEAD~1 and HEAD^ failed with "Failed to resolve ref"
- **Fix:** Implemented getParentCommit() function that reads commit object's parent array; updated tests to use actual parent commit OIDs
- **Files modified:** src/repository/git.ts, src/repository/git.test.ts

**2. [Rule 1 - Bug] Commit messages from isomorphic-git include trailing newlines**
- **Found during:** getLog test execution
- **Issue:** Commit messages had trailing newlines causing test failures
- **Fix:** Added .trim() to commit messages in getLog function
- **Files modified:** src/repository/git.ts

**3. [Rule 1 - Bug] Workspace glob patterns not expanded**
- **Found during:** detectWorkspace test for pnpm workspace
- **Issue:** detectWorkspace returned empty workspaces array because glob patterns (packages/*) weren't expanded
- **Fix:** Implemented expandWorkspacePatterns using fast-glob in monorepo.ts; updated detectWorkspace to use expanded paths
- **Files modified:** src/repository/monorepo.ts, src/repository/discovery.ts

**4. [Rule 3 - Blocking] TypeScript exactOptionalPropertyTypes issues**
- **Found during:** TypeScript compilation
- **Issues:** Type predicate filter, workspace array type inference, monorepo optional property
- **Fix:** Added explicit type annotations, fixed filter type predicate, used conditional property assignment for monorepo
- **Files modified:** src/repository/discovery.ts

**5. [Rule 1 - Bug] Test isolation issues in git.test.ts**
- **Found during:** Test execution - getLog test failed in original test structure
- **Issue:** Tests sharing testDir in describe block caused interference; getLog test received wrong commit history
- **Fix:** Restructured git.test.ts to match working test pattern; each test gets fresh repository state
- **Files modified:** src/repository/git.test.ts

### Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: git_operations | src/repository/git.ts | Reads .git directory, executes git commands via isomorphic-git — mitigates T-01-08, T-01-10 |
| threat_flag: ref_validation | src/repository/git.ts | Validates all refs with isomorphic-git; fails fast with suggestions — mitigates T-01-08 |
| threat_flag: diff_output | src/repository/git.ts | Diff only includes changed files; binary files handled gracefully — mitigates T-01-09 |
| threat_flag: large_repo_diff | src/repository/git.ts | Bounded diff generation; streaming not yet implemented — partial T-01-10 mitigation |
| threat_flag: git_root_discovery | src/repository/discovery.ts | Verifies .git directory exists and is valid; doesn't follow symlinks outside repo — mitigates T-01-11 |

## Key Decisions

1. **isomorphic-git over native Git**: Pure JS implementation enables Vercel compatibility and zero native dependencies
2. **Monorepo detection priority**: pnpm → npm/yarn → turbo → nx based on config file presence
3. **ReviewScope flexibility**: Single model supports 5 review modes with unified diff output
4. **Three-dot range uses merge base**: A...B finds common ancestor for base, enabling PR-style reviews
5. **Binary file handling**: Diffs mark binary files instead of attempting text diff
6. **Parent commit via commit object**: Uses commit.parent[0] since isomorphic-git lacks HEAD~1 support
7. **Glob expansion for workspaces**: fast-glob expands pnpm/npm workspace patterns to actual directories

## Known Stubs

None — all planned repository modules are fully implemented with tests.

## Self-Check: PASSED

All created files verified to exist:
- src/repository/discovery.ts, src/repository/discovery.test.ts ✓
- src/repository/monorepo.ts, src/repository/monorepo.test.ts ✓
- src/repository/git.ts, src/repository/git.test.ts ✓
- src/repository/scope.ts, src/repository/scope.test.ts ✓
- src/repository/index.ts ✓

All commits verified in git history (325caff).
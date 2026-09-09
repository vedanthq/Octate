# Phase 2: Analysis Layer - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning

## Phase Boundary

Changed files are parsed for symbols and deterministic diagnostics are collected for AI consumption. This phase builds on Phase 1's repository layer (file access, Git diff, caching) to extract structural information from code and run static analysis tools.

## Implementation Decisions

### Tree-sitter Integration
- **D-01:** Use WASM bindings (web-tree-sitter) for cross-platform compatibility — no native compilation needed
- **D-02:** Eager loading of all supported grammars (TypeScript, JavaScript, Python) at startup — faster parsing for multi-language files
- **D-03:** Graceful degradation for parse errors or unsupported files — skip silently, log warnings, continue with other files

### Symbol Extraction Schema
- **D-04:** Content-based hash for symbol IDs: SHA256(filePath + symbolName + symbolKind) — stable across runs, works with incremental parsing
- **D-05:** Extract all exported symbols from changed files — balances completeness with performance
- **D-06:** Direct parent reference for nested symbols — each symbol stores parentID pointing to containing class/function

### Static Analysis Orchestration
- **D-07:** Hybrid tool detection with fallbacks — check for tsconfig.json, ruff.toml, pyproject.toml, biome.json first, fallback to defaults if missing
- **D-08:** Spawn subprocesses for analysis tools (tsc, ruff, biome) — isolated, respects tool versions, proper exit codes
- **D-09:** Parallel execution with concurrency limit using p-limit (already in cache layer) — faster for multi-file reviews

### Diagnostics Structuring
- **D-10:** Standardized severity mapping — tool errors → critical, warnings → high/medium, info → low/info
- **D-11:** Unified diagnostic schema: {file, line, column, endLine, endColumn, severity, message, source, rule}
- **D-12:** Graceful degradation for tool failures — log warning, skip failed tool, continue with others

### OpenCode's Discretion
- Tree-sitter query patterns for symbol extraction
- Diagnostic deduplication across tools
- Cache invalidation strategies for parsed results
- Exact subprocess spawn options and error handling patterns

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/PROJECT.md` — Core value, constraints, key decisions, active requirements
- `.planning/REQUIREMENTS.md` — PARSE-01, PARSE-02, ANAL-01, ANAL-02 requirements
- `.planning/ROADMAP.md` §Phase 2 — Goal, 6 success criteria, requirements mapping
- `.planning/STATE.md` — Project reference, current position, risks

### Research
- `.planning/research/STACK.md` — Tree-sitter 0.25.1, tree-sitter-typescript 0.23.2, tree-sitter-python 0.25.0
- `.planning/research/ARCHITECTURE.md` — Layered architecture, Analysis Layer responsibilities
- `.planning/research/PITFALLS.md` — Pitfall 1 (tree-sitter WASM memory), Pitfall 2 (tool detection), Pitfall 3 (diagnostic normalization)

### External Specifications
- `https://github.com/tree-sitter/tree-sitter` — Core parsing library, WASM bindings
- `https://github.com/tree-sitter/tree-sitter-typescript` — TypeScript/TSX grammar
- `https://github.com/tree-sitter/tree-sitter-python` — Python grammar
- `https://biomejs.dev` — Biome linter/formatter API
- `https://docs.astral.sh/ruff` — Ruff Python linter CLI interface

## Existing Code Insights

### Reusable Assets
- `src/cache/pool.ts` — Promise pool for bounded concurrency (can reuse for parallel tool execution)
- `src/cache/keys.ts` — Cache key generation with content hashing (extend for parsed results)
- `src/cancellation/subprocess.ts` — spawnWithSignal for subprocess execution with AbortController
- `src/errors/index.ts` — ParseError, AnalysisError classes for error handling
- `src/types/index.ts` — FileChange, ReviewScope types (extend for diagnostics)

### Established Patterns
- ES modules only with `.js` extensions in imports
- Pino child loggers with module binding for traceability
- Zod schemas for all external input validation
- Co-located tests with `*.test.ts` suffix
- Barrel exports via `index.ts` in each directory

### Integration Points
- `src/repository/filter.ts` → Analysis Layer: provides filtered file list for parsing
- `src/repository/git.ts` → Analysis Layer: provides diff with changed lines
- `src/cache/store.ts` → Analysis Layer: stores parsed results with content-hash keys
- `src/model/types.ts` → Analysis Layer: consumes Diagnostics[] in ModelRequest

## Specific Ideas

- Tree-sitter WASM should be initialized once and reused across all file parses
- Consider tree-sitter's incremental parsing for large files (re-parse only changed sections)
- Static analysis tools should respect repository's existing configuration (tsconfig.json paths, ruff.toml excludes)
- Diagnostic output should include code snippets for context (first 3 lines of error location)

## Deferred Ideas

- Custom tree-sitter queries for language-specific patterns (e.g., React hooks, Python decorators)
- Architecture boundary detection via static analysis
- Test coverage integration (pytest --cov, jest --coverage)
- Performance profiling of analysis pipeline

---

*Phase: 02-analysis-layer*
*Context gathered: 2026-09-09*

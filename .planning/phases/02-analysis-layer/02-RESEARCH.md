# Phase 2: Analysis Layer — Technical Research

**Researched:** 2026-09-09
**Phase:** 02-analysis-layer
**Scope:** Tree-sitter parsing, symbol extraction, static analysis orchestration, diagnostics structuring

---

## Standard Stack (Phase 2 Specific)

### Tree-sitter WASM Integration

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| web-tree-sitter | Latest | WASM-based parsing | Cross-platform, no native compilation (per D-01) |
| tree-sitter-typescript | 0.23.2 | TypeScript/TSX grammar | Peer dependency on tree-sitter ^0.21.0 |
| tree-sitter-python | 0.25.0 | Python grammar | Official Python grammar |
| tree-sitter-javascript | Latest | JavaScript grammar | Separate from TS grammar |

**Key constraint:** Language grammars are maintained in separate repos. WASM bindings avoid native compilation issues. Grammar initialization must happen once and be reused (per D-02).

### Static Analysis Tools

| Tool | Language | Config Detection | Output Format |
|------|----------|-----------------|---------------|
| TypeScript compiler (tsc) | TS/JS | tsconfig.json | JSON diagnostics |
| Biome | TS/JS | biome.json | JSON diagnostics |
| Ruff | Python | ruff.toml, pyproject.toml | JSON diagnostics |
| mypy/pyright | Python | pyproject.toml, mypy.ini | JSON diagnostics |
| bandit | Python | .bandit, pyproject.toml | JSON diagnostics |
| pytest | Python | pytest.ini, pyproject.toml | Test discovery results |

**Key constraint:** Hybrid tool detection with fallbacks (per D-07). Respect repository's existing configuration.

---

## Architecture Patterns (Phase 2 Specific)

### Pattern: Tree-sitter WASM Initialization

```typescript
// Single parser instance, reused across all file parses
import Parser from 'web-tree-sitter';

// Eager loading of all supported grammars (per D-02)
const parser = new Parser();
const TypeScript = await Parser.Language.load('tree-sitter-typescript.wasm');
const Python = await Parser.Language.load('tree-sitter-python.wasm');
const JavaScript = await Parser.Language.load('tree-sitter-javascript.wasm');

parser.setLanguage(TypeScript); // Set per-file based on extension
```

**Critical:** WASM parsers allocate linear memory. Create Parser per review scope; dispose after. Call `tree.delete()` on completed trees. (Pitfall 11: Tree-sitter WASM Memory Leaks)

### Pattern: Symbol Extraction with Stable IDs

```typescript
// Content-based hash for symbol IDs (per D-04)
import { createHash } from 'crypto';

function symbolId(filePath: string, name: string, kind: string): string {
  return createHash('sha256')
    .update(`${filePath}${name}${kind}`)
    .digest('hex');
}

// Extract all exported symbols from changed files (per D-05)
// Direct parent reference for nested symbols (per D-06)
interface Symbol {
  id: string;           // SHA256(filePath + name + kind)
  name: string;
  kind: 'function' | 'method' | 'class' | 'interface' | 'type' | 'constant' | 'variable' | 'module' | 'export' | 'import';
  language: string;
  file: string;
  range: { startLine: number; endLine: number; startColumn: number; endColumn: number };
  parentID?: string;    // Direct parent reference (per D-06)
  exported: boolean;
  references: string[];
}
```

### Pattern: Static Analysis Orchestration

```typescript
// Parallel execution with concurrency limit (per D-09)
import pLimit from 'p-limit';

const limit = pLimit(4); // Concurrency limit

// Spawn subprocesses for analysis tools (per D-08)
async function runAnalysis(file: string, signal: AbortSignal): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  // Check for tool config files (per D-07)
  if (await fileExists('tsconfig.json')) {
    const tscResults = await limit(() => runTsc(file, signal));
    diagnostics.push(...tscResults);
  }

  if (await fileExists('biome.json')) {
    const biomeResults = await limit(() => runBiome(file, signal));
    diagnostics.push(...biomeResults);
  }

  return diagnostics;
}
```

### Pattern: Unified Diagnostic Schema

```typescript
// Standardized severity mapping (per D-10)
// Unified diagnostic schema (per D-11)
interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  source: string;  // 'tsc' | 'biome' | 'ruff' | 'mypy' | 'pyright' | 'bandit' | 'pytest'
  rule?: string;
}

// Graceful degradation for tool failures (per D-12)
// Log warning, skip failed tool, continue with others
```

---

## Pitfalls (Phase 2 Specific)

### Critical: Pitfall 2 — Skipping Deterministic Analysis Before AI
- **Risk:** Relying solely on LLM to find issues that static analysis already catches
- **Prevention:** Run TypeScript compiler, ESLint/Biome, ruff, mypy/pyright, bandit, pytest as FIRST step
- **Phase Mapping:** ANAL-01, ANAL-02

### Critical: Pitfall 11 — Tree-sitter WASM Memory Leaks
- **Risk:** WASM parsers allocate linear memory that isn't freed after parsing
- **Prevention:** Create Parser per review scope; dispose after; explicit `tree.delete()` on completed trees
- **Phase Mapping:** PARSE-01, CACHE-01

### Moderate: Pitfall 6 — Incremental Indexing Without Proper Cache Invalidation
- **Risk:** Symbol index becomes stale after file edits
- **Prevention:** Cache key: `hash(content) + filePath + parserVersion + language + configVersion`
- **Phase Mapping:** CACHE-01, PARSE-01, PARSE-02

### Moderate: Pitfall 14 — Binary/Generated Files Sent to Model
- **Risk:** Dist/bundle.js, generated/*.ts included in context
- **Prevention:** Detect binary files via `Buffer.isUtf8()`; heuristics for generated files
- **Phase Mapping:** REPO-03, ANAL-01

---

## Integration Points (Phase 2)

### Input from Phase 1 (Repository Layer)
- `src/repository/filter.ts` → provides filtered file list for parsing
- `src/repository/git.ts` → provides diff with changed lines
- `src/cache/store.ts` → stores parsed results with content-hash keys
- `src/cache/pool.ts` → Promise pool for bounded concurrency (reuse for parallel tool execution)
- `src/cache/keys.ts` → Cache key generation with content hashing (extend for parsed results)
- `src/cancellation/subprocess.ts` → spawnWithSignal for subprocess execution with AbortController

### Output to Phase 3 (Intelligence Layer)
- Parsed ASTs and symbols → for reference graph and dependency graph
- Diagnostics → for Context Engine ranking

### Output to Phase 4 (Model Provider)
- Diagnostics[] → consumed in ModelRequest

---

## Validation Architecture

### Dimension 1: Functional Completeness
- Tree-sitter parses TS/JS/Python files producing concrete syntax trees
- Symbols extracted with stable IDs, names, kinds, languages, file locations, ranges, parents, exported status, references
- Static analysis tools run and produce structured diagnostics
- Graceful degradation for parse errors and tool failures

### Dimension 2: Correctness
- Symbol IDs are content-based hashes (SHA256(filePath + name + kind))
- Diagnostics mapped to standardized severity levels
- Tool detection respects repository configuration

### Dimension 3: Error Handling
- Parse errors → skip file, log warning, continue
- Tool failures → log warning, skip tool, continue with others
- Unsupported files → skip silently

### Dimension 4: Integration
- Phase 2 consumes files from Phase 1 (filter.ts, git.ts)
- Phase 2 produces symbols and diagnostics for Phase 3 (Intelligence Layer)
- Phase 2 produces diagnostics for Phase 4 (Model Provider)

### Dimension 5: Performance
- Parallel file parsing with bounded concurrency
- Incremental parsing using cached results
- Content-hash-based cache keys for parsed results

### Dimension 6: Security
- No secrets in diagnostic output
- Tool subprocesses isolated with AbortController

### Dimension 7: Documentation
- Symbol schema documented
- Diagnostic schema documented
- Tool detection logic documented

### Dimension 8: Validation
- Tree-sitter parsing verified with snapshot tests
- Symbol extraction verified with known code samples
- Static analysis integration verified with test fixtures
- Diagnostics structured correctly for AI consumption

---

*Phase 2 research synthesized from global project research*

# Testing Patterns

**Analysis Date:** 2026-09-10

## Test Framework

**Runner:**
- Jest 30.5.1 with `ts-jest` 29.4.12 (ESM preset)
- Configuration: `jest.config.ts`
- Environment: Node.js with native ECMAScript modules enabled via `NODE_OPTIONS=--experimental-vm-modules`
- TypeScript Transform: `ts-jest` targeting `tsconfig.json` with `useESM: true`

**Assertion Library:**
- `@jest/globals` (`describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest`)

**Run Commands:**
```bash
pnpm test               # Run all 30 test suites (439 tests)
pnpm test:watch         # Run tests in watch mode
pnpm test -- path/to/file.test.ts  # Run single test file
pnpm test -- --coverage # Generate test coverage report
```

**Test Suite Health:**
- **30 test suites**, **439 tests**, 0 snapshots
- 100% passing rate across CLI, commands, repository, analysis, cache, config, logging, cancellation, and error layers

## Test File Organization

**Location:** Co-located next to the corresponding source module:
- `src/commands/review.ts` → `src/commands/review.test.ts`
- `src/analysis/orchestrator.ts` → `src/analysis/orchestrator.test.ts`
- `src/analysis/parser/index.ts` → `src/analysis/parser/index.test.ts`
- `src/analysis/symbols/index.ts` → `src/analysis/symbols/index.test.ts`
- `src/analysis/diagnostics/tools.ts` → `src/analysis/diagnostics/tools.test.ts`
- `src/cache/keys.ts` → `src/cache/keys.test.ts`

**Complete Test Suite Map:**
```
src/
├── analysis/
│   ├── orchestrator.test.ts      # Pipeline integration (parsing + diagnostics + metrics)
│   ├── parser/
│   │   ├── index.test.ts         # Tree-sitter parsing & AST creation
│   │   └── languages.test.ts     # Language detection by extension & grammar loading
│   ├── symbols/
│   │   └── index.test.ts         # AST query extraction for TS and Python
│   └── diagnostics/
│       ├── index.test.ts         # Parallel diagnostics execution with concurrency pool
│       ├── severity.test.ts      # Severity normalization & diagnostic mapping
│       └── tools.test.ts         # Tool detection & subprocess execution
├── cache/
│   ├── identity.test.ts          # Project identity & directory hashing
│   ├── keys.test.ts              # Cache key generation, tool versions, config hashes
│   ├── lru.test.ts               # In-memory LRU eviction & TTL
│   ├── pool.test.ts              # PromisePool concurrency limiting
│   └── store.test.ts             # Atomic file writes & cache storage
├── cancellation/
│   ├── controller.test.ts        # CancellationController signal propagation
│   └── subprocess.test.ts        # spawnWithSignal & process tree termination
├── commands/
│   ├── doctor.test.ts            # Doctor environment checks
│   ├── init.test.ts              # Init configuration generation
│   └── review.test.ts            # Review option validation & execution
├── config/
│   ├── loader.test.ts            # File resolution & cosmiconfig loading
│   ├── merger.test.ts            # Hierarchical config precedence
│   └── schema.test.ts            # Zod validation & defaults
├── errors/
│   └── index.test.ts             # Error classes, exit codes, & type guards
├── logging/
│   └── index.test.ts             # Structured logging, child loggers, & redaction
├── model/
│   └── abstraction.test.ts       # Model abstraction interface contracts
├── repository/
│   ├── discovery.test.ts         # Git root finding
│   ├── filter.test.ts            # File filtering (binary, generated, symlink)
│   ├── git.test.ts               # isomorphic-git wrapper operations
│   ├── ignore.test.ts            # .gitignore & .octateignore parsing
│   ├── monorepo.test.ts          # Monorepo detection across package managers
│   └── scope.test.ts             # Scope resolution (--staged, --commit, etc.)
└── types/
    └── index.test.ts             # Domain type guards
```

## Testing Patterns & Best Practices

### 1. Isolated Temporary Directories for Filesystem & Git Operations
Tests creating repository states or cache files must use isolated temporary directories created in `beforeEach` and cleaned up in `afterEach`:

```typescript
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';

describe('repository-or-cache-module', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `octate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(testDir, { recursive: true, force: true });
  });
});
```

### 2. Real Tree-sitter WASM Grammars in Tests
Parser tests load real WebAssembly grammars located in `test-wasm/`:

```typescript
import { Language, Parser } from 'web-tree-sitter';
import { resolve } from 'node:path';

let parser: Parser;
let tsLanguage: Language;

beforeAll(async () => {
  await Parser.init();
  const wasmPath = resolve(process.cwd(), 'test-wasm/tree-sitter-typescript.wasm');
  tsLanguage = await Language.load(wasmPath);
  parser = new Parser();
  parser.setLanguage(tsLanguage);
});
```

### 3. Graceful Degradation Testing for Subprocess Diagnostics
Tests explicitly verify that external tool failures (non-zero exit codes, tool missing, stderr outputs) degrade gracefully by logging a warning and returning empty results rather than throwing unhandled exceptions:

```typescript
it('handles tool failure gracefully without throwing', async () => {
  jest.spyOn(subprocess, 'spawnWithSignal').mockRejectedValueOnce(
    new subprocess.SubprocessError('Tool crashed', 1, '', 'Syntax error')
  );

  const diagnostics = await runDiagnostics(['file.ts'], repoRoot, ['tsc']);
  expect(diagnostics.get('tsc')).toEqual([]);
});
```

### 4. AbortSignal and Cancellation Propagation
Subprocesses and pipeline tasks are tested against `AbortSignal` cancellation:

```typescript
it('terminates subprocesses when signal is aborted', async () => {
  const controller = new CancellationController();
  const promise = orchestrator.analyze(files, { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toThrow();
});
```

### 5. Mocking Policy
- **What is mocked:**
  - Subprocess execution (`spawnWithSignal`, `which`) for linters not guaranteed to exist on CI/dev machines
  - External network calls (e.g., NVIDIA API connectivity check)
  - Time/delays in race-condition tests
- **What is NOT mocked:**
  - Tree-sitter AST parser (runs real WASM in tests)
  - File system operations (uses real temp directories in `tmpdir`)
  - Git operations (uses real local repositories created via `isomorphic-git.init`)
  - Zod schema validation (runs real schema parsing)

---

*Testing patterns analysis: 2026-09-10*
*Update when adding new test suites or testing conventions*
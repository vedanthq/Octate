# Testing Patterns

**Analysis Date:** 2026-09-11

## Test Framework

**Runner:**
- Jest 30.5.1 with `ts-jest` 29.4.12 (ESM preset)
- Configuration: `jest.config.ts`
- Environment: Node.js with native ECMAScript modules enabled via `NODE_OPTIONS=--experimental-vm-modules`
- TypeScript Transform: `ts-jest` targeting `tsconfig.json` with `useESM: true`

**Assertion Library:**
- `@jest/globals` (`describe`, `it`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `jest`)

**Run Commands:**
```bash
pnpm test                               # Run all 54 test suites (631 tests)
pnpm test:watch                         # Run tests in watch mode
NODE_OPTIONS=--experimental-vm-modules npx jest src/review/  # Run specific layer tests
pnpm test -- path/to/file.test.ts       # Run single test file
pnpm test -- --coverage                 # Generate test coverage report
```

**Test Suite Health:**
- **54 test suites**, **631 tests**, 0 snapshots
- 100% passing rate across CLI, commands, repository, analysis, intelligence, model provider, and review engine layers.

## Test File Organization

**Location:** Co-located next to the corresponding source module:
- `src/commands/review.ts` → `src/commands/review.test.ts`
- `src/intelligence/graph/reference.ts` → `src/intelligence/graph/reference.test.ts`
- `src/model/providers/nvidia.ts` → `src/model/providers/nvidia.test.ts`
- `src/review/engine.ts` → `src/review/engine.test.ts`

**Complete Test Suite Map (54 Suites):**
```
src/
├── analysis/
│   ├── orchestrator.test.ts          # Pipeline integration (parse → symbols → diagnostics)
│   ├── parser/
│   │   ├── index.test.ts             # Tree-sitter parsing & AST creation
│   │   └── languages.test.ts         # Language detection & grammar loading
│   ├── symbols/
│   │   └── index.test.ts             # AST query extraction for TS and Python
│   └── diagnostics/
│       ├── index.test.ts             # Parallel diagnostics execution with concurrency pool
│       ├── severity.test.ts          # Severity normalization & diagnostic mapping
│       └── tools.test.ts             # Tool detection & subprocess execution
├── cache/
│   ├── identity.test.ts              # Project identity & directory hashing
│   ├── keys.test.ts                  # Cache key generation, tool versions, config hashes
│   ├── lru.test.ts                   # In-memory LRU eviction & TTL
│   ├── pool.test.ts                  # PromisePool concurrency limiting
│   └── store.test.ts                 # Atomic file writes & cache storage
├── cancellation/
│   ├── controller.test.ts            # CancellationController signal propagation
│   └── subprocess.test.ts            # spawnWithSignal & process tree termination
├── commands/
│   ├── doctor.test.ts                # Doctor environment checks
│   ├── init.test.ts                  # Init configuration generation
│   └── review.test.ts                # Review command pipeline integration
├── config/
│   ├── loader.test.ts                # File resolution & cosmiconfig loading
│   ├── merger.test.ts                # Hierarchical config precedence
│   └── schema.test.ts                # Zod validation & defaults
├── errors/
│   └── index.test.ts                 # Error classes, exit codes, & type guards
├── intelligence/
│   ├── context/
│   │   ├── budget.test.ts            # Token budgeting calculations & limits
│   │   ├── candidates.test.ts        # Candidate ranking & selection algorithms
│   │   ├── engine.test.ts            # ContextEngine pipeline assembly
│   │   ├── serializer.test.ts        # Sandwich prompt serialization & demarcation
│   │   └── windowing.test.ts         # Context snippet extraction and windowing
│   ├── graph/
│   │   ├── dependency.test.ts        # Package & workspace dependency graph
│   │   ├── reference.test.ts         # Caller/callee graph & reverse incoming lookup
│   │   └── serializer.test.ts        # Graph disk serialization and loading
│   ├── index/
│   │   └── symbol-index.test.ts      # Multi-file symbol index & range queries
│   └── resolver/
│       └── path-resolver.test.ts     # Cross-file import path resolution
├── logging/
│   └── index.test.ts                 # Structured logging, child loggers, & redaction
├── model/
│   ├── abstraction.test.ts           # Model abstraction & provider factory
│   ├── prompts/
│   │   ├── loader.test.ts            # Prompt template file loader & fallback
│   │   └── template.test.ts          # Regex template rendering engine
│   ├── providers/
│   │   ├── nvidia.test.ts            # LocalNvidiaProvider chat completion calls
│   │   └── resilience.test.ts        # Timeout, exponential backoff, retries & pool(2)
│   └── schema/
│       ├── extractor.test.ts         # Markdown fence stripping & JSON extraction
│       ├── finding.test.ts           # Compiled Zod findings schema validation
│       ├── grounding.test.ts         # File existence & line bounds clamping
│       └── repair.test.ts            # 2-turn error repair prompt construction
├── repository/
│   ├── discovery.test.ts             # Git root finding
│   ├── filter.test.ts                # File filtering (binary, generated, symlink)
│   ├── git.test.ts                   # isomorphic-git wrapper operations
│   ├── ignore.test.ts                # .gitignore & .octateignore parsing
│   ├── monorepo.test.ts              # Monorepo detection across package managers
│   └── scope.test.ts                 # Scope resolution (--staged, --commit, etc.)
├── review/
│   ├── critic.test.ts                # Hard floor & two-stage critic filtering
│   ├── dag.test.ts                   # Staged Review DAG runner with graceful degradation
│   ├── dedup.test.ts                 # Multi-factor deduplication & evidence merging
│   ├── engine.test.ts                # ReviewEngine 5-stage orchestration
│   ├── heuristics.test.ts            # AST executable logic & security pattern triggers
│   └── ranking.test.ts               # Composite ranking & Critical protection
└── types/
    └── index.test.ts                 # Domain type guards
```

## Testing Patterns & Best Practices

### 1. Isolated Temporary Directories for Filesystem & Git Operations
Tests creating repository states or cache files must use isolated temporary directories created in `beforeEach` and cleaned up in `afterEach`:

```typescript
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

describe('isolated-fs-module', () => {
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

### 2. MockReviewModel for Review Layer & DAG Tests
The review engine uses `MockReviewModel` (`src/review/__tests__/mocks.ts`) allowing role-specific response handlers for structural, semantic, security, and critic stages:

```typescript
const model = new MockReviewModel();
model.setRoleHandler('structural', () => Promise.resolve({
  findings: [structuralFinding],
  usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
  model: 'mock-nemotron',
  latencyMs: 5,
  finishReason: 'stop',
}));
```

### 3. Graceful Degradation Testing
Tests explicitly verify that failures in individual reviewer stages (e.g., Semantic reviewer timeout or network error) degrade gracefully: surviving reviewer findings proceed to the Critic stage, and the failure is logged as a warning in `ReviewResult.metadata.warnings` rather than crashing the review process.

### 4. Real Tree-sitter WASM Grammars in Tests
Parser tests load real WebAssembly grammars located in `test-wasm/` (`tree-sitter-typescript.wasm`, `tree-sitter-python.wasm`) rather than mocking AST outputs.

### 5. Mocking Policy
- **What is mocked:**
  - NVIDIA API HTTP endpoints (via global `fetch` mocking or `MockReviewModel`)
  - Subprocess execution (`spawnWithSignal`, `which`) for linters not guaranteed to exist on CI/dev machines
  - Time/delays in race-condition tests
- **What is NOT mocked:**
  - Tree-sitter AST parser (runs real WASM in tests)
  - ReferenceGraph & DependencyGraph traversal
  - File system operations (uses real temp directories in `tmpdir`)
  - Git operations (uses real local repositories created via `isomorphic-git.init`)
  - Zod schema validation (runs real compiled schema validation)

---

*Testing patterns analysis: 2026-09-11*

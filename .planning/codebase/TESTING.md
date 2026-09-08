# Testing Patterns

**Analysis Date:** 2026-09-08

## Test Framework

**Runner:** Jest 30.5.1 with `ts-jest` 29.4.12 (ESM preset)
- Config: `jest.config.ts`
- Test environment: Node.js
- ESM support: experimental VM modules (`NODE_OPTIONS=--experimental-vm-modules`)
- Transform: `ts-jest` with project tsconfig.json

**Assertion Library:** `@jest/globals` (native Jest globals: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest`)

**Run Commands:**
```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test -- --coverage # With coverage
```

**Jest Configuration Highlights:**
- Roots: `<rootDir>/src`
- Test match: `**/*.test.ts`
- Module mapper: `^@/(.*)$` → `<rootDir>/src/$1`, `^(\.{1,2}/.*)\.js$` → `$1`
- Coverage: `src/**/*.ts`, excludes `*.test.ts` and `cli.ts`
- Verbose: true
- Extensions: `.ts`, `.js`, `.json`

## Test File Organization

**Location:** Co-located with source files
- `src/commands/review.ts` → `src/commands/review.test.ts`
- `src/config/merger.ts` → `src/config/merger.test.ts`
- `src/repository/discovery.ts` → `src/repository/discovery.test.ts`

**Naming:** `[name].test.ts` suffix

**Structure:**
```
src/
├── commands/
│   ├── review.ts
│   ├── review.test.ts
│   ├── init.ts
│   ├── init.test.ts
│   ├── doctor.ts
│   └── doctor.test.ts
├── config/
│   ├── schema.ts
│   ├── schema.test.ts
│   ├── loader.ts
│   ├── loader.test.ts
│   ├── merger.ts
│   └── merger.test.ts
├── repository/
│   ├── discovery.ts
│   ├── discovery.test.ts
│   ├── monorepo.ts
│   ├── monorepo.test.ts
│   └── ...
├── cancellation/
│   ├── controller.ts
│   ├── controller.test.ts
│   └── ...
├── cache/
│   ├── store.ts
│   ├── store.test.ts
│   └── ...
├── logging/
│   ├── index.ts
│   └── index.test.ts
├── errors/
│   ├── index.ts
│   └── index.test.ts
├── model/
│   ├── abstraction.ts
│   ├── abstraction.test.ts
│   └── ...
└── types/
    ├── index.ts
    └── index.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { createReviewCommand } from './review.js';

describe('commands:review', () => {
  let command: ReturnType<typeof createReviewCommand>;

  beforeEach(() => {
    command = createReviewCommand();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createReviewCommand', () => {
    it('creates command with correct name and description', () => {
      expect(command.name()).toBe('review');
      expect(command.description()).toBe('Run code review on the specified scope');
    });

    it('has all required options', () => {
      const options = command.options.map((o) => o.flags);
      expect(options).toContain('-s, --staged');
      expect(options).toContain('--sarif');
    });
  });

  describe('validateScope', () => {
    it('rejects when no scope specified', async () => { ... });
  });
});
```

**Naming Convention:**
- Top-level `describe`: module path (e.g., `'commands:review'`, `'config/merger'`, `'CancellationController'`)
- Nested `describe`: function or feature being tested
- `it` blocks: specific behavior in natural language

## Setup & Teardown

**Common Patterns:**

1. **Temporary directories for filesystem tests:**
```typescript
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

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
```

2. **Environment variable isolation:**
```typescript
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});
```

3. **Jest mock reset:**
```typescript
afterEach(() => {
  jest.resetAllMocks();
});
```

## Mocking

**Framework:** Jest built-in (`jest.fn()`, `jest.spyOn()`)

**Patterns:**

1. **Function mocks:**
```typescript
const listener = jest.fn();
controller.addEventListener('abort', listener);
controller.abort();
expect(listener).toHaveBeenCalledTimes(1);
```

2. **Module mocking (manual):**
```typescript
// Mocking fs/promises for isolated tests
const mockWriteFile = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  // ...
}));
```

3. **Type-only imports for mocking:**
```typescript
import type { CacheStore } from './store.js';
// Use in tests with partial implementations
```

**What to Mock:**
- External dependencies: filesystem (in unit tests), network calls, timers
- Time-dependent code: `jest.useFakeTimers()`
- Randomness: `jest.spyOn(Math, 'random').mockReturnValue(0.5)`

**What NOT to Mock:**
- Internal pure functions (test behavior, not implementation)
- TypeScript types (compile-time only)
- Simple data transformations

**Integration-style Tests (real filesystem):**
Many tests use real `node:fs/promises` with temp directories rather than mocking:
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';

it('finds .git directory from subdirectory', async () => {
  const subDir = path.join(testDir, 'src', 'lib');
  await fs.mkdir(subDir, { recursive: true });
  const result = await findGitRoot(subDir);
  expect(result).toBe(testDir);
});
```

## Fixtures and Factories

**Test Data Construction:**
- Inline object literals for simple cases
- Factory functions for complex repeated structures

```typescript
// In test file
const createMockConfig = (overrides: Partial<OctateConfig> = {}): OctateConfig => ({
  ...DefaultConfig,
  project: { name: 'test-project' },
  review: { severity: 'medium', maxFindings: 50 },
  ...overrides,
});

// In schema.test.ts - valid/invalid config fixtures
const validConfig = {
  version: '1.0.0',
  project: { name: 'test' },
  review: { severity: 'medium', maxFindings: 50 },
};

const invalidConfig = {
  version: '1.0',
  project: { name: '' },
};
```

**Shared fixtures:** Not yet extracted to separate fixture files (codebase is small)

## Coverage

**Requirements:** No enforced minimum threshold currently

**Collection:**
- From: `src/**/*.ts`
- Excludes: `src/**/*.test.ts`, `src/cli.ts`
- Directory: `coverage/`

**View Coverage:**
```bash
pnpm test -- --coverage
# Then open coverage/lcov-report/index.html
```

## Test Types

**Unit Tests:**
- Pure functions: `mergeConfigs`, `parseEnvConfig`, `toCamelCase`
- Type guards: `isRepository`, `isOctateError`
- Class methods: `CancellationController`, `CacheStore`
- No external dependencies, fast execution

**Integration Tests:**
- Filesystem operations: `findGitRoot`, `discoverRepository`, `CacheStore` with real FS
- Config loading: `loadProjectConfig`, `loadGlobalConfig`, `loadConfig`
- Command parsing: Commander.js command structure validation

**E2E Tests:** Not yet implemented (planned for Phase 6+)
- Full CLI invocation via `main()`
- Multi-command workflows

## Common Patterns

**Async Testing:**
```typescript
it('executes operation with cancellation signal', async () => {
  const result = await withCancellation(async (signal) => {
    expect(signal.aborted).toBe(false);
    return 'success';
  });
  expect(result).toBe('success');
});

it('propagates external signal', async () => {
  const controller = new AbortController();
  const promise = withCancellation(async (signal) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return 'done';
  }, controller.signal);

  controller.abort('external');
  await expect(promise).rejects.toThrow('external');
});
```

**Error Testing:**
```typescript
it('throws ConfigurationError for empty project name', () => {
  const invalid = { ...DefaultConfig, project: { name: '' } };
  expect(() => mergeConfigs(DefaultConfig, DefaultConfig, invalid, {}, {})).toThrow();
});

it('rejects with correct error type', async () => {
  await expect(loadConfig({ cliConfig: { review: { severity: 'invalid' } } }))
    .rejects.toThrow('Invalid octate.yaml');
});
```

**Type Testing (compile-time):**
```typescript
it('has correct LogLevel type', () => {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal', 'trace'];
  levels.forEach((level) => {
    const l: LogLevel = level; // Type check - compiles if correct
    expect(l).toBe(level);
  });
});
```

**Testing Private Functions:**
- Not directly tested (implementation detail)
- Tested via public API that exercises them
- Comment in test: `// We can't directly test the private function, but we can test via command parsing`

**Snapshot Testing:** Not currently used

**Parameterized Tests:** Not currently used (would use `test.each` or `it.each` if needed)

## Test Utilities

**Shared Test Helpers:** None extracted yet (patterns repeated inline)

**Recommended Additions:**
- `createTempDir()` helper for repeated temp directory setup
- `createMockRepository()` for consistent repo fixtures
- `expectValidConfig()` / `expectInvalidConfig()` matchers

## Running Tests in CI

**GitHub Actions / CI:**
```yaml
- name: Run tests
  run: pnpm test
- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

**Pre-commit (Husky):**
```bash
# .husky/pre-commit
pnpm lint && pnpm test
```

---

*Testing analysis: 2026-09-08*
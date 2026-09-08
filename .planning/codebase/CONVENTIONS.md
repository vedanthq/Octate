# Coding Conventions

**Analysis Date:** 2026-09-08

## Naming Patterns

**Files:**
- kebab-case for all source files: `review.ts`, `discovery.test.ts`, `cache/store.ts`
- Test files: `[name].test.ts` co-located with source
- Index barrels: `index.ts` for public exports

**Functions:**
- camelCase: `createReviewCommand`, `findGitRoot`, `loadConfig`
- Async functions: no special prefix, use `async` keyword
- Factory functions: `create*`, `make*` prefix: `createCancellationController`, `createCacheStore`

**Variables:**
- camelCase: `repoRoot`, `configPath`, `testDir`
- Constants: UPPER_SNAKE_CASE: `DEFAULT_CONFIG`, `TEST_DIR`
- Private/internal: underscore prefix occasionally used but not enforced

**Types/Interfaces:**
- PascalCase: `ReviewOptions`, `ModelRequest`, `CacheEntry`, `Repository`
- Type suffix optional: `ReviewScope` (no suffix), `ModelRequest` (Request suffix)
- Type guards: `is*` prefix: `isRepository`, `isOctateError`, `isReviewModel`

**Modules/Directories:**
- kebab-case directories: `cancellation`, `repository`, `config`
- Barrel exports at `index.ts` in each directory

## Code Style

**Formatting (Biome):**
- Indentation: 2 spaces
- Line width: 100 characters
- Semicolons: always
- Trailing commas: ES5 (trailing where valid)
- Quotes: single quotes
- Organize imports: enabled (auto-sort)

**Linting (Biome):**
- Recommended rules: enabled
- Correctness: error level
- Suspicious: error level
- Style: warn level
- `noProcessEnv`: off (CLI needs process.env)
- `noExcessiveClassesPerFile`: off
- `useNamingConvention`: warn (strictCase: false)
- `noNodejsModules`: off (uses Node.js built-ins)
- `noProcessGlobal`: off

**TypeScript (tsconfig.json):**
- Target: ES2022
- Module: NodeNext
- ModuleResolution: NodeNext
- Strict: true
- noUncheckedIndexedAccess: true
- exactOptionalPropertyTypes: true
- Declaration: true (generates .d.ts)
- SourceMap: true
- Path aliases: `@/*` → `./src/*`

## Import Organization

**Order (enforced by Biome organizeImports):**
1. Node.js built-ins: `node:fs/promises`, `node:path`
2. External packages: `commander`, `zod`, `pino`
3. Internal aliases: `@/logging`, `@/errors` (via path mapping)
4. Relative imports: `../types`, `./schema`

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in tsconfig.json and jest.config.ts)
- Used extensively: `@/logging`, `@/errors`, `@/model/types`

**Import Style:**
- Named imports preferred: `import { createLogger } from '@/logging'`
- Type-only imports: `import type { Logger } from 'pino'`
- Namespace imports rare: `import * as fs from 'node:fs/promises'`

## Error Handling

**Pattern: Typed Error Hierarchy**
- Base class: `OctateError` (extends Error) with `exitCode` and `context`
- Specific errors per category: `ConfigurationError` (2), `RepositoryError` (3), `GitError` (3), `ParseError` (3), `AnalysisError` (3), `ContextError` (3), `ModelError` (4), `ProviderRateLimitError` (4), `ProviderTimeoutError` (4), `AuthenticationError` (4), `QuotaExceededError` (4), `ValidationError` (5), `InternalError` (5)
- Factory functions: `createConfigurationError`, `createGitError`, etc.
- Type guards: `isOctateError`, `isConfigurationError`, etc. for narrowing
- JSON serialization: `toJson()` method on base class

**Usage:**
```typescript
// Throwing
throw new ConfigurationError('Invalid config', { filePath: 'octate.yaml' });

// Catching with type guards
if (isOctateError(error)) {
  logger.error({ error: error.message, context: error.context }, 'Command failed');
  process.exit(error.exitCode);
}
```

**Validation:**
- Zod schemas for all config: `OctateConfigSchema`, `ReviewConfigSchema`
- Strict mode: `.strict()` prevents extra properties
- AOT compilation: `CompiledOctateConfigSchema` (Zod v4 compatible)
- Parse with detailed errors: `z.ZodError` issues mapped to readable strings

## Logging

**Framework:** Pino (v10.3.1) with `pino-pretty` for development

**Patterns:**
- Root logger: `logger = createPinoLogger()`
- Child loggers per module: `createLogger('module:name')` or `createLogger('module', bindings)`
- Context loggers: `createContextLogger('module', { requestId: '123' })`
- Redaction: Automatic for sensitive fields (`NVIDIA_API_KEY`, `apiKey`, `token`, `password`, `secret`, `authorization`, `x-api-key`, `apikey`)
- Levels: `debug`, `info`, `warn`, `error`, `fatal`, `trace`
- Development: pretty printing with colors and timestamps
- Production: JSON output

**Usage:**
```typescript
const logger = createLogger('commands:review');
logger.info({ repoRoot, fileCount }, 'Starting review');
logger.debug({ detail: '...' }, 'Debug info');
logger.warn({ issue: '...' }, 'Warning');
logger.error({ error: err.message, stack: err.stack }, 'Failed');
```

## Comments

**When to Comment:**
- JSDoc for all public exports (functions, classes, interfaces, types)
- Module-level header comment describing purpose
- Complex algorithms or non-obvious logic
- TODO/FIXME markers for known limitations

**JSDoc Style:**
```typescript
/**
 * Creates the review command for Commander.js.
 * @returns Commander command instance
 */
export function createReviewCommand(): Command { ... }

/**
 * Validates that exactly one scope option is provided.
 * @throws ConfigurationError if no scope or multiple scopes
 */
function validateScope(options: ReviewOptions): void { ... }
```

**Type Documentation:**
- Inline comments for complex type definitions
- Zod schemas serve as runtime validation + documentation

## Function Design

**Size:**
- Small, focused functions (typically < 50 lines)
- Private helpers nested or module-scoped with `function` keyword
- Single responsibility per function

**Parameters:**
- Options objects for multiple parameters: `ReviewOptions`, `CacheStoreOptions`, `ConfigMergerOptions`
- Destructuring in function signature for clarity
- Required params first, optional/config objects last

**Return Values:**
- Explicit return types for public APIs
- `Promise<T>` for async functions
- `never` for functions that always throw (`handleError`)
- Early returns for guard clauses

## Module Design

**Exports:**
- Named exports for all public API
- Barrel files (`index.ts`) re-export from submodules
- Internal implementation details not exported (or prefixed with `_`)

**Barrel Pattern:**
```typescript
// src/logging/index.ts
export { logger, createLogger, createContextLogger, redactionPaths };
export type { LogLevel, RedactionPath };

// src/errors/index.ts
export { OctateError, ConfigurationError, ... };
export { isOctateError, isConfigurationError, ... };
export { createConfigurationError, createGitError, ... };
```

**Dependency Direction:**
- Core domain types (`src/types`) have no dependencies
- Utilities (`logging`, `errors`, `cancellation`, `cache`) depend only on types
- Commands depend on utilities and repository
- Configuration depends on logging and errors
- Model abstraction depends only on types

## Async Patterns

**Cancellation:**
- `AbortController` / `AbortSignal` standard API
- `CancellationController` wrapper for child signals and lifecycle
- `withCancellation(operation, signal?)` for racing against abort
- Single controller at review use case level, propagates to all layers

**Concurrency:**
- `p-limit` for simple concurrency limiting
- `p-queue` for priority/ordering (reviewer DAG)
- Sequential by default, parallel explicit

**Error Handling in Async:**
- Try/catch with typed error re-throwing
- `finally` blocks for cleanup (abort controllers, temp files)
- `Promise.race` for cancellation vs operation

## Configuration Patterns

**Layered Config (precedence):**
1. Defaults (built-in)
2. Global (`~/.config/octate/config.yaml`)
3. Project (`octate.yaml` at repo root)
4. Environment variables (`OCTATE_<SECTION>_<KEY>`)
5. CLI flags (highest)

**Environment Variable Convention:**
- Prefix: `OCTATE_`
- Section + key: `OCTATE_REVIEW_SEVERITY=high` → `{ review: { severity: 'high' } }`
- JSON parsing attempted, fallback to string
- Snake_case env vars → camelCase config

**Schema Validation:**
- Zod schemas define structure + defaults
- `.strict()` prevents unknown keys
- Validation at each layer load + final merge
- Detailed error messages for config issues

## CLI Patterns

**Commander.js Structure:**
- `createProgram()` builds command tree
- `create*Command()` functions per subcommand
- `registerCommands(program)` wires them up
- Global options merged via `preAction` hook
- Action handlers async, return `Promise<void>`

**Output Modes:**
- Mutually exclusive: `--json`, `--sarif`, `--quiet`
- `--output <file>` writes to file instead of stdout
- `--no-tui` disables interactive mode
- Default: human-readable formatted output

**Exit Codes:**
- 0: Success
- 2: Configuration error
- 3: Repository/Git/Parse/Analysis/Context error
- 4: Model/Provider/Authentication/Quota error
- 5: Validation/Internal error

---

*Convention analysis: 2026-09-08*
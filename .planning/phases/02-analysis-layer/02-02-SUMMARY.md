# Phase 2 Plan 02: Static Analysis Orchestration & Diagnostics - Summary

**Phase:** 02-analysis-layer
**Plan:** 02
**Wave:** 2
**Status:** Complete
**Duration:** ~45 min
**Completed:** 2026-09-09T19:10:00Z

## One-Liner
Static analysis orchestration with parallel tool execution and structured diagnostics — runs tsc, biome, ruff, mypy, pyright, bandit, pytest and produces unified Diagnostic[] for AI consumption.

## Files Created/Modified

### New Files
| Path | Purpose |
|------|---------|
| `src/analysis/diagnostics/severity.ts` | Severity mapping from tool output to standardized levels |
| `src/analysis/diagnostics/severity.test.ts` | Severity mapping and normalization tests |
| `src/analysis/diagnostics/tools.ts` | Tool detection and subprocess execution |
| `src/analysis/diagnostics/tools.test.ts` | Tool detection and execution tests |
| `src/analysis/diagnostics/index.ts` | Main diagnostic collection with parallel execution |
| `src/analysis/diagnostics/index.test.ts` | Diagnostic collection tests |
| `src/analysis/orchestrator.ts` | Analysis orchestrator combining parsing + diagnostics |
| `src/analysis/orchestrator.test.ts` | Orchestrator integration tests |

### Total: 8 files

## Key Accomplishments

### Tool Detection & Hybrid Fallbacks (D-07)
- Detects tools from config files: tsconfig.json → tsc, biome.json → biome, ruff.toml → ruff, pyproject.toml → mypy/pyright/bandit/pytest
- Falls back to PATH availability when config files missing
- Filters tools by detected languages (TS/JS vs Python)

### Static Analysis Tool Execution (D-08)
- Uses `spawnWithSignal` for subprocess execution with AbortSignal support
- 7 tools supported: tsc, biome (TS/JS); ruff, mypy, pyright, bandit, pytest (Python)
- Graceful degradation per D-12: failed tools log warning, return empty array, others continue

### Severity Standardization (D-10)
- `mapSeverity(toolSeverity, tool)` → 'critical' | 'high' | 'medium' | 'low' | 'info'
- Tool-specific mapping: tsc error→critical, warning→medium; biome error→critical, warning→high; ruff E→critical, W→high; mypy error→high, warning→low; bandit HIGH→critical, MEDIUM→high

### Unified Diagnostic Schema (D-11)
- `normalizeDiagnostic(raw, tool)` → `Diagnostic | null`
- Handles tsc JSON, biome JSON, ruff JSON, mypy JSON, pyright JSON, bandit JSON, pytest JSON
- Returns null for non-actionable output (summary lines, counts)

### Parallel Execution with Bounded Concurrency (D-09)
- Uses `PromisePool` from cache layer (concurrency limit of 3)
- Runs tools in parallel, collects results in `Map<toolName, Diagnostic[]>`
- Tracks per-tool metrics (count, timeMs)

### Analysis Orchestrator
- Single pipeline: parse → extract symbols → detect languages → run diagnostics → return `AnalysisResult`
- Error handling: parse errors caught in errors array, tool failures logged and skipped, abort signal cancels all
- Metrics: totalFiles, parsedFiles, symbolCount, diagnosticCount, parseTimeMs, diagnosticsTimeMs, totalTimeMs

### Testing & Quality
- 36 new tests in diagnostics module (severity, tools, index)
- 14 orchestrator tests (empty, parse+symbols, diagnostics, metrics, abort, language detection)
- 71 total analysis tests passing
- TypeScript compiles with zero errors
- Biome lint passes with no warnings

## Requirements Completed
- **ANAL-01**: Static analysis tools detected from repository config, run in parallel with bounded concurrency, produce structured diagnostics ✓
- **ANAL-02**: Diagnostics, test discovery, and security scanner output collected and structured for AI consumption ✓

## Deviations from Plan
None - plan executed exactly as written.

## Next Steps
Ready for Phase 3: Intelligence Layer (Context Engine with token budgeting)
# Phase 8: CLI Integration, Polish & Evaluation - Pattern Mapping

**Phase:** 08 — CLI Integration, Polish & Evaluation  
**Domain:** End-to-End CLI Verification, Comprehensive Doctor Diagnostics, Golden Evaluation Fixtures, Performance & Quality Benchmarking, Release Packaging & Production Documentation  
**Status:** Completed  
**Author:** gsd-pattern-mapper  
**Canonical Inputs:** [08-CONTEXT.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/08-cli-integration-polish-evaluation/08-CONTEXT.md), [08-RESEARCH.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/08-cli-integration-polish-evaluation/08-RESEARCH.md)  

---

## 1. Architectural Positioning & Responsibilities

Phase 8 integrates and polishes the entire 8-layer Octate stack into a cohesive, verified v1.0 release:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 8: CLI Integration, Polish & Evaluation                          │
│ • End-to-end command set (review, doctor, init)                        │
│ • Comprehensive environment & tool diagnostics                         │
│ • Multi-language golden review testbed & negative pairing               │
│ • Quality benchmarking (FP < 30%, Precision > 70%, Latency p50 < 30s)  │
│ • Packaging hygiene, WASM distribution, and user documentation         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌───────────────┐           ┌───────────────┐           ┌────────────────┐
│  Presentation │           │ Review Engine │           │ Infrastructure │
│  (Phases 6-7) │           │ (Phases 3-5)  │           │ (Phases 1-2)   │
└───────────────┘           └───────────────┘           └────────────────┘
```

---

## 2. File Inventory & Classification

| File Path | Architectural Role / Layer | Data Flow (Input ➔ Transform ➔ Output) | Closest Codebase Analog |
|:---|:---|:---|:---|
| `src/commands/doctor.ts` | **System Diagnostics & Environment Audit** | System inspection (Node, Git, Cache, PATH tools, WASM, NVIDIA) ➔ Structured `DoctorCheck[]` ➔ ANSI table / JSON output with remediation advice. | [`src/commands/doctor.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/doctor.ts)<br>[`src/analysis/diagnostics/tools.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/diagnostics/tools.ts) |
| `src/commands/doctor.test.ts` | **Doctor Unit & Integration Tests** | Mock filesystem, subprocesses, and fetch ➔ Assert check statuses, remediation boxes, and exit codes (0 vs 2). | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/analysis/parser/index.ts` | **WASM Grammar Path Resolution** | File request ➔ Dynamic discovery (`dist/wasm/` vs `test-wasm/`) ➔ Loaded `Language` object. | [`src/analysis/parser/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/parser/index.ts) |
| `src/cli.ts` | **CLI Entrypoint & Process Hygiene** | CLI args + global error traps (`uncaughtException`, `unhandledRejection`) ➔ Sanitized exit code and error output. | [`src/cli.ts`](file:///home/ved/Desktop/project_i/Octate/src/cli.ts) |
| `test/fixtures/golden/**` | **Golden Review & Regression Test Cases** | Vulnerable and clean paired diffs in TS and Python + `expected.json` contracts. | [`src/review/__tests__/mocks.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/__tests__/mocks.ts) |
| `test/evaluation/harness.ts` | **Evaluation & Semantic Matching Harness** | ReviewResult + ExpectedFinding ➔ File, range, severity, and confidence overlap matching ➔ Precision/Recall scorecard. | [`src/review/dedup.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/dedup.ts)<br>[`src/application/policy.ts`](file:///home/ved/Desktop/project_i/Octate/src/application/policy.ts) |
| `test/evaluation/evaluation.test.ts` | **Evaluation Suite Runner** | Runs golden testbed against `ReviewUseCase` ➔ Asserts FP < 30% and Precision > 70%. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `scripts/copy-wasm.cjs` | **Build Hook for WASM Relocation** | Copies `test-wasm/*.wasm` to `dist/wasm/` during `npm run build`. | [`package.json`](file:///home/ved/Desktop/project_i/Octate/package.json) |
| `scripts/bench.ts` | **Performance Benchmark Runner** | Executes review across testbed repos, measures latency and tokens, prints scorecard. | [`test/evaluation/harness.ts`](file:///home/ved/Desktop/project_i/Octate/test/evaluation/harness.ts) |
| `package.json` | **Package Distribution Metadata** | Whitelist `files: ["dist", "README.md", "LICENSE"]`, bin entry, `pack:check` script. | [`package.json`](file:///home/ved/Desktop/project_i/Octate/package.json) |
| `README.md` & `docs/**` | **Production User Documentation** | CLI usage, quickstart, config schema, CI/CD recipes, troubleshooting guides. | [`.planning/PROJECT.md`](file:///home/ved/Desktop/project_i/Octate/.planning/PROJECT.md) |

---

## 3. Established Code Patterns & Excerpts

### Pattern 1: Tool Discovery on `$PATH` via `which`
From `src/analysis/diagnostics/tools.ts`:
```typescript
import { spawnWithSignal } from '../../cancellation/index.js';

export async function which(tool: string): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where' : 'which';
  try {
    const result = await spawnWithSignal(cmd, [tool]);
    if (result.exitCode === 0) {
      return result.stdout.trim().split('\n')[0] ?? null;
    }
  } catch {
    // Tool not found
  }
  return null;
}
```

### Pattern 2: Semantic Match Between Finding and Golden Spec
From `test/evaluation/harness.ts`:
```typescript
export function matchesExpected(finding: RankedFinding, expected: ExpectedFinding): boolean {
  if (finding.file !== expected.targetFile) return false;
  
  // Overlap tolerance ±3 lines
  const startOverlap = Math.max(finding.startLine, expected.lineRange.start);
  const endOverlap = Math.min(finding.endLine, expected.lineRange.end);
  const hasLineOverlap = startOverlap <= endOverlap + 3 && endOverlap >= startOverlap - 3;
  if (!hasLineOverlap) return false;

  if (finding.confidence < expected.minConfidence) return false;
  if (expected.category && finding.category !== expected.category) return false;

  return true;
}
```

### Pattern 3: Tree-sitter WASM Dynamic Path Resolution
From `src/analysis/parser/index.ts`:
```typescript
import fs from 'node:fs';
import path from 'node:path';

export function resolveWasmFile(filename: string): string {
  const prodPath = path.resolve(__dirname, '../../wasm', filename);
  if (fs.existsSync(prodPath)) return prodPath;

  const devPath = path.resolve(__dirname, '../../../test-wasm', filename);
  if (fs.existsSync(devPath)) return devPath;

  const cwdPath = path.resolve(process.cwd(), 'test-wasm', filename);
  if (fs.existsSync(cwdPath)) return cwdPath;

  throw new Error(`Tree-sitter WASM grammar not found: ${filename}`);
}
```

### Pattern 4: Global Process Exception Sanitization
From `src/cli.ts`:
```typescript
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.stderr.write(`\nFatal Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(5);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  process.stderr.write(`\nFatal Error: ${reason instanceof Error ? reason.message : String(reason)}\n`);
  process.exit(5);
});
```

---

*Pattern mapping completed: 2026-09-11*

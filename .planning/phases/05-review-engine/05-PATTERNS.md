# Phase 5: Review Engine - Pattern Mapping

**Phase:** 05 — Review Engine  
**Domain:** Review DAG Orchestration, Semantic/Security Triggers, Two-Stage Critic Quality Gate, Multi-Factor Deduplication, and Confidence-Weighted Composite Ranking  
**Status:** Completed  
**Author:** gsd-pattern-mapper  
**Canonical Inputs:** [05-CONTEXT.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/05-review-engine/05-CONTEXT.md), [05-RESEARCH.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/05-review-engine/05-RESEARCH.md)  

---

## 1. Architectural Positioning & Responsibilities

The Review Engine serves as **Layer 5** in Octate's 8-layer strict architecture:

```
Layer 7: Terminal Presentation (TUI, JSON, SARIF, Quiet renderers)
               ▲
Layer 6: Application Layer (ReviewUseCase, Command handlers, Exit code mapper)
               ▲
Layer 5: Review Engine (Phase 5: ReviewDAG, CriticStage, Deduplicator, Ranker)
               ▲
Layer 4: Model Provider (ReviewModel, LocalNvidiaProvider, Schema, Prompts)
               ▲
Layer 3: Intelligence Layer (ReferenceGraph, ContextEngine, ReviewContext)
               ▲
Layer 2: Analysis Layer (Tree-sitter, Symbols, DiagnosticsOrchestrator)
               ▲
Layer 1: Repository Layer (Git diff, Scopes, Cache, Cancellation)
```

Layer 5 is a **pure domain reasoning engine**. It has zero dependencies on terminal formatting, colors, or CLI frameworks. It coordinates the execution of reviewer models, enforces deterministic and semantic quality gates, merges redundant evidence, and computes mathematical rankings to produce the authoritative `ReviewResult` domain object consumed by Layer 6 (`src/commands/review.ts`) and Layer 7 (TUI renderers).

---

## 2. File Inventory & Classification

| File Path | Architectural Role / Layer | Data Flow (Input ➔ Transform ➔ Output) | Closest Codebase Analog |
|:---|:---|:---|:---|
| `src/review/types.ts` | **Domain Models**<br>(Layer 5 Core Types) | Defines immutable types for findings, ranking breakdowns, summary statistics, and review results. | [`src/model/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/types.ts)<br>[`src/analysis/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/types.ts) |
| `src/review/heuristics.ts` | **Deterministic Heuristic Triggers**<br>(Pre-DAG Evaluator) | Git Diff + SymbolIndex ➔ AST logic overlap check + security regex detection + intentionality filter ➔ Trigger booleans (`shouldTriggerSemantic`, `shouldTriggerSecurity`). | [`src/intelligence/graph/reference.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.ts)<br>[`src/intelligence/context/engine.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/context/engine.ts) |
| `src/review/dag.ts` | **Review DAG Runner**<br>(Pipeline Stage 1) | Diff + ReviewContext + Diagnostics + Heuristic flags ➔ Bounded parallel execution (Structural baseline ➔ conditional Semantic/Security) with graceful degradation ➔ Candidate `ModelFinding[]`. | [`src/analysis/orchestrator.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.ts)<br>[`src/cache/pool.ts`](file:///home/ved/Desktop/project_i/Octate/src/cache/pool.ts) |
| `src/review/dedup.ts` | **Finding Deduplicator**<br>(Pipeline Stages 2 & 4) | Raw candidate findings ➔ Multi-factor clustering (line overlap, AST symbol, issue signature) + attribute conflict escalation + evidence union/capping ➔ Deduplicated findings. | [`src/model/schema/grounding.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/grounding.ts)<br>[`src/intelligence/index/symbol-index.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/index/symbol-index.ts) |
| `src/review/critic.ts` | **Critic Quality Gate**<br>(Pipeline Stage 3) | Candidate findings ➔ Stage 3A: Deterministic Hard Floor (grounding, minConfidence >= 0.6, evidence count >= 1, actionability) ➔ Stage 3B: `critic.v1` prompt invocation with retry + fail-fast quality gate ➔ Curated findings. | [`src/model/schema/grounding.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/grounding.ts)<br>[`src/model/schema/repair.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/repair.ts) |
| `src/review/ranking.ts` | **Composite Ranker & Truncator**<br>(Pipeline Stage 5) | Curated findings + ReferenceGraph + Severity config ➔ 0–100 composite formula + deterministic blast radius + evidence strength + Critical-protected `maxFindings` truncation ➔ `RankedFinding[]`. | [`src/intelligence/graph/reference.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.ts)<br>[`src/analysis/diagnostics/severity.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/diagnostics/severity.ts) |
| `src/review/engine.ts` | **Review Engine Facade**<br>(Main Coordinator) | `ReviewEngineInput` (repoRoot, diff, context, graph, model, config, signal) ➔ Staged DAG ➔ Dedup ➔ Critic ➔ Consolidation ➔ Ranking ➔ Authoritative `ReviewResult`. | [`src/analysis/orchestrator.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.ts)<br>[`src/intelligence/context/engine.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/context/engine.ts) |
| `src/review/index.ts` | **Public API Barrel**<br>(Module Root) | Re-exports domain types and runner functions for external consumers. | [`src/intelligence/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/index.ts)<br>[`src/model/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/index.ts) |
| `src/review/heuristics.test.ts` | **Heuristics Test Suite** | Test diffs & mock SymbolIndexes ➔ AST function intersection, security keyword detection, intentionality markers. | [`src/intelligence/graph/reference.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.test.ts) |
| `src/review/dag.test.ts` | **DAG Runner Test Suite** | Mock ReviewModel ➔ Staged execution order, conditional triggers, role-specialized diagnostics, graceful degradation warnings. | [`src/analysis/orchestrator.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.test.ts) |
| `src/review/dedup.test.ts` | **Deduplicator Test Suite** | Overlapping/duplicate findings ➔ Line interval overlap, symbol clustering, severity escalation, evidence cap at 5. | [`src/model/schema/grounding.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/grounding.test.ts) |
| `src/review/critic.test.ts` | **Critic Quality Gate Test Suite** | Candidate findings with edge-case faults ➔ Hard floor rejection, actionability filtering, intentionality ignore, LLM retry and fail-fast. | [`src/model/schema/repair.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/repair.test.ts)<br>[`src/model/providers/resilience.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/providers/resilience.test.ts) |
| `src/review/ranking.test.ts` | **Ranker Test Suite** | Mock ReferenceGraph & findings ➔ Normalized composite math, logarithmic blast radius, Critical-protected truncation. | [`src/intelligence/graph/reference.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.test.ts) |
| `src/review/engine.test.ts` | **Engine E2E Test Suite** | Complete input pipeline with `MockReviewModel` ➔ Full lifecycle execution, cancellation, metrics calculation. | [`src/analysis/orchestrator.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.test.ts) |
| `src/config/schema.ts` *(modify)* | **Configuration Schema** | Add `minConfidence` to `ReviewConfigSchema` with default `0.6`. | [`src/config/schema.ts`](file:///home/ved/Desktop/project_i/Octate/src/config/schema.ts) |
| `src/commands/review.ts` *(modify)* | **CLI Command Layer** | Replace placeholder `ReviewResult` mock at line 191 with `ReviewEngine.run()`. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts) |

---

## 3. Component Analog Mapping & Concrete Excerpts

### 3.1 Domain Models (`src/review/types.ts`)

#### Architectural Role & Analog
- **Role:** Central domain types for Layer 5 (`ReviewResult`, `RankedFinding`, `ScoreBreakdown`, `ReviewSummary`, `ExecutionMetadata`, `ReviewEngineInput`).
- **Closest Analog:** [`src/model/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/types.ts) and [`src/analysis/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/types.ts).
- **Patterns Followed:**
  1. Strict union string literals for severities and categories.
  2. Sub-interfaces for granular breakdowns (`ScoreBreakdown`, `ModelEvidence`).
  3. Clean separation between model-level types (`ModelFinding`) and engine-level enriched types (`RankedFinding` with `id`, `compositeScore`, `blastRadius`, `contributingReviewers`).
  4. Comprehensive telemetry metadata for execution timing, tokens, and warnings.

#### Concrete Code Excerpt from Analog (`src/model/types.ts`)
```typescript
// From src/model/types.ts:18-42
export interface ModelFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category:
    | 'correctness'
    | 'security'
    | 'performance'
    | 'architecture'
    | 'reliability'
    | 'maintainability'
    | 'compatibility'
    | 'testing';
  title: string;
  message: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  evidence: ModelEvidence[];
  relatedFiles: string[];
  relatedSymbols: string[];
  impact: string;
  suggestedFix: string;
  reviewer: string;
  metadata?: Record<string, unknown>;
}
```

#### Established Convention for `src/review/types.ts`
```typescript
import type { Diagnostic, ModelEvidence, ModelFinding, ModelRequest, ReviewModel } from '../model/types.js';
import type { ReferenceGraph } from '../intelligence/graph/reference.js';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ReviewContext } from '../intelligence/types.js';
import type { ReviewConfig } from '../config/schema.js';

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory =
  | 'correctness'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'reliability'
  | 'maintainability'
  | 'compatibility'
  | 'testing';

export interface ScoreBreakdown {
  severityScore: number;
  confidenceScore: number;
  evidenceStrengthScore: number;
  blastRadiusScore: number;
  securityImpactScore: number;
  regressionProbabilityScore: number;
}

export interface RankedFinding extends ModelFinding {
  /** Deterministic SHA256 identifier (file:startLine:category:title) */
  id: string;
  /** Composite score (0.00 to 100.00) */
  compositeScore: number;
  /** Component scoring breakdown */
  scoreBreakdown: ScoreBreakdown;
  /** Deterministic blast radius (10-100) */
  blastRadius: number;
  /** Evidence strength (0-100) */
  evidenceStrength: number;
  /** Reviewers that contributed to this finding */
  contributingReviewers: string[];
}

export interface ReviewSummary {
  totalFindings: number;
  bySeverity: Record<ReviewSeverity, number>;
  byCategory: Record<FindingCategory, number>;
  byReviewer: Record<string, number>;
  filesAnalyzed: number;
  durationMs: number;
}

export interface ExecutionMetadata {
  scopeType: string;
  base?: string | undefined;
  head?: string | undefined;
  timestamp: string;
  version: string;
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  warnings: string[];
  reviewersTriggered: string[];
  criticInvoked: boolean;
  preCriticFindingCount: number;
  postCriticFindingCount: number;
}

export interface ReviewResult {
  summary: ReviewSummary;
  findings: RankedFinding[];
  metadata: ExecutionMetadata;
}
```

---

### 3.2 Heuristic Triggers & Intentionality (`src/review/heuristics.ts`)

#### Architectural Role & Analog
- **Role:** Deterministic code heuristics to trigger Semantic Reviewer (`executable AST logic modified`), Security Reviewer (`diff or symbols touch security patterns`), and suppress intentional code / test mocks (`D-02`, `D-08`).
- **Closest Analog:** [`src/intelligence/graph/reference.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.ts:174-197) and [`src/intelligence/context/engine.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/context/engine.ts:109-130).
- **Patterns Followed:**
  1. Pure deterministic analysis: zero async LLM calls, zero I/O side effects.
  2. RegExp pattern compilation with clean grouping and case-insensitivity.
  3. Path normalization using `node:path` (`path.normalize`).
  4. Test file detection logic using directory prefixes and file extension naming patterns.

#### Concrete Code Excerpt from Analog (`src/intelligence/graph/reference.ts`)
```typescript
// From src/intelligence/graph/reference.ts:174-187
private isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('__tests__') ||
    lower.startsWith('test/') ||
    lower.startsWith('tests/') ||
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.endsWith('_test.py') ||
    path.basename(lower).startsWith('test_')
  );
}
```

#### Established Convention for `src/review/heuristics.ts`
- Parse git diff hunks (`@@ -oldStart,oldLen +newStart,newLen @@`) into line ranges per changed file.
- Match diff line ranges against `symbolIndex.getFileSymbols(file)` where `sym.kind === 'function' || sym.kind === 'method'`.
- Evaluate security keyword patterns (`auth`, `crypto`, `token`, `exec`, `jwt`, `req.body`, `eval`) across diff text, changed dependency files (`package.json`, `requirements.txt`), and referenced symbols.
- Evaluate intentionality markers (`@deprecated`, `@ts-ignore`, `eslint-disable`, `octate:ignore`) and mock directories (`/tests/mocks/`, `dummy_key`).

---

### 3.3 Staged Review DAG Concurrency (`src/review/dag.ts`)

#### Architectural Role & Analog
- **Role:** Executes the staged Review DAG (`D-01`): Structural Reviewer baseline always runs first; then evaluates triggers (`D-02`) and conditionally executes Semantic and Security Reviewers in a bounded promise pool. Implements graceful reviewer degradation (`D-03`) and role-specialized diagnostics (`D-04`).
- **Closest Analog:** [`src/analysis/orchestrator.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.ts) and [`src/cache/pool.ts`](file:///home/ved/Desktop/project_i/Octate/src/cache/pool.ts).
- **Patterns Followed:**
  1. Concurrency bounding via `createPromisePool(2)` to respect provider rate limits.
  2. Signal propagation: Check `signal?.throwIfAborted()` between stages and pass `signal` to model calls.
  3. Graceful degradation: Wrap each reviewer execution in `try / catch`. If one reviewer throws, log structured warning, add warning string to metadata, and retain findings from surviving reviewers.
  4. Fail-fast only if *all* triggered reviewers fail.
  5. Role-specialized diagnostics: Slice compiler errors (`tsc`, `mypy`) for Structural, test/behavioral errors for Semantic, scanner advisories (`bandit`, security linters) for Security.

#### Concrete Code Excerpt from Analog (`src/cache/pool.ts`)
```typescript
// From src/cache/pool.ts:9-16, 29-36
export function createPromisePool(concurrency?: number): PromisePool {
  const limit = pLimit(concurrency ?? navigator?.hardwareConcurrency ?? 4);
  return new PromisePool(limit);
}

export class PromisePool {
  private limit: ReturnType<typeof pLimit>;

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }
}
```

#### Concrete Code Excerpt from Analog (`src/analysis/orchestrator.ts`)
```typescript
// From src/analysis/orchestrator.ts:74-86
// Check abort signal before parsing
if (options?.signal?.aborted) {
  throw new Error('Analysis aborted');
}

try {
  parseResult = await parseFiles(validFiles, parseOptions);
} catch (error) {
  // Re-throw abort errors, handle other errors gracefully
  if (error instanceof Error && error.message === 'Parsing aborted') {
    throw error;
  }
  log.error({ error }, 'Parse failed');
  parseResult = { files: [], errors: [{ file: 'unknown', error: error as Error }], totalTimeMs: 0 };
}
```

---

### 3.4 Multi-Factor Deduplication & Evidence Merging (`src/review/dedup.ts`)

#### Architectural Role & Analog
- **Role:** Two-phase deduplication (`D-12`): Pre-Critic syntactic clustering to eliminate obvious duplicates before `critic.v1` model call, and post-Critic consolidation. Implements multi-factor duplicate matching (`D-09`), attribute conflict escalation (`D-10`), and evidence union capped at 5 (`D-11`).
- **Closest Analog:** [`src/model/schema/grounding.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/grounding.ts) and [`src/intelligence/index/symbol-index.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/index/symbol-index.ts).
- **Patterns Followed:**
  1. Interval overlap formula: $\max(start_A, start_B) \le \min(end_A, end_B)$.
  2. Enclosing symbol discovery: Look up symbol containing `finding.startLine` in `symbolIndex.getFileSymbols(file)`.
  3. Severity escalation: Map severity to ordinal numeric rank (`critical: 5 > high: 4 > medium: 3 > low: 2 > info: 1`) and take maximum.
  4. Evidence deduplication: Uniquely key by `${file}:${startLine}:${endLine}`, capped strictly at 5 items.
  5. Multi-reviewer attribution: Set `contributingReviewers = Array.from(new Set(reviewers))`.

#### Concrete Code Excerpt from Analog (`src/model/schema/grounding.ts`)
```typescript
// From src/model/schema/grounding.ts:60-93
// Ground evidence items
const groundedEvidence: ModelEvidence[] = [];
for (const ev of finding.evidence) {
  if (ev.file.includes('..') || ev.file.startsWith('/') || path.isAbsolute(ev.file)) {
    continue;
  }
  const evFile = path.normalize(ev.file).replace(/^[/\\]+/, '');
  // ... line range checks ...
  groundedEvidence.push({
    ...ev,
    file: evFile,
    startLine: evStart,
    endLine: evEnd,
  });
}
```

---

### 3.5 Two-Stage Critic Quality Gate (`src/review/critic.ts`)

#### Architectural Role & Analog
- **Role:** Two-stage Critic pipeline (`D-05`): Stage 3A Deterministic Hard Floor (`D-06`) dropping ungrounded findings, confidence < 0.6, empty evidence, or non-actionable suggested fixes; Stage 3B `critic.v1` LLM evaluation (`D-07`) with 1 schema-repaired retry and fail-fast `ModelError` (exit code 4).
- **Closest Analog:** [`src/model/schema/grounding.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/grounding.ts:19-59), [`src/model/schema/repair.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/schema/repair.ts:9-18), and [`src/errors/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/errors/index.ts:111-115).
- **Patterns Followed:**
  1. `groundFinding(finding, groundingContext)` verifies file existence and line counts.
  2. Skip Critic LLM invocation completely if 0 candidate findings survive Stage 3A (0 latency, 0 tokens).
  3. Load prompt template via `loadPromptTemplate('critic.v1')` and render via `renderTemplate`.
  4. Prompt sandwich framing via `serializePromptContext`.
  5. Retry on invalid JSON or model exception using `formatZodIssuesForRepairPrompt`.
  6. Quality gate guarantee: If Critic still fails after retry, throw `ModelError` (exit code 4) to ensure uncurated findings never reach the developer.

#### Concrete Code Excerpt from Analog (`src/model/schema/grounding.ts`)
```typescript
// From src/model/schema/grounding.ts:19-58
export async function groundFinding(
  finding: ModelFinding,
  ctx: GroundingContext
): Promise<ModelFinding | null> {
  // Reject path traversal and absolute paths
  if (finding.file.includes('..') || finding.file.startsWith('/') || path.isAbsolute(finding.file)) {
    return null;
  }

  const normalizedFile = path.normalize(finding.file).replace(/^[/\\]+/, '');
  if (ctx.validFiles && !ctx.validFiles.has(normalizedFile)) {
    return null;
  }

  if (ctx.getFileLineCount) {
    const totalLines = await ctx.getFileLineCount(normalizedFile);
    if (totalLines !== null && totalLines !== undefined) {
      if (finding.startLine > totalLines) {
        // Phantom finding beyond end of file
        return null;
      }
    }
  }
  // ...
}
```

#### Concrete Code Excerpt from Analog (`src/model/schema/repair.ts`)
```typescript
// From src/model/schema/repair.ts:9-18
export function formatZodIssuesForRepairPrompt(error: z.ZodError): string {
  const issuesList = error.issues
    .map((issue) => {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `- Field '${fieldPath}': ${issue.message}`;
    })
    .join('\n');

  return `Your previous JSON response did not match the required schema. Please fix these issues and return valid JSON:\n${issuesList}`;
}
```

---

### 3.6 Confidence-Weighted Composite Ranking (`src/review/ranking.ts`)

#### Architectural Role & Analog
- **Role:** Calculates normalized 0–100 composite score (`D-13`), deterministic blast radius from `ReferenceGraph` (`D-14`), evidence strength score, filters by `minSeverity`, and caps at `maxFindings` with Critical protection (`D-15`).
- **Closest Analog:** [`src/intelligence/graph/reference.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/graph/reference.ts:70-101) and [`src/analysis/diagnostics/severity.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/diagnostics/severity.ts).
- **Patterns Followed:**
  1. Normalized composite scoring:
     $$\text{Composite} = 0.30 \cdot S + 0.20 \cdot C + 0.15 \cdot E + 0.15 \cdot B + 0.10 \cdot SI + 0.10 \cdot RP$$
  2. Blast radius calculation using `ReferenceGraph`:
     - $N_{\text{callers}} = \text{graph.getCallers(symbolId).length}$
     - $N_{\text{importers}} = \text{graph.getIncoming(file).filter(imports).length}$
     - $B = \min(100, \text{round}(10 + 90 \cdot \min(1.0, \frac{\log_2(N + 1)}{4})))$
  3. Evidence strength calculation: Base score on evidence count (0 ➔ 0, 1 ➔ 40, 2 ➔ 70, 3+ ➔ 90) + diversity bonus (+10 if multiple files) + specificity bonus (+5 if spans <= 10 lines).
  4. Critical-protected truncation:
     - Partition into `criticalFindings` and `nonCriticalFindings`.
     - `criticalFindings` are **NEVER truncated**.
     - Non-critical findings are capped at $\max(0, maxFindings - criticalFindings.length)$.

#### Concrete Code Excerpt from Analog (`src/intelligence/graph/reference.ts`)
```typescript
// From src/intelligence/graph/reference.ts:73-76
public getCallers(symbolId: string, limit = 10): GraphEdge[] {
  const callers = (this.incoming.get(symbolId) ?? []).filter((e) => e.kind === 'called_by');
  // ...
  return scored.slice(0, limit).map((s) => s.edge);
}
```

---

### 3.7 Review Engine Orchestrator (`src/review/engine.ts`)

#### Architectural Role & Analog
- **Role:** Main pipeline coordinator connecting all stages: Input validation ➔ DAG Execution ➔ Pre-Critic Dedup ➔ Two-Stage Critic ➔ Post-Critic Consolidation ➔ Composite Ranking ➔ Domain `ReviewResult` construction (`D-16`).
- **Closest Analog:** [`src/analysis/orchestrator.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.ts:39-148) and [`src/intelligence/context/engine.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/context/engine.ts:38-89).
- **Patterns Followed:**
  1. Structured Pino logger instantiation with child module scope (`createLogger('review/engine')`).
  2. Start-to-finish timing metrics collection (`durationMs = Date.now() - startTime`).
  3. Token usage accumulation across all reviewer and critic model calls (`promptTokens`, `completionTokens`, `totalTokens`).
  4. Summary aggregation: findings count grouped by severity, by category, and by reviewer.
  5. Deterministic SHA256 ID generation for each ranked finding (`crypto.createHash('sha256').update(...)`).

#### Concrete Code Excerpt from Analog (`src/analysis/orchestrator.ts`)
```typescript
// From src/analysis/orchestrator.ts:12-28, 126-147
const log = createLogger('analysis/orchestrator');

const totalTimeMs = Date.now() - totalStartTime;

const metrics = {
  totalFiles: files.length,
  parsedFiles: parseResult.files.length,
  symbolCount: allSymbols.length,
  diagnosticCount: diagnosticsResult.diagnostics.length,
  parseTimeMs: parseResult.totalTimeMs,
  diagnosticsTimeMs: diagnosticsResult.totalTimeMs,
  totalTimeMs,
};

log.info(metrics, 'Analysis complete');

return {
  parsedFiles: parseResult.files,
  symbols: allSymbols,
  diagnostics: diagnosticsResult.diagnostics,
  errors: parseResult.errors,
  metrics,
};
```

---

### 3.8 Configuration & CLI Integration (`src/config/schema.ts` & `src/commands/review.ts`)

#### Modifications Needed:
1. **`src/config/schema.ts`:**
   Add `minConfidence` to `ReviewConfigSchema`:
   ```typescript
   export const ReviewConfigSchema = z.object({
     severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).default('medium'),
     maxFindings: z.number().int().positive().max(100).default(50),
     minConfidence: z.number().min(0).max(1).default(0.6),
   });
   ```

2. **`src/commands/review.ts`:**
   At line 198-316 in `executeReview`: Replace the temporary placeholder `ReviewResult` object with an instantiation of `ReviewEngine` and invocation of `reviewEngine.run(input)`. Pass `analysis.diagnostics`, `referenceGraph`, `symbolIndex`, `reviewContext`, `LocalNvidiaProvider`, and `config.review`.

---

## 4. Testing Patterns & Mock Architectures

### 4.1 Test Conventions in Octate
The repository uses Jest with native ESM (`NODE_OPTIONS=--experimental-vm-modules jest`) and strict `@jest/globals` imports:
- All imports within tests must include `.js` extension.
- Imports must use explicit named bindings from `@jest/globals` (`describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest`).
- Test files live adjacent to the implementation file (e.g. `src/review/dag.ts` ➔ `src/review/dag.test.ts`).

### 4.2 Mock Review Model Pattern
To test the Review DAG, Critic stage, and Review Engine without real HTTP/network calls to the NVIDIA API, implement a controllable in-memory `MockReviewModel`:

```typescript
// Test fixture pattern for src/review/*.test.ts
import type { ModelRequest, ModelResponse, ReviewModel } from '../model/types.js';

export class MockReviewModel implements ReviewModel {
  private handlers: Map<string, (req: ModelRequest) => Promise<ModelResponse>> = new Map();
  public calls: ModelRequest[] = [];

  public setHandler(
    taskKeyword: string,
    handler: (req: ModelRequest) => Promise<ModelResponse>
  ): void {
    this.handlers.set(taskKeyword.toLowerCase(), handler);
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    this.calls.push(request);
    const task = request.reviewTask.toLowerCase();

    for (const [key, handler] of this.handlers.entries()) {
      if (task.includes(key)) {
        return handler(request);
      }
    }

    return {
      findings: [],
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    };
  }
}
```

### 4.3 Test Suite Verification Matrix

| Test Suite | Target Module | Core Test Scenarios |
|:---|:---|:---|
| `heuristics.test.ts` | `src/review/heuristics.ts` | • Triggers Semantic when function/method AST lines overlap diff<br>• Does NOT trigger Semantic for markdown/docs or pure comments<br>• Triggers Security on keywords (`auth`, `token`, `exec`, `jwt`)<br>• Triggers Security when `package.json` changes<br>• Filters out `@deprecated` or test mock intentionality markers |
| `dag.test.ts` | `src/review/dag.ts` | • Runs Structural Reviewer baseline unconditionally<br>• Conditionally runs Semantic and Security reviewers based on triggers<br>• Respects bounded concurrency limit (pool of 2)<br>• Slices compiler diagnostics to Structural and security advisories to Security<br>• Gracefully degrades on single reviewer failure with warning in metadata<br>• Fails fast with `ModelError` if ALL triggered reviewers fail |
| `dedup.test.ts` | `src/review/dedup.ts` | • Clusters findings on overlapping line intervals in same file<br>• Clusters findings sharing same enclosing AST symbol and category<br>• Escalates severity to maximum in duplicate cluster (`high` + `critical` ➔ `critical`)<br>• Selects maximum confidence score in cluster<br>• Unifies evidence items and caps at 5<br>• Aggregates contributing reviewers (`['structural', 'semantic']`) |
| `critic.test.ts` | `src/review/critic.ts` | • Stage 3A drops ungrounded file paths and phantom line numbers<br>• Stage 3A drops findings with `confidence < minConfidence` (default 0.6)<br>• Stage 3A drops findings with empty evidence (`evidence: []`)<br>• Stage 3A drops non-actionable suggestions (`"fix this"`, `< 15` chars)<br>• Skips Critic LLM call when 0 findings survive Stage 3A<br>• Retries once on invalid JSON response<br>• Fails fast with `ModelError` (exit code 4) if Critic fails after retry |
| `ranking.test.ts` | `src/review/ranking.ts` | • Calculates composite score matching exact weights: $0.30 S + 0.20 C + 0.15 E + 0.15 B + 0.10 SI + 0.10 RP$<br>• Calculates blast radius from `ReferenceGraph` callers/importers logarithmic curve<br>• Calculates evidence strength (quantity, multi-file diversity bonus, specificity bonus)<br>• Filters findings below `minSeverity`<br>• Truncates non-critical findings at `maxFindings`<br>• **Never truncates Critical findings** regardless of `maxFindings` cap |
| `engine.test.ts` | `src/review/engine.ts` | • End-to-end review lifecycle with `MockReviewModel`<br>• Emits complete `ReviewResult` with `summary`, `findings`, and `metadata`<br>• Calculates correct token totals and durations<br>• Gracefully handles empty diffs and zero findings<br>• Propagates `AbortSignal` cancellation promptly |

---

## 5. Cross-Cutting Architectural Conventions

### 5.1 Error Hierarchy & Exit Codes

All errors thrown in Layer 5 must inherit from `OctateError` (`src/errors/index.ts`):

```typescript
// From src/errors/index.ts:5-19
const errorCodes = {
  configuration: 2,
  repository: 3,
  git: 3,
  parse: 3,
  analysis: 3,
  context: 3,
  model: 4,               // Exit code 4: Model provider / Critic fail-fast
  providerRateLimit: 4,
  providerTimeout: 4,
  authentication: 4,
  quotaExceeded: 4,
  validation: 5,          // Exit code 5: Internal data validation errors
  internal: 5,
} as const;
```

- **Critic Failure Quality Gate (`D-07`):** Throw `ModelError` (exit code 4) if Critic model invocation fails or cannot be repaired after retry.
- **Unexpected Internal State:** Throw `InternalError` (exit code 5) or `ValidationError` (exit code 5).
- **Graceful Reviewer Degradation (`D-03`):** Reviewer errors in the DAG are **caught, not rethrown** (unless all reviewers fail). They are converted into string warnings in `ReviewResult.metadata.warnings`.

### 5.2 Structured Logging Standards
- Instantiate a child logger with module context:
  ```typescript
  import { createLogger } from '../logging/index.js';
  const log = createLogger('review/dag');
  ```
- Use structured JSON logging bindings rather than string interpolation:
  ```typescript
  // CORRECT
  log.info({ reviewer: 'structural', findingCount: findings.length }, 'Reviewer completed');

  // INCORRECT
  log.info(`Reviewer structural completed with ${findings.length} findings`);
  ```
- **Zero console.log**: Layer 5 must not emit anything to `console.log` or `process.stdout`.

### 5.3 Cancellation Propagation
Every async operation in the review pipeline must accept an optional `AbortSignal`.
- Check signal before initiating stages:
  ```typescript
  signal?.throwIfAborted();
  ```
- Pass signal into `ReviewModel.generate(request)` or race against `abortSignalPromise(signal)` (`src/cancellation/controller.ts`).

### 5.4 Untrusted Data Demarcation
- Diffs and context snippets under review are passive data.
- Always use `serializePromptContext(request)` (`src/intelligence/context/serializer.ts`) which enforces meta-policy sandwich framing, untrusted code fences with prefixed line numbers, and strict non-override reminders.

---

## 6. Anti-Patterns & Pitfalls to Avoid

| Anti-Pattern | Standard Pattern | Why It Matters in Layer 5 |
|:---|:---|:---|
| **Unconditional 3-way parallel fan-out** | Staged DAG with deterministic heuristic triggers (`D-01`, `D-02`). | Avoids wasting thousands of tokens and latency on security/semantic prompts for diffs containing no executable AST logic or security patterns. |
| **Aborting whole review on single reviewer crash** | Graceful reviewer degradation (`D-03`): append warning to `metadata.warnings`, retain surviving findings. | Ensures the developer still receives high-value feedback from surviving reviewers rather than an unhelpful CLI crash. |
| **Sending ungrounded findings directly to Critic** | Two-stage Critic filter (`D-05`, `D-06`): run Stage 3A deterministic hard floor first. | Purges hallucinated files, phantom line numbers, and low-confidence findings before burning tokens on `critic.v1`. |
| **Swallowing Critic failures or bypassing Critic** | Fail-fast with `ModelError` (exit code 4) after 1 schema repair retry (`D-07`). | Ensures developers are never shown raw, hallucinated, or uncurated candidate findings. |
| **Dedup by exact title or file only** | Multi-factor matching (`D-09`): line interval overlap, enclosing AST symbol, or normalized signature. | Different reviewers express identical defects with different wording (e.g. "Unchecked null pointer" vs "Possible TypeError on user"). |
| **Unbounded evidence accumulation** | Union unique `file:startLine-endLine` pointers, capped at top 5 (`D-11`). | Prevents duplicate clusters from generating 20+ evidence items that overflow the terminal viewport in Layer 7. |
| **Arbitrary or unweighted scoring** | Normalized 0–100 composite formula with explicit weights (`D-13`) and ReferenceGraph blast radius (`D-14`). | Prevents low-severity pedantic findings with 1.0 confidence from outranking severe architectural regressions. |
| **Hard truncation of Critical findings** | Critical-protected truncation (`D-15`): critical findings are exempt from `maxFindings` cap. | Critical vulnerabilities and data corruption hazards must NEVER be hidden from the developer. |

---

## PATTERN MAPPING COMPLETE

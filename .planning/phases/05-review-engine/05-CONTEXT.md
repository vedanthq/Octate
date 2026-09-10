# Phase 5: Review Engine - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The Review Engine executes the review reasoning pipeline: orchestrating the Review DAG (Structural Reviewer, Semantic Reviewer, and Security Reviewer), filtering candidate findings through a Senior Staff Critic stage, deduplicating overlapping findings, and calculating composite confidence-weighted rankings to produce the authoritative `ReviewResult` domain object.

In scope:
- Staged Review DAG orchestration (Structural → conditional Semantic & Security)
- Two-stage Critic pipeline (deterministic grounding/confidence gate + `critic.v1` LLM evaluation)
- Two-phase finding deduplication (pre-Critic syntactic clustering + post-Critic consolidation) with evidence merging
- Composite ranking formula (severity, confidence, evidence strength, blast radius, security impact, regression probability) with Critical-protected `maxFindings` truncation
- Authoritative `ReviewResult` domain model

Out of scope:
- Interactive TUI components or terminal renderers (Phase 7)
- End-to-end CLI command wiring and exit code handling (Phase 6)
- Model provider integration and prompt template parsing (already delivered in Phase 4)
- Context engine and symbol indexing (already delivered in Phase 3)
</domain>

<decisions>
## Implementation Decisions

### Reviewer DAG Concurrency & Execution Topology
- **D-01 (Staged Execution Topology):** Run the Structural Reviewer first as the primary baseline, then evaluate and conditionally execute Semantic and Security reviewers based on code changes rather than running an unconstrained 3-way parallel fan-out.
- **D-02 (Deterministic Reviewer Trigger Heuristic):** Semantic Reviewer runs if executable AST logic (functions, methods, control flow) was modified; Security Reviewer runs if diff or referenced symbols touch security-sensitive patterns (auth, crypto, endpoints, input parsing, secrets, or dependency changes).
- **D-03 (Graceful Reviewer Degradation):** If an individual reviewer encounters a failure or timeout, the DAG degrades gracefully: it logs a warning in `ReviewResult.metadata`, retains findings from all surviving reviewers, and advances to the Critic stage.
- **D-04 (Shared Context with Role-Specialized Diagnostics):** All active reviewers receive the core `ReviewContext` (diff + referenced symbols/callers), but diagnostic slices and task instructions are role-specialized (Structural gets compiler/linter diagnostics; Security gets security-relevant advisories).

### Critic Filtering & Rejection Pipeline
- **D-05 (Two-Stage Critic Filter):** Candidate findings pass through a fast deterministic gate first, dropping ungrounded files/lines, low confidence, or empty evidence before invoking the `critic.v1` model prompt for senior-engineer semantic review and false-positive elimination.
- **D-06 (Configurable Deterministic Hard Floor):** Candidate findings must satisfy strict repository grounding (target file and line ranges exist in repo/diff), have at least 1 verified direct evidence anchor, and meet `minConfidence >= 0.6` (configurable via `octate.yaml`).
- **D-07 (Critic Failure Resilience & Quality Gate):** If the LLM Critic invocation fails, times out, or returns unfixable JSON, attempt one retry with schema repair; if it still fails, fail-fast with `ModelError` (exit code 4) to ensure unverified or uncurated findings never reach the developer.
- **D-08 (Strict Intentionality & Concrete Actionability):** The Critic actively discards findings where code modifications reflect obvious deliberate intent (e.g. deprecations, test mocks) and rejects findings whose `suggestedFix` lacks concrete, code-level remediation.

### Deduplication & Evidence Merging Strategy
- **D-09 (Multi-Factor Duplicate Matching):** Group findings as duplicates if they share: (1) exact file and overlapping line ranges, (2) same enclosing AST symbol and category, or (3) identical issue signature / root-cause keyword.
- **D-10 (Attribute Conflict Resolution):** When merging duplicate findings, escalate to the highest severity (critical > high > medium > low > info), adopt the maximum confidence score, and record all contributing reviewers in finding metadata (`contributingReviewers`).
- **D-11 (Evidence Union & Cap):** Combine evidence items from all duplicate reports, deduplicate identical file/line pointers, and cap at the top 5 most relevant evidence items for clear terminal presentation.
- **D-12 (Two-Phase Deduplication Pipeline):** Perform pre-Critic syntactic clustering to eliminate obvious duplicates and reduce prompt tokens, followed by a post-Critic final deduplication pass to consolidate any newly generated or refined findings.

### Composite Ranking Formula & Output Limits
- **D-13 (Weighted Normalized Composite Score):** Implement `REV-04` using a normalized 0–100 score:
  `CompositeScore = 0.30 * Severity + 0.20 * Confidence + 0.15 * EvidenceStrength + 0.15 * BlastRadius + 0.10 * SecurityImpact + 0.10 * RegressionProbability`
- **D-14 (Deterministic Blast Radius & Evidence Metrics):** Compute blast radius deterministically from caller and dependent counts in `ReferenceGraph`; compute evidence strength from count, diversity, and specificity of verified evidence items.
- **D-15 (Severity Filtering & Critical-Protected Truncation):** Filter out candidate findings below `minSeverity` prior to ranking; sort remaining findings by composite score and cap at `maxFindings`, but never truncate findings of Critical severity.
- **D-16 (Rich ReviewResult Domain Object):** The Review Engine returns an authoritative `ReviewResult` domain model encapsulating ranked findings, scoring breakdowns, summary statistics (by severity, category, and reviewer), execution metadata (tokens, duration, warnings), and review scope.

### the agent's Discretion
- Exact heuristic pattern regexes for security triggers (e.g., matching `jwt`, `crypto`, `auth`, `password`, `req.body`, `exec`).
- Logarithmic scaling factor for `ReferenceGraph` caller counts when computing blast radius (e.g. `min(1.0, log2(callers + 1) / 4)`).
- Specific data structure layout of internal deduplication index for efficient O(N log N) clustering.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Model Contracts & Prompts
- `src/model/abstraction.ts` — Core `ReviewModel` interface, request/response types with trusted/untrusted separation
- `src/model/types.ts` — `ModelFinding`, `ModelEvidence`, `ReviewModel`, and error types
- `src/model/schema/finding.ts` — Zod schema validation for model findings
- `src/model/schema/grounding.ts` — `groundFinding` and `verifyEvidence` functions for repository truth verification
- `src/model/schema/repair.ts` — `validateAndRepairModelResponse` schema repair and fallback parsing
- `src/model/prompts/critic.v1.md` — Senior Staff Critic prompt instructions and role constraints
- `src/model/prompts/reviewer.structural.v1.md` — Structural Reviewer prompt template
- `src/model/prompts/reviewer.semantic.v1.md` — Semantic Reviewer prompt template
- `src/model/prompts/reviewer.security.v1.md` — Security Reviewer prompt template

### Intelligence & Repository Context
- `src/intelligence/index.ts` — Context engine public API (`buildReviewContext`, `serializePromptContext`)
- `src/intelligence/reference-graph.ts` — `ReferenceGraph` API for caller/callee traversal and blast radius computation
- `src/intelligence/types.ts` — `ReviewContext`, `SymbolIndex`, and graph types
- `src/config/schema.ts` — `OctateConfigSchema` including `review.maxFindings`, `review.minSeverity`, `review.minConfidence`

### Concurrency & Infrastructure
- `src/cache/pool.ts` — `createPromisePool` bounded concurrency helper
- `src/cancellation/controller.ts` — `CancellationController` and `withCancellation`
- `src/logging/index.ts` — `createLogger` structured logging utility
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createPromisePool(2)` (`src/cache/pool.ts`): Bounded concurrency pool for scheduling reviewer and critic LLM calls within rate limits.
- `groundFinding` (`src/model/schema/grounding.ts`): Deterministically checks whether candidate findings correspond to actual repository files and valid line ranges.
- `validateAndRepairModelResponse` (`src/model/schema/repair.ts`): Multi-tier JSON extractor and Zod repair mechanism for handling malformed model output.
- `ReferenceGraph` (`src/intelligence/reference-graph.ts`): Provides caller and callee counts for symbols in changed files to compute blast radius scores.
- `CancellationController` (`src/cancellation/controller.ts`): AbortSignal propagation to ensure Ctrl+C cancels in-flight review requests.

### Established Patterns
- **Deterministic Before AI:** Always validate and pre-filter using deterministic code intelligence (Tree-sitter, reference graph, file existence) before invoking LLM reasoning.
- **Untrusted Source Separation:** Repository diffs and code contexts are treated as untrusted data in all prompt requests.
- **Typed Error Hierarchy:** All errors inherit from `OctateError` with specific exit codes (Exit code 4 for model failures, exit code 5 for internal errors).
- **Domain Object Purity:** Review Engine components are pure TypeScript/Node.js ES modules with zero terminal UI dependencies.

### Integration Points
- `src/review/index.ts`: Public API export for the Review Engine module.
- `src/review/engine.ts`: Main `ReviewEngine` orchestrator class coordinating the pipeline.
- `src/review/dag.ts`: Reviewer DAG scheduling Structural, Semantic, and Security reviewers.
- `src/review/critic.ts`: Deterministic pre-filtering and Critic stage orchestration.
- `src/review/dedup.ts`: Syntactic and semantic finding deduplication and evidence merging.
- `src/review/ranking.ts`: Multi-factor composite ranking and Critical-protected truncation.
- `src/review/types.ts`: Domain models (`ReviewResult`, `RankedFinding`, `ReviewSummary`, `ExecutionMetadata`).
- `src/commands/review.ts:191`: `executeReview()` integration point connecting CLI command to `ReviewEngine`.
</code_context>

<specifics>
## Specific Ideas
- Never drop a Critical finding even when `maxFindings` cap is reached — surface all critical security and correctness flaws to the developer.
- Pre-Critic deduplication drastically cuts down prompt token overhead by clustering identical line/symbol reports before calling `critic.v1`.
- Contributing reviewers list (e.g. `["structural", "semantic"]`) provides rich attribution in the future TUI.
</specifics>

<deferred>
## Deferred Ideas
- Interactive explain/fix loop (`octate fix <id>`) — deferred to v2 (`FIX-01`).
- Suppression learning (`octate suppress <id>`) — deferred to v2 (`RULES-02`).
- Blast radius graph visualization in TUI — deferred to Phase 7.
</deferred>

---

*Phase: 05-Review Engine*
*Context gathered: 2026-09-10*

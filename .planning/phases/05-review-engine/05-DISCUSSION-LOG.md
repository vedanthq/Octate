# Phase 05: Review Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10
**Phase:** 05-Review Engine
**Areas discussed:** Reviewer DAG Concurrency & Execution Topology, Critic Filtering & Rejection Pipeline, Deduplication & Evidence Merging Strategy, Composite Ranking Formula & Output Limits

---

## Reviewer DAG Concurrency & Execution Topology

### Q1: Reviewer Scheduling
| Option | Description | Selected |
|--------|-------------|----------|
| Full parallel fan-out | Run Structural, Semantic, and Security reviewers concurrently via promise pool (concurrency = 2) | |
| Staged execution | Run Structural reviewer first, then run Semantic and Security conditionally based on changed AST nodes or file types | ✓ |
| Selective execution by CLI/config | Run all 3 in parallel by default, but allow users to toggle/filter reviewers via flags or config | |
| You decide | Agent discretion | |

**User's choice:** Staged execution — Run Structural reviewer first, then run Semantic and Security conditionally based on changed AST nodes or file types
**Notes:** Minimizes unnecessary LLM calls when PR changes are limited or non-semantic.

### Q2: Trigger Conditions for Downstream Reviewers
| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic diff & AST heuristic | Semantic runs if executable AST logic changed; Security runs if diff touches security-sensitive patterns (auth, crypto, endpoints, input parsing, secrets, or dependency changes) | ✓ |
| Reviewer recommendation hand-off | Structural reviewer explicitly emits flags in metadata indicating if Semantic or Security analysis is necessary | |
| Path & extension pattern matching | Pure file path matching (api/*, auth/*, routes/*) | |
| You decide | Agent discretion | |

**User's choice:** Deterministic diff & AST heuristic — Semantic runs if executable AST logic changed; Security runs if diff touches security-sensitive patterns (auth, crypto, endpoints, input parsing, secrets, or dependency changes)
**Notes:** Leverages deterministic Tree-sitter AST nodes and diff patterns before spending AI tokens.

### Q3: Reviewer Failure Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Graceful degradation with diagnostic warning | Continue with surviving reviewer findings, log a warning in ReviewResult metadata, and advance to Critic stage | ✓ |
| Fail-fast abort | Halt review pipeline immediately with ModelError (exit code 4) | |
| Retry with trimmed context | Automatically retry the failed reviewer once with reduced token budget | |
| You decide | Agent discretion | |

**User's choice:** Graceful degradation with diagnostic warning — Continue with surviving reviewer findings, log a warning in ReviewResult metadata, and advance to Critic stage
**Notes:** Preserves user value when one reviewer hits a transient failure or rate limit.

### Q4: Context Partitioning
| Option | Description | Selected |
|--------|-------------|----------|
| Shared core context with role-specialized diagnostics | All reviewers share primary ReviewContext (diff + key symbols/callers), but diagnostic slices and task prompts are tailored | ✓ |
| Uniform context across all reviewers | Exact same serialized context payload to every reviewer | |
| Fully partitioned context | Run custom ranking passes to generate completely disjoint context slices | |
| You decide | Agent discretion | |

**User's choice:** Shared core context with role-specialized diagnostics — All reviewers share primary ReviewContext (diff + key symbols/callers), but diagnostic slices and task prompts are tailored
**Notes:** Efficient context reuse while maintaining role specialization.

---

## Critic Filtering & Rejection Pipeline

### Q1: Critic Pipeline Architecture
| Option | Description | Selected |
|--------|-------------|----------|
| Two-stage filter (Deterministic hard floor first, then LLM Critic) | Drop ungrounded findings, invalid line ranges, or empty evidence deterministically first, then invoke critic.v1 model | ✓ |
| Single-stage LLM Critic | Feed all candidate findings directly to the critic.v1 prompt | |
| Pure deterministic filter with heuristic rules | Use code grounding, confidence floor, and heuristic rule filters without an additional LLM Critic invocation | |
| You decide | Agent discretion | |

**User's choice:** Two-stage filter: Deterministic hard floor first, then LLM Critic — Drop ungrounded findings, invalid line ranges, or empty evidence deterministically first, then invoke critic.v1 model for deep semantic verification
**Notes:** Fast deterministic rejection prevents wasting LLM tokens on hallucinated or unanchored findings.

### Q2: Deterministic Pre-Filter Criteria
| Option | Description | Selected |
|--------|-------------|----------|
| Configurable threshold with strict default | Default to strict grounding (file/lines exist in repo/diff), non-empty evidence, and confidence >= 0.6, overridable via octate.yaml | ✓ |
| Hardcoded strict floor | Always require 100% verified grounding, >= 1 direct evidence anchor, and confidence >= 0.7 without config overrides | |
| Permissive floor | Only verify file existence and schema validity; let confidence < 0.5 through | |
| You decide | Agent discretion | |

**User's choice:** Configurable threshold with strict default — Default to strict grounding (file and lines exist in diff/repo), non-empty evidence list, and confidence >= 0.6, overridable via octate.yaml
**Notes:** High baseline quality with user extensibility.

### Q3: Critic Stage Failure Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to deterministically-passed candidates with warning | Fall back to pre-filtered candidate pool and annotate results with warning | |
| Retry once with schema repair, then fail-fast | Attempt one retry with repair prompt; if it still fails, throw ModelError to prevent uncurated findings from reaching user | ✓ |
| Discard all unverified findings | Return empty finding set with prominent error | |
| You decide | Agent discretion | |

**User's choice:** Retry once with schema repair, then fail-fast — Attempt one retry with repair prompt; if it still fails, throw ModelError to prevent uncurated findings from reaching the user
**Notes:** Protects Octate's reputation for high-signal, senior-engineer validated results.

### Q4: Intentionality and Actionability Evaluation
| Option | Description | Selected |
|--------|-------------|----------|
| Strict intentionality & concrete actionability | Discard intentional pattern changes (e.g. deliberate API deprecations, test mocks) and reject findings with vague/hand-wavy suggestedFixes without concrete code snippets | ✓ |
| Fact-check only | Only eliminate findings with factual contradictions; allow general suggestions | |
| Test-awareness filter | Critic specifically checks if existing test files already cover the scenario | |
| You decide | Agent discretion | |

**User's choice:** Strict intentionality & concrete actionability — Discard intentional pattern changes (e.g. deliberate API deprecations, test mocks) and reject findings with vague/hand-wavy suggestedFixes without concrete code snippets
**Notes:** Eliminates noisy, pedantic, or non-actionable suggestions.

---

## Deduplication & Evidence Merging Strategy

### Q1: Duplicate Criteria
| Option | Description | Selected |
|--------|-------------|----------|
| Multi-factor hierarchy | Match on (1) exact file + overlapping line range, (2) same enclosing AST symbol + category, or (3) identical issue signature / root-cause keyword | ✓ |
| Strict line range intersection only | Only merge if findings target exact same file and line intervals overlap | |
| LLM-only semantic grouping | Rely entirely on LLM Critic to group duplicates | |
| You decide | Agent discretion | |

**User's choice:** Multi-factor hierarchy — Match on (1) exact file + overlapping line range, (2) same enclosing AST symbol + category, or (3) identical issue signature / root-cause keyword
**Notes:** Catches both line-level collisions and multi-reviewer reports on the same function/defect.

### Q2: Duplicate Attribute Conflict Resolution
| Option | Description | Selected |
|--------|-------------|----------|
| Escalate to max severity, max confidence, and union reviewers | Take highest severity (critical > high > medium > low > info), highest confidence, and record all contributing reviewers in metadata | ✓ |
| Critic authoritative re-scoring | Pass cluster to Critic to establish unified severity, category, and confidence | |
| Winner-takes-all by confidence | Pick single finding with highest confidence score | |
| You decide | Agent discretion | |

**User's choice:** Escalate to max severity, max confidence, and union reviewers — Take highest severity (critical > high > medium > low > info), highest confidence, and record all contributing reviewers in metadata
**Notes:** Conservative escalation ensures severe threats are not diluted when multiple reviewers report them.

### Q3: Evidence Merging
| Option | Description | Selected |
|--------|-------------|----------|
| Union and deduplicate evidence with a sensible cap | Union evidence items from all duplicate reports, deduplicate identical file/line pointers, and cap at 5 most relevant evidence items for clean TUI presentation | ✓ |
| Unbounded union of all evidence | Combine every evidence item without limits | |
| Primary finding evidence only | Discard evidence from duplicate reports | |
| You decide | Agent discretion | |

**User's choice:** Union and deduplicate evidence with a sensible cap — Union evidence items from all duplicate reports, deduplicate identical file/line pointers, and cap at 5 most relevant evidence items for clean TUI presentation
**Notes:** Provides rich evidence context without bloating terminal screens.

### Q4: Deduplication Pipeline Placement
| Option | Description | Selected |
|--------|-------------|----------|
| Two-phase deduplication (Pre-Critic clustering + Post-Critic final pass) | Cluster obvious syntactic/symbol duplicates before Critic to minimize prompt tokens, then run final deduplication after Critic filtering | ✓ |
| Post-Critic deduplication only | Let Critic see all raw candidates and deduplicate as final step | |
| Pre-Critic deduplication only | Deduplicate candidate findings immediately after reviewer DAG completes | |
| You decide | Agent discretion | |

**User's choice:** Two-phase deduplication (Pre-Critic clustering + Post-Critic final pass) — Cluster obvious syntactic/symbol duplicates before Critic to minimize prompt tokens, then run final deduplication after Critic filtering
**Notes:** Saves token budget for the Critic prompt while guaranteeing zero duplicates in the final output.

---

## Composite Ranking Formula & Output Limits

### Q1: Ranking Calculation Formula
| Option | Description | Selected |
|--------|-------------|----------|
| Weighted normalized composite score (0-100) | Weighted linear sum: Severity (30%), Confidence (20%), Evidence Strength (15%), Blast Radius (15%), Security Impact (10%), Regression Probability (10%), ensuring balanced, tunable ranking | ✓ |
| Lexicographical priority tiers | Group strictly by Severity first; rank within tier by sub-score | |
| Multiplicative composite formula | Compute product of all dimensions (heavily penalizes weak dimensions) | |
| You decide | Agent discretion | |

**User's choice:** Weighted normalized composite score (0-100) — Weighted linear sum: Severity (30%), Confidence (20%), Evidence Strength (15%), Blast Radius (15%), Security Impact (10%), Regression Probability (10%), ensuring balanced, tunable ranking
**Notes:** Clear, transparent scoring model that balances severity with evidence and blast radius.

### Q2: Blast Radius and Evidence Strength Computation
| Option | Description | Selected |
|--------|-------------|----------|
| Graph-derived blast radius & verified evidence count | Blast radius calculated deterministically from caller/dependent count in ReferenceGraph; Evidence strength calculated from number and specificity of verified evidence items | ✓ |
| Model-estimated impact scores | Prompt reviewers/critic to emit numerical estimates | |
| Heuristic file-level impact | Blast radius approximated by export status; evidence by diff line vs external anchor | |
| You decide | Agent discretion | |

**User's choice:** Graph-derived blast radius & verified evidence count — Blast radius calculated deterministically from caller/dependent count in ReferenceGraph; Evidence strength calculated from number and specificity of verified evidence items
**Notes:** Grounds ranking metrics in deterministic repository truth rather than LLM guesswork.

### Q3: Output Limits & Truncation Policy
| Option | Description | Selected |
|--------|-------------|----------|
| minSeverity filter → Rank → Top maxFindings with Critical-protection | Filter out findings below minSeverity, sort by composite rank, cap at maxFindings, but never truncate Critical severity findings | ✓ |
| Strict top maxFindings truncation | Filter minSeverity, sort by composite score, and strictly slice [0, maxFindings] regardless of severity | |
| Preserve all in domain result | ReviewEngine produces all valid ranked findings without slicing; defer truncation to renderers | |
| You decide | Agent discretion | |

**User's choice:** minSeverity filter → Rank → Top maxFindings with Critical-protection — Filter out findings below minSeverity, sort by composite rank, cap at maxFindings, but never truncate Critical severity findings
**Notes:** Developers will never miss a critical bug or vulnerability even when the finding cap is exceeded.

### Q4: Authoritative Domain Object Structure
| Option | Description | Selected |
|--------|-------------|----------|
| Rich ReviewResult domain object | Encapsulates ranked findings, scoring breakdown, summary stats (by severity/category/reviewer), execution metadata (tokens, duration, warnings), and scope | ✓ |
| Minimal FindingCollection | Array of ranked findings with basic counts | |
| Comprehensive ExecutionTrace | Include full raw prompts, raw reviewer responses, Critic diff, and candidate pools | |
| You decide | Agent discretion | |

**User's choice:** Rich ReviewResult domain object — Encapsulates ranked findings, scoring breakdown, summary stats (by severity/category/reviewer), execution metadata (tokens, duration, warnings), and scope
**Notes:** Downstream renderers (TUI, SARIF, JSON, Quiet) have full access to structured review data.

---

## the agent's Discretion

- Concrete AST pattern heuristics for triggering Security Reviewer (matching sensitive package imports and AST identifier patterns).
- Reference graph blast radius log-scaling function (`min(1.0, log2(callers + 1) / 4)`).
- Internal deduplication clustering index data structure.

## Deferred Ideas

- None — discussion stayed strictly within Phase 5 boundaries.

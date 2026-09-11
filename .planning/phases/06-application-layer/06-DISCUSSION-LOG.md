# Phase 6: Application Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 06-Application Layer
**Areas discussed:** Blocking Threshold Policy, Progress Streaming Contract, Cancellation & Partial Results, Renderer Architecture & CI Modes

---

## Blocking Threshold Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable failOnSeverity (default: critical) | In octate.yaml, overridable via CLI `--fail-on <severity>` (any finding >= threshold exits 1) | ✓ |
| Strict Critical-only | Exit 1 triggers if and only if >= 1 Critical finding is detected | |
| Composite Score Threshold | Exit 1 triggers if any finding has compositeScore >= 80 | |

**User's choice:** Configurable failOnSeverity (default: critical) in octate.yaml, overridable via CLI --fail-on <severity> (any finding >= threshold exits 1)
**Notes:** Allows flexible enforcement per repository or CI workflow.

| Option | Description | Selected |
|--------|-------------|----------|
| Allow `--fail-on none / off` | CI can run in advisory mode without failing builds | ✓ |
| Require valid severity + `--no-fail` | Add dedicated flag to suppress exit 1 | |
| Disallow disabling exit code 1 | Always fail on blocking findings | |

**User's choice:** Allow --fail-on none / off (or review.failOnSeverity: none) so CI can run in advisory mode without failing builds

| Option | Description | Selected |
|--------|-------------|----------|
| Final ranked findings list (visible findings) | Evaluate blocking status on what the user/SARIF/JSON reports | ✓ |
| Evaluate all pre-truncation findings | Fails CI even if finding was truncated by maxFindings | |
| Evaluate visible findings + pre-truncation warning | Escalate exit code to 1 if pre-truncation findings met criteria | |

**User's choice:** Evaluate blocking status on the final ranked findings list (visible findings) — consistent with what the user/SARIF/JSON reports

| Option | Description | Selected |
|--------|-------------|----------|
| Clear failure summary banner | Print count and severity threshold before exit | ✓ |
| Detailed breakdown | Print each blocking finding's title and location | |
| Silent exit 1 | Rely on exit code and JSON/SARIF output | |

**User's choice:** Clear failure summary banner printing the count and severity threshold (e.g., '❌ Review failed: 2 blocking findings (>= critical)') before exit

---

## Progress Streaming Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Strongly-typed onProgress callback | `onProgress?: (event: ReviewProgressEvent) => void` — simple, pure, wireable to React or spinners | ✓ |
| Typed EventEmitter | UseCase extends EventEmitter emitting 'progress' events | |
| Async Generator | reviewUseCase yields stage events and returns ReviewResult | |

**User's choice:** Strongly-typed onProgress callback: onProgress?: (event: ReviewProgressEvent) => void — simple, pure, easy to wire into React state or terminal spinners

| Option | Description | Selected |
|--------|-------------|----------|
| Structured event | Stage, status (start/progress/complete/error), message, step index/total, and stage payload | ✓ |
| Minimal event | Stage name, human message string, and timestamp only | |
| Full State Snapshot | Emits complete snapshot of all stage results accumulated so far | |

**User's choice:** Structured event with stage, status (start | progress | complete | error), message, step index/total, and stage-specific payload (e.g., toolCount, activeReviewer)

| Option | Description | Selected |
|--------|-------------|----------|
| Silence progress in --quiet, --json, --sarif | Write progress to stderr in standard terminal mode | ✓ |
| NDJSON progress to stderr in --json/--sarif | When --verbose is active | |
| Write progress to stdout in all modes | Except --json/--sarif | |

**User's choice:** Silence progress in --quiet, --json, and --sarif (to keep stdout strictly parseable); write progress to stderr in standard terminal mode

| Option | Description | Selected |
|--------|-------------|----------|
| Exact 8 typed canonical stages from roadmap | git:read, index:update, symbols:resolve, diagnostics:collect, context:build, review:dag, review:critic, review:rank | ✓ |
| 4 coarse stages | repository, analysis, context, review | |
| Open-ended string stages | Defined at runtime by subcomponents | |

**User's choice:** Exact 8 typed canonical stages from roadmap: git:read, index:update, symbols:resolve, diagnostics:collect, context:build, review:dag, review:critic, review:rank

---

## Cancellation & Partial Results

| Option | Description | Selected |
|--------|-------------|----------|
| Clean immediate exit with code 130 | Standard SIGINT exit code, aborting fetches and killing process trees cleanly | ✓ |
| Exit with Octate internal error exit code | Throwing a typed CancellationError | |
| Interactive prompt on Ctrl+C | Ask whether to view partial findings | |

**User's choice:** Clean immediate exit with code 130 (standard SIGINT exit code), aborting in-flight fetches and killing process trees cleanly without prompt

| Option | Description | Selected |
|--------|-------------|----------|
| Concise notice to stderr | Print `\n⚠️ Review cancelled by user.` in standard mode; silent in --quiet, --json, --sarif | ✓ |
| Print notice across all modes | Including --json and --sarif | |
| Output partial JSON/SARIF | With metadata flag 'status: cancelled' | |

**User's choice:** Print a concise '\n⚠️ Review cancelled by user.' to stderr in standard terminal mode; stay completely silent in --quiet, --json, and --sarif modes

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve already-written atomic cache entries | Re-running resumes faster with warm cache | ✓ |
| Roll back and delete cache entries | Delete entries written during interrupted run | |
| Write cache entries only at the end | Defer all writes until pipeline succeeds | |

**User's choice:** Preserve already-written atomic cache entries for completed files/tools — re-running resumes faster with warm cache

| Option | Description | Selected |
|--------|-------------|----------|
| Double Ctrl+C force-kills immediately | First SIGINT triggers graceful abort; second SIGINT exits immediately with process.exit(130) | ✓ |
| Ignore second SIGINT | Let graceful cleanup finish within 3-second safety window | |
| Prompt on second SIGINT | Ask to force kill | |

**User's choice:** Double Ctrl+C force-kills immediately: first SIGINT triggers graceful abort & process cleanup; second SIGINT exits immediately with process.exit(130)

---

## Renderer Architecture & CI Modes

| Option | Description | Selected |
|--------|-------------|----------|
| ReviewRenderer interface | Separate implementations (JsonRenderer, SarifRenderer, QuietRenderer, ConsoleRenderer) | ✓ |
| Standalone formatter functions | In src/formatters/ returning formatted strings | |
| Single monolithic formatOutput helper | In src/commands/review.ts | |

**User's choice:** ReviewRenderer interface with separate implementations (JsonRenderer, SarifRenderer, QuietRenderer, ConsoleRenderer) — swappable contract ready for Phase 7 TUI

| Option | Description | Selected |
|--------|-------------|----------|
| Full SARIF v2.1.0 via node-sarif-builder | Driver metadata, category rules, severity-to-level mapping, physical locations, relatedLocations | ✓ |
| Minimal SARIF | File, line, and message only without rules catalog | |
| Hand-rolled JSON structure | Adhering to basic SARIF schema | |

**User's choice:** Full SARIF v2.1.0 via node-sarif-builder: driver metadata, category rules, severity-to-level mapping (error/warning/note), physical locations, and relatedLocations for evidence

| Option | Description | Selected |
|--------|-------------|----------|
| One line per finding with final count | `file:line: [SEVERITY] title`; totally silent if 0 findings (exit 0) | ✓ |
| Strictly silent (zero stdout/stderr) | Relying solely on exit code (0 or 1) | |
| Summary line only | Without listing individual findings | |

**User's choice:** One line per finding (file:line: [SEVERITY] title) with a final count summary line; totally silent if 0 findings (exit 0)

| Option | Description | Selected |
|--------|-------------|----------|
| Write output directly to file | Print brief confirmation to stderr: 'Wrote results to <file>' | ✓ |
| Write to file and mirror to stdout | Duplicate output to terminal | |
| Write to file completely silently | No stderr notice | |

**User's choice:** Write output directly to file (creating directories if needed), and print brief confirmation to stderr: 'Wrote results to <file>'

---

## the agent's Discretion

- CLI spinner animation styling in standard non-TUI terminal mode.
- ConsoleRenderer formatting details (colors, boxes, score breakdown).
- Internal mapping of error codes to exit codes in `src/errors/index.ts` and `src/cli.ts`.

## Deferred Ideas

- Interactive React/Ink TUI workspace — Phase 7.
- Agentic fix workflows (`octate fix`) — deferred to v2.
- Suppression learning (`octate suppress`) — deferred to v2.

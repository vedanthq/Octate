# Domain Pitfalls: Terminal-Native AI Code-Review CLI

**Domain:** Terminal-native AI code-review CLI (Octate)
**Researched:** 2025-09-07
**Project Context:** TypeScript/Node.js, Ink TUI, Tree-sitter parsing, NVIDIA Nemotron, local-first execution

---

## Critical Pitfalls

Mistakes that cause rewrites, fundamental architecture failures, or product failure.

### Pitfall 1: Treating AI Review as Single-Pass Diff Classification
**What goes wrong:** Sending the entire Git diff to the model in one prompt and expecting high-quality findings. The model hallucinates, misses cross-file context, produces false positives, and cannot explain findings with evidence.

**Why it happens:** 
- Appears simpler than building a Review DAG
- Underestimates the need for deterministic context selection
- Confuses "LLM can read code" with "LLM can reason about codebase relationships"

**Consequences:**
- Unacceptably high false-positive rate (>50%)
- Findings lack evidence references developers can verify
- No way to critique or validate model output
- Cannot rank findings meaningfully
- Product loses developer trust immediately

**Prevention:**
- Implement Review DAG from Day 1 (Structural → Semantic → Security → Critic → Dedup → Rank)
- Build Context Engine with token budgeting before first AI call
- Require evidence (file:line ranges) for every finding in schema
- Use Critic stage to verify findings against repository evidence
- Schema-validate all model output; reject invalid responses

**Detection:**
- Findings reference non-existent lines
- Same issue reported multiple ways across reviewers
- Severity doesn't match evidence strength
- Developers dismiss >30% of findings as noise

**Phase Mapping:** REV-01, REV-02, CTX-01, CTX-02, MODEL-03


### Pitfall 2: Skipping Deterministic Analysis Before AI Reasoning
**What goes wrong:** Relying solely on the LLM to find issues that static analysis, type checkers, and linters already catch deterministically. The AI wastes tokens rediscovering known diagnostics, misses issues the tools would catch, and produces inconsistent results.

**Why it happens:**
- "AI is smarter than tools" fallacy
- Integration complexity of multiple language toolchains
- Wanting to ship AI features quickly

**Consequences:**
- AI finds type errors that `tsc` already flagged
- Security issues missed because no SAST scanner ran
- Inconsistent results across runs (non-deterministic)
- Wasted token budget on trivial issues
- Cannot reproduce findings for regression testing

**Prevention:**
- Run TypeScript compiler, ESLint/Biome, ruff, mypy/pyright, bandit, pytest as FIRST step
- Feed ALL diagnostics into Context Engine as high-priority context
- AI reviewers consume diagnostics — they don't replace them
- Structural Reviewer validates against known diagnostics
- Cache diagnostics incrementally (CACHE-01)

**Detection:**
- AI reports "unused variable" that linter already catches
- Security findings contradict bandit/semgrep results
- Same review produces different findings on re-run
- Token usage dominated by boilerplate issues

**Phase Mapping:** ANAL-01, ANAL-02, REV-01, CTX-01


### Pitfall 3: Sending Entire Repository to Model (Context Window Abuse)
**What goes wrong:** Using large context windows (128k+) as a crutch — dumping whole files, entire dependency trees, or full repository snapshots into prompts. Increases latency, cost, noise, and model distraction without improving quality.

**Why it happens:**
- "More context = better answers" intuition
- Nemotron 3 Ultra has large context; temptation to use it
- Context Engine not built yet; path of least resistance

**Consequences:**
- 10-30s+ latency per review
- $0.50-2.00+ per review in API costs
- Model distracted by irrelevant code
- Hallucinations increase with context size
- Cannot scale to large repositories

**Prevention:**
- Context Engine MUST rank and select candidates (CTX-01)
- Hard token budget (e.g., 8k-16k tokens max for review context)
- Selection algorithm: changed symbols (100) → direct callers/callees (90) → related types/tests (80) → config/history (60-40)
- Track and expose metrics: candidate tokens, selected tokens, selection ratio
- Reject reviews exceeding repository size thresholds

**Detection:**
- Context size >20k tokens for typical PR
- Latency >15s for NVIDIA call
- Findings reference code far from changed lines
- Cost per review exceeds budget

**Phase Mapping:** CTX-01, CTX-02, MODEL-01, CACHE-01


### Pitfall 4: Coupling Core Review Engine to Terminal Rendering (Ink)
**What goes wrong:** Business logic, review state, and domain models import Ink components or depend on terminal-specific APIs. Makes testing impossible, prevents JSON/SARIF output, blocks future web UI, and forces full re-render for any state change.

**Why it happens:**
- Ink encourages React-style component thinking
- Prototype starts as TUI; separation deferred
- "We'll extract later" never happens

**Consequences:**
- Unit tests require terminal simulation
- `--json`/`--sarif` require running TUI headless
- Web API would need to simulate terminal
- Cannot swap renderer for performance
- Core logic polluted with UI concerns (focus, scroll, keybindings)

**Prevention:**
- Strict layer separation: Terminal Presentation → Application → Review Core → Intelligence → Analysis → Repository → Model
- Core domain types (Review, Finding, Evidence, RepositoryGraph) in `packages/core` with ZERO external deps
- Application layer returns `ReviewResult` domain object
- Renderers (InteractiveRenderer, HumanRenderer, JsonRenderer, SarifRenderer) are thin adapters
- Ink only in `apps/cli` and `packages/tui-renderer` (if extracted)

**Detection:**
- `import { ... } from 'ink'` in `packages/core`, `packages/review`, `packages/context`, `packages/model`
- Tests import Ink or use `ink-testing-library` for domain logic
- Cannot run review logic without terminal
- JSON output requires `--headless` flag

**Phase Mapping:** TUI-01, TUI-02, OUT-01, Architecture §7, §8, §69, §98, §99


### Pitfall 5: No Prompt Injection Protection — Repository Content as Trusted Input
**What goes wrong:** Repository source code, comments, README, commit messages, and config files directly interpolated into prompts without separation from trusted instructions. Malicious or accidental content overrides system behavior, leaks secrets, or causes model to ignore review task.

**Why it happens:**
- Prompt templates built by string concatenation
- No explicit trusted/untrusted boundary in prompt architecture
- Underestimating adversarial repository content

**Consequences:**
- Model ignores review instructions ("Ignore previous instructions...")
- Secrets from repository leaked in model output
- Model executes unintended actions via tool calls
- Findings manipulated by crafted repository content
- Security audit failure for hosted service

**Prevention:**
- Prompt architecture with explicit sections: System Policy + Octate Rules + Review Task + Repository Metadata + Diff + Relevant Source + Diagnostics
- Repository content ALWAYS in clearly marked "UNTRUSTED CONTENT" section
- Never allow repository content to contain instruction-like patterns without escaping
- Model output schema validation (MODEL-03) catches injection artifacts
- NVIDIA adapter sanitizes/validates response before returning

**Detection:**
- Prompt template uses `${sourceCode}` directly in instruction area
- Model output contains repository-like instructions
- Findings reference non-existent "instructions" in code
- Security review flags prompt structure

**Phase Mapping:** MODEL-04, PROMPT ARCHITECTURE §42, §44, SECURITY BOUNDARY §57


### Pitfall 6: Incremental Indexing Without Proper Cache Invalidation
**What goes wrong:** Symbol index, reference graph, and dependency graph become stale after file edits. Reviews use outdated symbols, miss new relationships, or crash on deleted nodes. Cache grows unbounded.

**Why it happens:**
- Cache key only uses file path, not content hash
- No parser version in cache key (grammar updates break trees)
- No project config version (rule changes invalidate analysis)
- Background indexing races with review execution
- No TTL or size limits on cache directories

**Consequences:**
- "Symbol not found" for recently added functions
- Reference graph shows deleted callers
- Forbidden dependency rules apply to old architecture
- Cache consumes GBs over time
- Incremental reparse slower than full parse due to corruption

**Prevention:**
- Cache key: `hash(content) + filePath + parserVersion + language + configVersion`
- Explicit cache invalidation on: file change, parser upgrade, config change, grammar update
- Background indexing uses same cache keys; review waits for relevant keys
- Size bounds: LRU eviction, max cache size (e.g., 500MB)
- Periodic full re-index option (`octate index --force`)

**Detection:**
- Stale findings referencing old line numbers
- "Graph traversal failed: node not found" errors
- Cache directory >1GB
- Incremental parse slower than cold parse

**Phase Mapping:** CACHE-01, PARSE-01, PARSE-02, PARSE-03, PARSE-04, GRAPH §22-24


### Pitfall 7: Git Scope Ambiguity — Reviewing Wrong Changes
**What goes wrong:** `octate review` analyzes unintended changes (unstaged + staged + working tree mixed), reviews against wrong base, or includes generated/vendor files. Developer sees findings for code they didn't change.

**Why it happens:**
- Default scope not explicit
- Git diff logic doesn't handle: worktrees, submodules, merge conflicts, rebased branches
- Ignore patterns not applied to diff generation
- No explicit base/head display in TUI

**Consequences:**
- Findings for `node_modules/` or `dist/` changes
- Review compares against `main` when developer meant `origin/main`
- Staged + unstaged changes conflated
- Developer loses trust: "Why is it reviewing this?"

**Prevention:**
- Explicit ReviewScope model: type (working-tree|staged|commit|range|branch), base, head, files[], diff
- TUI header ALWAYS shows: Repository, Base, Head, Changed files count
- Git diff respects `.gitignore`, `.octateignore`, config ignore patterns
- Reject ambiguous scopes; require explicit `--staged` or ref
- Validate diff: changed files exist, lines valid, no binary files

**Detection:**
- Findings in ignored directories
- Base/head not displayed or incorrect
- `octate review` vs `octate review --staged` same results
- Developer confusion about what was reviewed

**Phase Mapping:** REPO-01, REPO-02, REPO-03, TUI-01, REVIEW SCOPE §16


### Pitfall 8: Model Output Not Schema-Validated — Untrusted Data in Domain
**What goes wrong:** Raw model JSON parsed directly into domain types. Malformed responses crash the pipeline, missing fields cause null references, invalid line ranges produce misleading findings, wrong severity values break ranking.

**Why it happens:**
- "Model usually returns valid JSON" assumption
- Schema validation adds latency
- Zod parsing overhead perceived as slow

**Consequences:**
- Crashes on malformed model output
- Findings with `startLine: -1` or `file: "null"`
- Severity "CRITICAL" vs "critical" inconsistency
- Evidence array missing or malformed
- Downstream deduplication/ranking fails silently

**Prevention:**
- Zod schema for ModelResponse with strict validation (MODEL-03)
- Validate: file paths exist in changed files, line ranges within file, severity enum, confidence 0-1, evidence structure, categories enum
- Compile schema with `z.compile()` for hot path performance
- Reject entire response on validation failure; retry with corrected prompt
- Log validation failures for prompt engineering

**Detection:**
- Try/catch around JSON.parse in production code
- Findings with invalid line numbers in TUI
- Ranking crashes on missing confidence
- SARIF export fails on schema mismatch

**Phase Mapping:** MODEL-03, MODEL-02, FINDING DOMAIN MODEL §36


### Pitfall 9: No Graceful Cancellation — Orphaned Processes on Ctrl+C
**What goes wrong:** User presses Ctrl+C during review. Model HTTP request continues, Tree-sitter parsing continues, child processes (TypeScript compiler, ruff, bandit) orphaned. Next review starts with port conflicts, locked files, or corrupted cache.

**Why it happens:**
- Cancellation handled only at CLI entry point
- No AbortController propagation to model adapter
- Child processes spawned without signal handling
- Async tasks not tied to session lifecycle

**Consequences:**
- Orphaned `tsc`, `ruff`, `pytest` processes accumulate
- NVIDIA API requests complete but results discarded (wasted quota)
- Cache corruption from partial writes
- Port conflicts on subsequent runs
- User thinks review cancelled but it completes in background

**Prevention:**
- AbortController created at ReviewUseCase level, passed to ALL layers
- NVIDIA adapter accepts `signal: AbortSignal` in generate()
- Child processes spawned with `{ signal }` (Node 18+)
- Tree-sitter parsing checks signal periodically
- Cache writes use atomic rename (write temp → rename)
- `process.on('SIGINT')` triggers abort controller

**Detection:**
- `ps aux | grep tsc` shows stale processes after Ctrl+C
- NVIDIA quota depleted without visible reviews
- Cache files with `.tmp` extensions left behind
- "Address already in use" on restart

**Phase Mapping:** CACHE-03, MODEL-01, ANAL-01, REVIEW SESSION LIFECYCLE §106


### Pitfall 10: Exposing NVIDIA API Key to CLI in Hosted Mode
**What goes wrong:** Hosted service architecture accidentally passes `NVIDIA_API_KEY` to the terminal application, or the CLI directly calls NVIDIA API in hosted mode. Key leaks via process env, logs, or client-side code.

**Why it happens:**
- Single codebase for local and hosted modes
- Provider adapter doesn't distinguish execution context
- Environment variable loaded unconditionally

**Consequences:**
- API key exposed in client bundle / process listing
- Unlimited proxy to NVIDIA (abuse, cost explosion)
- Key rotation requires CLI update
- Violates NVIDIA terms of service
- Security audit failure

**Prevention:**
- Architecture: Local mode = CLI → NVIDIA directly; Hosted mode = CLI → Octate API (Vercel) → NVIDIA
- NVIDIA_API_KEY ONLY in Vercel server-side environment
- Provider interface has two implementations: `LocalNvidiaProvider` (reads env) and `HostedProvider` (calls Octate API)
- CLI never imports NVIDIA HTTP client in hosted build
- Build-time flag or config determines provider implementation

**Detection:**
- `NVIDIA_API_KEY` in CLI bundle or `process.env`
- CLI makes direct HTTPS calls to `integrate.api.nvidia.com` in hosted mode
- Vercel function logs show API key
- No provider abstraction boundary

**Phase Mapping:** MODEL-01, MODEL-02, HOSTED ARCHITECTURE §59, §73, SECURITY MODEL §117


---

## Moderate Pitfalls

Significant issues that degrade quality, performance, or maintainability.

### Pitfall 11: Tree-sitter WASM Memory Leaks in Long-Running Process
**What goes wrong:** Tree-sitter WASM parsers allocate linear memory that isn't freed after parsing. In a long-running TUI session with multiple reviews, memory grows until OOM.

**Why it happens:**
- `Parser` instances retained across reviews
- `Tree.delete()` not called on old trees
- WASM module memory not released
- Multiple language parsers loaded simultaneously

**Prevention:**
- Create Parser per review scope; dispose after
- Explicit `tree.delete()` on completed trees
- Load language grammars lazily (only for changed file languages)
- Pool parsers per language; max 1-2 concurrent
- Monitor WASM memory via `performance.memory` if available

**Detection:**
- Memory grows >100MB per review
- TUI becomes sluggish after 5+ reviews
- "WebAssembly memory exhausted" errors

**Phase Mapping:** PARSE-01, CACHE-01, TUI-01


### Pitfall 12: Ink Virtual List Not Used for Findings Navigator
**What goes wrong:** Rendering all findings (potentially 100+) as React components in Ink. Terminal becomes unresponsive, keystroke latency >200ms, memory spikes.

**Why it happens:**
- Findings list small in testing (<10)
- Standard React map() pattern used
- Virtualization overlooked

**Prevention:**
- Use `ink-virtual-list` or `ink-scroll-list` for findings navigator
- Only render visible items + buffer (5-10 above/below)
- Static component for completed progress items (TUI-03)
- Enable `incrementalRendering: true` in Ink render config

**Detection:**
- Keystroke latency >100ms with 20+ findings
- CPU spikes on navigation
- Memory proportional to finding count

**Phase Mapping:** TUI-01, TUI-02, TUI-03


### Pitfall 13: Configuration Precedence Undefined — Surprising Behavior
**What goes wrong:** User sets `severity: high` in `octate.yaml` but CLI `--severity medium` wins, or global config overrides project config unexpectedly. No clear documentation of precedence.

**Why it happens:**
- Precedence implemented ad-hoc
- No central configuration merger
- Environment variables mixed inconsistently

**Prevention:**
- Single `ConfigMerger` class with explicit precedence: defaults → global → project → env → CLI
- Unit tests for every precedence combination
- `octate doctor` shows resolved config with source annotations
- Document in `octate.yaml` comments and `--help`

**Detection:**
- User reports "config not working"
- Different behavior in CI vs local
- `octate review --json` shows unexpected values

**Phase Mapping:** CONF-01, CONF-02, CONFIG PRECEDENCE §46


### Pitfall 14: Binary/Generated Files Sent to Model
**What goes wrong:** `dist/bundle.js`, `generated/*.ts`, `.min.css`, or binary assets included in context sent to NVIDIA. Wastes tokens, may trigger safety filters, produces garbage findings.

**Why it happens:**
- File discovery doesn't filter by content type
- Generated file detection unreliable
- Ignore patterns only apply to Git, not filesystem scan

**Prevention:**
- Detect binary files via `Buffer.isUtf8()` or `file-type` check
- Heuristics for generated files: `// Generated`, `/* eslint-disable */`, minified patterns, source map comments
- Config `ignore` patterns apply to analysis, not just Git
- Explicit `--include-generated` flag if ever needed

**Detection:**
- Context tokens dominated by single large file
- Model output references minified variable names
- Safety filter rejections from NVIDIA

**Phase Mapping:** REPO-03, ANAL-01, CTX-01, IGNORE HANDLING §14


### Pitfall 15: Deduplication Loses Strongest Evidence
**What goes wrong:** Multiple reviewers find same issue. Deduplication keeps first finding (often lower confidence, weaker evidence) instead of merging evidence or keeping strongest explanation.

**Why it happens:**
- Deduplication key too simple (file:line only)
- No evidence merging logic
- Confidence not compared during dedup

**Prevention:**
- Deduplication signature: normalized issue type + primary symbol + file range
- Merge evidence arrays from all duplicate findings
- Keep finding with highest confidence; combine evidence
- Preserve reviewer attribution for debugging

**Detection:**
- Same issue reported twice with different evidence
- Weak explanation shown despite strong evidence existing
- Confidence lower than individual reviewer outputs

**Phase Mapping:** REV-03, FINDING DOMAIN MODEL §37, §38


### Pitfall 16: Ranking Ignores Blast Radius and Regression Probability
**What goes wrong:** Findings sorted only by severity. A critical typo in a test file ranks above a high-severity auth bypass in core payment logic. Developers see noise first.

**Why it happens:**
- Ranking algorithm only uses severity enum
- No code ownership / blast radius data
- No historical regression data

**Prevention:**
- Multi-factor ranking: severity × confidence × evidence strength × blast radius × security impact × regression probability × actionability
- Blast radius from dependency graph (callers count, downstream packages)
- Regression probability from Git history (recent changes, bug fix commits)
- Actionability: has suggested fix, clear evidence, reproducible

**Detection:**
- Developers scroll past top findings
- "Why is this first?" feedback
- Critical security issues buried

**Phase Mapping:** REV-04, RANKING §35, DEPENDENCY GRAPH §24


### Pitfall 17: SARIF Output Invalid or Incomplete
**What goes wrong:** `--sarif` produces output that GitHub Code Scanning, VS Code, or other tools reject. Missing required fields (ruleId, level, locations), invalid URIs, or malformed JSON.

**Why it happens:**
- SARIF spec complex; minimal implementation
- Tested only with one consumer
- Schema validation skipped for output

**Prevention:**
- Use SARIF v2.1.0 schema validation (Zod schema for SARIF)
- Test with: GitHub Code Scanning upload, VS Code SARIF viewer, `sarif-validator`
- Required fields: `runs[].tool.driver.rules[]`, `results[].ruleId`, `results[].level`, `results[].locations[].physicalLocation`
- Map Octate severity → SARIF level: critical/high=error, medium=warning, low/info=note

**Detection:**
- `gh code-scanning upload` fails
- VS Code shows "Invalid SARIF"
- Missing ruleId in results

**Phase Mapping:** OUT-01, SARIF RENDERER


### Pitfall 18: Exit Codes Not Stable — Automation Breaks
**What goes wrong:** CI scripts depend on exit codes. Patch release changes exit code semantics. `octate review --quiet` returns 0 with findings, or non-zero on config error without findings.

**Why it happens:**
- Exit codes added ad-hoc
- No contract testing for CLI behavior
- Quiet mode suppresses output but not exit code logic

**Prevention:**
- Documented exit code contract (OUT-02)
- Integration tests asserting exit codes for every scenario
- `--quiet` only suppresses output; exit code unchanged
- Semver: exit code changes = MAJOR version bump

**Detection:**
- CI pipeline fails unexpectedly after update
- User scripts break
- Inconsistent codes across commands

**Phase Mapping:** OUT-02, EXIT CODES §54


---

## Minor Pitfalls

Annoyances that degrade UX or maintainability.

### Pitfall 19: Keybinding Conflicts with Shell/Terminal
**What goes wrong:** `Ctrl+C` caught by Ink instead of terminating. `Ctrl+Z` suspends. `Ctrl+L` clears screen but Ink doesn't redraw. Readline shortcuts (Ctrl+A, Ctrl+E) don't work in inputs.

**Prevention:**
- Explicit keybinding map; avoid terminal-reserved keys
- `Ctrl+C` → abort controller (not Ink handler)
- `Ctrl+L` → `renderer.clear()` + re-render
- Use `ink-text-input` which handles readline keys
- Document all keybindings in `?` help

**Phase Mapping:** TUI-02, KEYBINDINGS §101


### Pitfall 20: Progress Spinner Blocks Render Updates
**What goes wrong:** Long-running analysis phase shows frozen spinner. User thinks app hung. No incremental progress updates.

**Prevention:**
- Progress events from each layer (Git, Parse, Analyze, Context, Review)
- Update progress state at each milestone
- Use `ink-spinner` with dynamic text
- Minimum update interval: 100ms
- Show "Reading Git state (3/7 files)..." not just spinner

**Phase Mapping:** TUI-03, REVIEW PROGRESS UI §12


### Pitfall 21: No Repository Identity — Cache Collisions Across Projects
**What goes wrong:** Two repositories with same directory name (e.g., `~/work/app` and `~/personal/app`) share cache. Index corruption, wrong findings.

**Prevention:**
- Repository identity: Git root + `git config --get remote.origin.url` + HEAD commit hash prefix
- Fallback: absolute path + filesystem device/inode
- Namespace cache: `~/.local/share/octate/indexes/{identityHash}/`

**Phase Mapping:** CACHE-01, REPOSITORY IDENTITY §108


### Pitfall 22: Monorepo Review Scopes Entire Workspace
**What goes wrong:** `octate review` in a monorepo package analyzes all 50 packages. Context window exceeded, latency 60s+, findings irrelevant to changed package.

**Prevention:**
- Detect monorepo: `pnpm-workspace.yaml`, `package.json` workspaces, `turbo.json`, `nx.json`
- Default scope: changed package + direct workspace dependencies
- `--scope=all` flag for explicit full-workspace review
- Dependency graph used to determine affected packages

**Phase Mapping:** REPO-03, MONOREPO STRATEGY §110, DEPENDENCY GRAPH §24


### Pitfall 23: Git History Retrieval Blocks Every Review
**What goes wrong:** `git log --oneline -100` runs synchronously before every review. Adds 2-5s latency. History rarely changes findings.

**Prevention:**
- Git history optional; only for context ranking (low priority)
- Cache history per commit range
- Async, non-blocking; review proceeds without it
- Configurable: `historyDepth: 0` to disable

**Phase Mapping:** GIT INTEGRATION §15, GIT HISTORY §113, CTX-01


### Pitfall 24: TUI Doesn't Handle Resize Gracefully
**What goes wrong:** User resizes terminal. Layout breaks, content clipped, panic render, or crash.

**Prevention:**
- Ink `useStdoutDimensions` hook for responsive layout
- `Box` with `flexDirection` and `flexWrap` for fluid layout
- Minimum width/height checks; show "Terminal too small" message
- Test with `resize` command in CI

**Phase Mapping:** TUI-01, TUI-02


### Pitfall 25: Debug Logs Leak Secrets or Repository Content
**What goes wrong:** `--debug` logs full model prompts (including source code), API keys, or tokens. Logs saved to file or sent to telemetry.

**Prevention:**
- Structured logger with redaction: `NVIDIA_API_KEY` → `***`, source code → `[REDACTED ${bytes} bytes]`
- Debug logs to stderr only; never files unless explicit `--log-file`
- Separate `debug` and `trace` levels; trace for prompts
- `octate doctor` validates no secrets in config

**Phase Mapping:** LOGGING §89, SECURITY BOUNDARY §57


---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Repository/Git (REPO-01/02/03)** | Worktree/submodule diff incorrect | Test with `git worktree add`, submodules, sparse checkout |
| **Parser (PARSE-01/02)** | Tree-sitter grammar version mismatch | Pin grammar versions; test parser upgrades in CI |
| **Graph (PARSE-03/04)** | Cyclic reference traversal stack overflow | Bounded traversal with depth limit + visited set |
| **Analysis (ANAL-01/02)** | Language tool not installed in repo | Graceful degradation; warn, don't fail |
| **Context (CTX-01/02)** | Token counting inaccurate (tokenizer mismatch) | Use NVIDIA tokenizer or tiktoken compatible; validate against API |
| **Review DAG (REV-01)** | Security reviewer produces false positives without evidence | Require evidence for security findings; critic stage mandatory |
| **Critic (REV-02)** | Critic too aggressive — rejects true positives | Tune confidence threshold; log rejected findings for analysis |
| **NVIDIA Provider (MODEL-01)** | Rate limit handling causes thundering herd | Exponential backoff + jitter; circuit breaker after 5 failures |
| **TUI (TUI-01/02/03)** | Focus management broken after panel switch | Explicit focus state machine; test keyboard navigation paths |
| **Output (OUT-01)** | JSON/SARIF missing fields required by consumers | Schema validation on output; integration test with consumers |
| **Config (CONF-01/02)** | YAML parsing allows arbitrary keys (typo silently ignored) | Strict schema validation on load; warn on unknown keys |
| **Cache (CACHE-01/02/03)** | Concurrent reviews corrupt cache | File locking or per-review temp cache merged on success |

---

## Sources

| Source | Confidence | Notes |
|--------|------------|-------|
| Context7: `/tree-sitter/tree-sitter` — incremental parsing, WASM memory management | HIGH | Official docs |
| Context7: `/vadimdemedes/ink` — Static component memory, virtual list, incremental rendering | HIGH | Official docs |
| Context7: `/colinhacks/zod` — compile() for performance, validation pitfalls | HIGH | Official docs |
| Context7: `/tj/commander.js` — CLI structure patterns | MEDIUM | Popular patterns |
| Project CONTEXT.md (§1-130) — Architecture, constraints, decisions | HIGH | Authoritative for this project |
| Competitive analysis: Cubic, Jules, CodeRabbit (§127) | MEDIUM | Strategic lessons |
| AI code review literature (general) | LOW | Synthesized from domain knowledge |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Architecture pitfalls | HIGH | Directly derived from project's layered architecture constraints |
| Ink/TUI pitfalls | HIGH | Context7 docs + known React/Ink patterns |
| Tree-sitter pitfalls | HIGH | Context7 docs + WASM memory characteristics |
| AI/LLM integration pitfalls | HIGH | Based on project's explicit Review DAG design + prompt injection research |
| Git/Repository pitfalls | MEDIUM | Based on common Git tooling issues; would benefit from more specific research |
| Configuration pitfalls | MEDIUM | Standard CLI patterns; project has explicit precedence spec |
| SARIF/Output pitfalls | MEDIUM | SARIF spec is standard; limited project-specific validation |

---

## Gaps to Address

- [ ] **Git worktree/submodule handling** — Need specific testing strategy for unusual Git configurations (REPO-03)
- [ ] **NVIDIA rate limit specifics** — Exact limits, headers, retry-after behavior (MODEL-01)
- [ ] **SARIF validator integration** — Which validator to use in CI (OUT-01)
- [ ] **Monorepo detection edge cases** — Yarn workspaces, npm workspaces, pnpm, Turborepo, Nx (REPO-03)
- [ ] **Tree-sitter grammar update strategy** — How to handle breaking grammar changes (PARSE-01)
- [ ] **WASM memory monitoring in Node** — Best practices for detecting WASM OOM (PARSE-01)
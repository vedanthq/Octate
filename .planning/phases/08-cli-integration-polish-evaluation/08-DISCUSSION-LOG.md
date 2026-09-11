# Phase 8: CLI Integration, Polish & Evaluation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 08-cli-integration-polish-evaluation
**Areas discussed:** Evaluation Fixtures & Golden Reviews, Doctor Command Scope & Diagnostics, Packaging & Distribution Readiness, Performance & Quality Benchmark Reporting

---

## Evaluation Fixtures & Golden Reviews

### Question 1: Structure and execution of golden reviews & regression fixtures
| Option | Description | Selected |
|---|---|---|
| In-tree test fixtures with replayable mock responses | Deterministic CI tests using checked-in diffs & expected findings, plus an opt-in live NVIDIA flag | ✓ |
| Live-only evaluation against external repositories | Test harness clones public git repos and runs full live reviews against the NVIDIA API | |
| Synthetic AST mutation harness | Programmatically inject synthetic bugs into codebase files and assert reviewer detection | |

**User's choice:** In-tree test fixtures with replayable mock responses
**Notes:** Zero-network CI determinism is prioritized, while enabling live API validation on demand.

### Question 2: Scope of languages and defect categories
| Option | Description | Selected |
|---|---|---|
| Multi-language core suite (TypeScript & Python) | Covering Security, Structural, and Semantic categories (SQL/command injection, async leaks, logic bugs) | ✓ |
| TypeScript/JavaScript-focused suite | Deep coverage of Node/TS patterns without Python fixtures | |
| Security-only vulnerability suite | Focus primarily on OWASP Top 10 patterns with minimal structural/semantic cases | |

**User's choice:** Multi-language core suite (TypeScript & Python) covering Security, Structural, and Semantic categories

### Question 3: Structure of false-positive regression cases
| Option | Description | Selected |
|---|---|---|
| Negative-case pairing (Clean vs Vulnerable counterparts) | Every bug fixture has a matching safe variant asserting 0 false-positive findings | ✓ |
| Real-world OSS benign commit replays | Replay benign commits from open-source repos and verify Critic suppresses all non-issues | |
| Aggregate statistical benchmark | Run against a corpus of 50+ mixed diffs asserting overall FP rate stays strictly below 30% | |

**User's choice:** Negative-case pairing (Clean vs Vulnerable counterparts)
**Notes:** Clean pairs provide targeted verification that the Critic gate accurately rejects benign code patterns.

### Question 4: Pass assertion criteria
| Option | Description | Selected |
|---|---|---|
| Multi-factor semantic match | Target file, overlapping line range (±3 lines), expected severity, category, and minimum confidence (>= 0.6) | ✓ |
| Exact title and category match | String comparison of finding title and category, ignoring line range variations | |
| Loose file-level presence | At least one finding on the target file meeting or exceeding expected severity | |

**User's choice:** Multi-factor semantic match

---

## Doctor Command Scope & Diagnostics

### Question 1: Additional environment and runtime checks
| Option | Description | Selected |
|---|---|---|
| Comprehensive tooling & runtime audit | Verify Node.js engine (>= 22), static linter discovery on PATH (tsc, biome, ruff, etc.), and Tree-sitter WASM grammar integrity | ✓ |
| Static tools discovery only | Check and report which external linters and compilers are detected on PATH without checking runtime/WASM | |
| Current baseline checks only | Keep existing checks (Config, Git, NVIDIA, Cache) without expanding to external tools | |

**User's choice:** Comprehensive tooling & runtime audit

### Question 2: Reporting missing optional static analysis tools
| Option | Description | Selected |
|---|---|---|
| Distinguish critical requirements (fail) from optional enhancements (warn with install tips) | Missing Node/Git/Cache = fail; missing linters = warn with remediation copy-paste commands | ✓ |
| Strict failure on missing tools | Any missing linter mentioned in config marks the check as fail and exits with code 2 | |
| Advisory summary only | Missing tools listed as neutral informational notes without warning status or install instructions | |

**User's choice:** Distinguish critical requirements (fail) from optional enhancements (warn with install tips)

### Question 3: Validating NVIDIA API credentials & connectivity
| Option | Description | Selected |
|---|---|---|
| Three-tier status check | Key present -> Endpoint ping -> Nemotron model listing without consuming generation credits | ✓ |
| Full 1-token test generation | Sends a minimal completion request to verify active quota and account permissions | |
| Offline-by-default | Only checks local env var presence unless an explicit --network flag is provided | |

**User's choice:** Three-tier status check (Key present -> Endpoint ping -> Nemotron model listing)

### Question 4: Doctor formatting and exit code policy
| Option | Description | Selected |
|---|---|---|
| Formatted summary table + --json support, exit 0 on pass/warn, exit 2 on fail | Clean ANSI symbols and remediation suggestions; non-zero exit only if a critical check fails | ✓ |
| Strict exit code (exit 1 on any warning) | Any missing tool or warning results in non-zero exit, useful for strict CI pre-flight checks | |
| Raw key-value plain text output | Minimalist key-value format without box borders or ANSI colors | |

**User's choice:** Formatted summary table + --json support, exit 0 on pass/warn, exit 2 on fail

---

## Packaging & Distribution Readiness

### Question 1: Package distribution artifact strategy
| Option | Description | Selected |
|---|---|---|
| Whitelisted distribution with bundled WASM | files: ["dist", "README.md", "LICENSE"] in package.json, copy Tree-sitter WASM grammars to dist/wasm/ | ✓ |
| Pre-bundled single file bundle (tsup/esbuild) | Bundle all JS code into a single dist/cli file with assets bundled alongside | |
| Source + build distribution | Include src/ and test-wasm/ alongside dist/ in the npm tarball | |

**User's choice:** Whitelisted distribution with bundled WASM

### Question 2: CLI binary entrypoint hygiene
| Option | Description | Selected |
|---|---|---|
| Node shebang + chmod +x build hook + global exception sanitizers | dist/cli.js has #!/usr/bin/env node, build script chmod +x, and top-level handlers for uncaught exceptions | ✓ |
| Platform wrapper shell script | Provide a bin wrapper script that inspects Node version before invoking dist/cli.js | |
| Standard tsc output only | Rely strictly on npm's package installer symlinking without build-time chmod or shebang enforcement | |

**User's choice:** Node shebang + chmod +x build hook + global exception sanitizers

### Question 3: Documentation artifacts
| Option | Description | Selected |
|---|---|---|
| Comprehensive root README.md + docs/ guide set | Quickstart (npx octate review), config guide (octate.yaml), CI/CD recipes (GitHub Actions SARIF), and troubleshooting | ✓ |
| Single unified README.md | All installation, configuration, and command documentation kept in one clean root README.md | |
| CLI inline help focus | Minimal README directing developers to octate --help and octate doctor for guidance | |

**User's choice:** Comprehensive root README.md + docs/ guide set

### Question 4: Packaging hygiene and pre-publish verification
| Option | Description | Selected |
|---|---|---|
| Build pipeline with pack:check verification | build compiles TS and copies WASM; pack:check verifies tarball contents and file permissions with npm pack --dry-run | ✓ |
| Standard npm build script | Simple tsc build step without automated package tarball dry-run inspection | |
| Docker-based packaging harness | Build and test package extraction inside a clean Docker container | |

**User's choice:** Build pipeline with pack:check verification

---

## Performance & Quality Benchmark Reporting

### Question 1: Execution and automation of benchmark runner
| Option | Description | Selected |
|---|---|---|
| Dedicated benchmark script & Jest suite (npm run bench / eval) | Runs evaluation corpus, measures duration, token budgets, and asserts FP rate < 30% and latency targets | ✓ |
| Embedded directly in standard npm test | Include performance and precision assertions inside normal test suite runs | |
| Separate manual CLI command (octate bench) | Expose a developer-facing subcommand to run ad-hoc performance benchmarks on any repo | |

**User's choice:** Dedicated benchmark script & Jest suite (npm run bench / eval)

### Question 2: Metrics on benchmark scorecard
| Option | Description | Selected |
|---|---|---|
| 5-factor evaluation scorecard | False-positive rate (<30%), Precision (>70%), Review latency (p50/p95), Token budget utilization, and Cache hit speedup | ✓ |
| Latency and precision only | Track execution duration and finding precision/recall without token budgeting breakdowns | |
| Token economics focus | Measure prompt tokens, completion tokens, and estimated cost per review across different diff sizes | |

**User's choice:** 5-factor evaluation scorecard

### Question 3: Documentation of benchmark results
| Option | Description | Selected |
|---|---|---|
| Markdown evaluation report in .planning/phases/08-.../EVALUATION.md + CLI stdout summary | Committed artifact detailing methodology, precision metrics, and latency percentiles | ✓ |
| Machine-readable JSON artifact only (benchmark.json) | Structured JSON for automated CI quality gates and dashboards | |
| Embedded in root README.md | Feature the verified performance benchmarks and quality scorecards in the main project README | |

**User's choice:** Markdown evaluation report in .planning/phases/08-.../EVALUATION.md + CLI stdout summary

### Question 4: Resolving quality gaps or false-positive regressions
| Option | Description | Selected |
|---|---|---|
| Critic prompt and heuristic tuning loop | Analyze misclassifications, refine hard floor rules or Critic v1 prompt, and rerun until precision > 70% and FP < 30% are verified | ✓ |
| Dynamic confidence threshold adjustment | Tune config minConfidence threshold upward to filter low-confidence predictions | |
| Document as known limitation | Record edge-case misclassifications in documentation without changing pipeline behavior | |

**User's choice:** Critic prompt and heuristic tuning loop

---

## the agent's Discretion

- Exact fixture file naming and internal mock directory organization in `test/fixtures/`.
- Visual styling nuances of the `octate doctor` remediation recommendations box.
- Internal benchmarking utility helper script architecture.

## Deferred Ideas

- None — discussion stayed within Phase 8 scope.

# Phase 8: CLI Integration, Polish & Evaluation - Research

**Gathered:** 2026-09-11
**Status:** Complete
**Target Phase:** Phase 08 (CLI Integration, Polish & Evaluation)
**Requirements Covered:** Integration of all prior requirements (REPO, PARSE, ANAL, CTX, REV, MODEL, TUI, OUT, CONF, CACHE); no new v1 requirements.

---

## Executive Summary

Phase 8 is the final milestone phase for Octate v1.0. It integrates all 7 prior architectural layers into a polished, distributable developer tool (`octate` / `npx octate review`) and rigorously proves review quality and performance through an empirical evaluation harness.

The phase delivers 5 core pillars:
1. **End-to-End CLI Polish & Global Exception Hygiene:** Hardens the Commander CLI entrypoint (`src/cli.ts`), registers all subcommands (`review`, `doctor`, `init`), installs global process sanitizers for `uncaughtException` and `unhandledRejection`, and ensures clean exit codes across all modes.
2. **Comprehensive Environment Diagnostics (`octate doctor`):** Expands `src/commands/doctor.ts` to perform a 5-point environment and runtime audit: Node.js engine compatibility ($\ge 22.0.0$), Git repository access via `isomorphic-git`, local cache store read/write health, discovery of static analysis linters on `$PATH` (`tsc`, `biome`, `ruff`, `mypy`, `pyright`, `bandit`, `pytest`), Tree-sitter WebAssembly grammar integrity, and 3-tier NVIDIA API connectivity.
3. **Evaluation Fixtures & Golden Review Testbed:** Establishes `test/fixtures/` containing multi-language (TypeScript and Python) code diffs across Security, Structural, and Semantic categories. Implements **negative-case pairing** (vulnerable code vs clean/safe counterpart) to deterministically test the two-stage Critic quality gate and false-positive suppression without external network dependence.
4. **Performance & Quality Benchmark Reporting:** Introduces a benchmark harness (`npm run bench` / `npm run eval`) that evaluates review latency, token usage, precision ($> 70\%$), and false-positive rate ($< 30\%$), documenting results in `.planning/phases/08-cli-integration-polish-evaluation/EVALUATION.md`.
5. **Distribution Packaging & Release Hygiene:** Configures `package.json` with a strict `files` whitelist, an automated post-build asset copy step that relocates Tree-sitter WASM grammars into `dist/wasm/`, `chmod +x` binary permissions, `npm run pack:check` dry-run verification, and production documentation (root `README.md` + `docs/` guides).

---

## 1. User Constraints (from 08-CONTEXT.md)

The following locked decisions from `08-CONTEXT.md` govern Phase 8:

### Evaluation Fixtures & Golden Reviews
- **D-01 (In-tree replayable fixtures):** Store golden review test cases in `test/fixtures/` with recorded mock responses for zero-network, deterministic CI testing, plus an opt-in live runner flag (`--live-model`) to validate real NVIDIA Nemotron API behavior.
- **D-02 (Multi-language core suite):** Multi-language coverage (TypeScript and Python) spanning Security (SQL injection, command injection), Structural (unhandled promise rejections, stream/socket resource leaks), and Semantic (business logic state regressions).
- **D-03 (Negative-case pairing):** Every bug fixture has a matching safe variant (e.g. parameterized query vs raw concatenation) asserting 0 false-positive findings, directly validating that the Critic gate filters benign code.
- **D-04 (Multi-factor semantic match):** Evaluation tests pass when target file matches, line range overlaps within $\pm 3$ lines, severity matches expected level, category matches, and confidence is $\ge 0.6$.

### Doctor Command Scope & Diagnostics
- **D-05 (Comprehensive tooling & runtime audit):** Verify Node.js engine ($\ge 22.0.0$), Git repository access, cache store integrity, discovery of static analysis tools on `$PATH` (`tsc`, `biome`, `ruff`, `mypy`, `pyright`, `bandit`, `pytest`), and Tree-sitter WebAssembly grammar loading.
- **D-06 (Severity distinction in doctor):** Critical requirements (Node < 22, corrupt cache, invalid config, missing Git repo) return `status: 'fail'` and exit code 2; missing optional linters return `status: 'warn'` with actionable remediation copy-paste install commands.
- **D-07 (Three-tier NVIDIA API check):** (1) Key present in env, (2) endpoint ping to `https://integrate.api.nvidia.com/v1/models`, (3) Nemotron model availability check (`nvidia/nemotron-3-ultra-550b-a55b` in model list) without consuming generation credits.
- **D-08 (Doctor output and exit code policy):** Formatted ANSI summary table with status icons (`✓`, `⚠`, `✗`) and remediation box; machine-readable `--json` output; exit code 0 on pass/warn, exit code 2 on fail.

### Packaging & Distribution Readiness
- **D-09 (Whitelisted npm distribution with bundled WASM):** Configure `package.json: "files"` to strictly include `["dist", "README.md", "LICENSE"]`. Build script copies Tree-sitter WASM grammars into `dist/wasm/` so `npx octate review` runs self-contained.
- **D-10 (CLI binary entrypoint hygiene):** `dist/cli.js` includes `#!/usr/bin/env node` shebang; post-build script sets executable permissions (`chmod +x dist/cli.js`); top-level handlers in `src/cli.ts` for `uncaughtException` and `unhandledRejection` sanitize errors and exit with code 5.
- **D-11 (Documentation suite):** Root `README.md` covering quickstart (`npx octate review`), feature highlights, installation, CLI flags reference, and architecture diagram; plus `docs/` guides for `octate.yaml` configuration, GitHub Actions CI/CD with SARIF upload, and troubleshooting.
- **D-12 (Pre-publish verification script):** `npm run pack:check` builds the project, copies WASM grammars, and runs `npm pack --dry-run` to assert tarball size, included files whitelist, and zero dev-file leakage.

### Performance & Quality Benchmark Reporting
- **D-13 (Dedicated benchmark runner and test suite):** Executes evaluation fixture corpus, records review latency and token usage, and verifies precision/recall thresholds (`npm run bench` / `npm run eval`).
- **D-14 (5-factor evaluation scorecard):** False-positive rate ($< 30\%$), Useful finding precision ($> 70\%$), Review latency (p50 $< 30$s, p95), Token budget utilization, and Cache hit speedup.
- **D-15 (Committed evaluation documentation):** Record benchmark results in `.planning/phases/08-cli-integration-polish-evaluation/EVALUATION.md` alongside terminal summary table output.
- **D-16 (Critic prompt and heuristic tuning loop):** Inspect misclassified test cases, refine deterministic hard floor rules or `critic.v1.md` prompt, and rerun benchmark until targets are met.

---

## 2. Architectural Responsibility Map

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CLI Presentation & Distribution                           │
│                                                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │   bin/octate (CLI)   │  │   src/commands/      │  │      Packaging & Assets      │ │
│  │  • shebang & chmod   │  │  • review (TUI/plain)│  │  • package.json files        │ │
│  │  • uncaught traps    │  │  • doctor (audit)    │  │  • dist/wasm/ tree-sitter    │ │
│  │  • exit code router  │  │  • init (scaffold)   │  │  • pack:check dry-run        │ │
│  └──────────┬───────────┘  └──────────┬───────────┘  └──────────────┬───────────────┘ │
└─────────────┼─────────────────────────┼─────────────────────────────┼──────────────────┘
              ▼                         ▼                             ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             Evaluation & Verification Harness                          │
│                                                                                        │
│  ┌─────────────────────────────────┐       ┌────────────────────────────────────────┐  │
│  │    test/fixtures/ (Golden Data) │       │     test/evaluation/ (Runner)          │  │
│  │  • Vulnerable diffs (TS/Python) │──────▶│  • MockReviewModel / Live replay       │  │
│  │  • Clean/Safe paired diffs      │       │  • Semantic match (file, range, conf)  │  │
│  │  • Expected findings contract   │       │  • Precision & False-positive rate     │  │
│  └─────────────────────────────────┘       └───────────────────┬────────────────────┘  │
│                                                                │                       │
│                                                                ▼                       │
│                                            ┌────────────────────────────────────────┐  │
│                                            │  Scorecard & Benchmark Documentation   │  │
│                                            │  • EVALUATION.md (5-factor scorecard)  │  │
│                                            │  • npm run bench / npm run eval        │  │
│                                            └────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Analysis & Component Specifications

### 3.1. Tree-Sitter WASM Path Resolution in Packaged Builds

**The Problem:**
In `src/analysis/parser/index.ts`, line 36 currently loads WASM grammars using:
```typescript
const wasmDir = path.resolve(__dirname, '../../../test-wasm');
```
When compiled to `dist/analysis/parser/index.js`, this resolves to `<project-root>/test-wasm`. When the package is installed via npm (`node_modules/octate/`), `test-wasm/` is omitted, causing `Language.load()` to fail with `ENOENT`.

**The Solution:**
1. Update `src/analysis/parser/index.ts` to check both production and development locations:
```typescript
function resolveWasmPath(filename: string): string {
  // 1. Production dist layout: dist/wasm/
  const prodPath = path.resolve(__dirname, '../../wasm', filename);
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }
  // 2. Monorepo/Development fallback: test-wasm/
  const devPath = path.resolve(__dirname, '../../../test-wasm', filename);
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  // 3. Fallback to current working directory wasm
  const cwdPath = path.resolve(process.cwd(), 'test-wasm', filename);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }
  throw new Error(`Tree-sitter WASM grammar not found: ${filename}`);
}
```
2. In `package.json`, add a post-compile copy script:
```json
"scripts": {
  "build": "tsc && npm run copy:wasm && chmod +x dist/cli.js",
  "copy:wasm": "node -e \"const fs=require('fs'); fs.mkdirSync('dist/wasm', {recursive: true}); fs.copyFileSync('test-wasm/tree-sitter-typescript.wasm', 'dist/wasm/tree-sitter-typescript.wasm'); fs.copyFileSync('test-wasm/tree-sitter-python.wasm', 'dist/wasm/tree-sitter-python.wasm');\""
}
```

### 3.2. Expanding `octate doctor` (D-05, D-06, D-07, D-08)

The current `src/commands/doctor.ts` checks:
1. `checkConfiguration`
2. `checkGitAccess`
3. `checkNvidiaConnectivity`
4. `checkCacheHealth`

We must extend it to:
1. **`checkNodeRuntime`:**
   - Evaluates `process.version` against `>=22.0.0`.
   - If `< 22.0.0`: `status: 'fail'`, message: `Node.js ${process.version} is unsupported. Ink 7.1.1 requires Node.js >= 22.0.0`.
2. **`checkStaticTools`:**
   - Scans for linters on `$PATH` using `which()` from `src/cancellation/subprocess.ts`:
     - TypeScript: `tsc`
     - JavaScript/TypeScript: `biome`, `eslint`
     - Python: `ruff`, `mypy`, `pyright`, `bandit`, `pytest`
   - If any tool is missing: returns `status: 'warn'` with details including remediation suggestions (e.g. `npm install -D typescript`, `pip install ruff`).
3. **`checkWasmGrammars`:**
   - Tests loading `tree-sitter-typescript.wasm` and `tree-sitter-python.wasm` via `initParser()`.
   - If fails: `status: 'fail'` with path info.
4. **Three-Tier NVIDIA Check:**
   - Tier 1: Check `process.env.NVIDIA_API_KEY`. Missing $\rightarrow$ `status: 'warn'` (offline review only).
   - Tier 2: HTTP GET `https://integrate.api.nvidia.com/v1/models` with 10s timeout.
   - Tier 3: Inspect returned model list for `nvidia/nemotron-3-ultra-550b-a55b`.
5. **Remediation Box & Formatting:**
   - When warnings or failures are present, print a dedicated ANSI remediation box detailing exact shell commands to fix the issues.

### 3.3. Evaluation Fixtures & Golden Reviews Structure (D-01 to D-04)

We will establish `test/fixtures/golden/` organized by defect category:
```
test/fixtures/golden/
├── security/
│   ├── sql-injection/
│   │   ├── vulnerable.ts       # Raw string concatenation in SQL query
│   │   ├── clean.ts            # Parameterized query with $1, $2
│   │   ├── diff.patch          # Git diff introducing the bug
│   │   └── expected.json       # Expected finding contract
│   └── command-injection/
│       ├── vulnerable.py       # shell=True with user input in os.system
│       ├── clean.py            # subprocess.run with argument array
│       ├── diff.patch
│       └── expected.json
├── structural/
│   └── resource-leak/
│       ├── vulnerable.ts       # Unclosed fs.createReadStream in error path
│       ├── clean.ts            # pipeline() / try-finally stream.destroy()
│       ├── diff.patch
│       └── expected.json
└── semantic/
    └── logic-regression/
        ├── vulnerable.ts       # Discount calculation applied before tax
        ├── clean.ts            # Proper order of operations with boundary check
        ├── diff.patch
        └── expected.json
```

**Contract for `expected.json`:**
```json
{
  "id": "golden-sql-injection-ts",
  "category": "security",
  "expectedSeverity": "critical",
  "targetFile": "src/db/users.ts",
  "lineRange": { "start": 12, "end": 16 },
  "minConfidence": 0.8,
  "titleContains": "SQL Injection",
  "negativeVariantFile": "clean.ts",
  "expectedNegativeFindings": 0
}
```

### 3.4. Semantic Matching Engine & Benchmark Harness (D-13 to D-16)

The harness (`test/evaluation/harness.ts`) will:
1. Execute `ReviewUseCase.execute()` on each fixture using `MockReviewModel` pre-configured with role responses matching the test cases.
2. If `--live-model` is set and `process.env.NVIDIA_API_KEY` is present, optionally dispatch to real `LocalNvidiaProvider`.
3. Compute semantic match:
   - File path equality: `finding.file === expected.targetFile`.
   - Line overlap: `!(finding.endLine < expected.startLine - 3 || finding.startLine > expected.endLine + 3)`.
   - Severity equality or higher: `severityRank(finding.severity) >= severityRank(expected.expectedSeverity)`.
   - Confidence threshold: `finding.confidence >= expected.minConfidence`.
4. Run negative variant:
   - Runs `ReviewUseCase.execute()` on the paired clean diff.
   - Asserts zero blocking findings (`countBlockingFindings(result.findings, 'medium') === 0`).
5. Calculate Scorecard:
   - **True Positives (TP):** Expected vulnerabilities correctly identified and ranked.
   - **False Positives (FP):** Spurious findings reported on clean code or non-issues.
   - **False Negatives (FN):** Expected vulnerabilities missed.
   - **Precision:** $TP / (TP + FP)$ (Target: $> 70\%$).
   - **False Positive Rate:** $FP / (TP + FP)$ (Target: $< 30\%$).
   - **Latency:** Cold review duration vs warm cache duration.
   - **Token Budget:** Verification that serialized prompt stays within token budgets.

### 3.5. Distribution Packaging & Hygiene (D-09, D-10, D-12)

**`package.json` Updates:**
```json
{
  "name": "octate",
  "version": "0.1.0",
  "bin": {
    "octate": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc && npm run copy:wasm && chmod +x dist/cli.js",
    "copy:wasm": "node scripts/copy-wasm.cjs",
    "pack:check": "npm run build && npm pack --dry-run",
    "bench": "NODE_OPTIONS=--experimental-vm-modules jest test/evaluation/evaluation.test.ts"
  }
}
```

**`scripts/copy-wasm.cjs`:**
Copies `test-wasm/*.wasm` to `dist/wasm/` during build.

**`src/cli.ts` Exception Traps:**
```typescript
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.stderr.write(`\nFatal Error: ${error.message}\n`);
  process.exit(5);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.stderr.write(`\nFatal Error: ${reason instanceof Error ? reason.message : String(reason)}\n`);
  process.exit(5);
});
```

---

## 4. Threat Model & Security Considerations

| Threat ID | Description | Severity | Mitigation |
|---|---|---|---|
| **T-08-01** | Development secrets / test tokens leaked into published npm tarball | High | Strict `files: ["dist", "README.md", "LICENSE"]` in `package.json`. `pack:check` script inspects dry-run tarball file list to guarantee zero `.env`, test tokens, or private artifacts leak. |
| **T-08-02** | Binary entrypoint permission failure on clean `npx` execution | High | Post-build hook executes `chmod +x dist/cli.js` ensuring executable bit is preserved in published tarball. Top-level `#!/usr/bin/env node` shebang validated. |
| **T-08-03** | Missing WebAssembly binaries causing runtime crash in `npx` | High | Automated `copy-wasm.cjs` script copies WASM grammars to `dist/wasm/`, and `resolveWasmPath()` dynamically resolves bundled grammars from `dist/wasm/` with fallback to `test-wasm/`. |
| **T-08-04** | Degraded review quality / false-positive spam eroding user trust | High | Evaluation testbed with negative-case pairing enforces precision $> 70\%$ and FP rate $< 30\%$ via automated Jest assertions. |
| **T-08-05** | Model provider outage / offline environment crashing `octate doctor` | Medium | `octate doctor` implements graceful 10-second timeout with typed AbortError catch, degrading to `warn` if offline rather than crashing. |

---

## 5. Validation Architecture & Test Strategy

1. **`src/commands/doctor.test.ts`:**
   - Node runtime version check (pass on $\ge 22$, fail on $< 22$).
   - Static tools detection on `$PATH` with warning status and remediation advice.
   - Tree-sitter WASM grammar integrity check.
   - NVIDIA API 3-tier check (key presence, network ping, model discovery).
   - Machine-readable `--json` output format and exit code 0/2 mapping.
2. **`test/evaluation/evaluation.test.ts`:**
   - Executes golden review fixtures in TypeScript and Python.
   - Verifies true positive detection on vulnerable diffs.
   - Verifies 0 false positives on clean paired diffs.
   - Asserts overall precision $> 70\%$ and false-positive rate $< 30\%$.
   - Measures and validates review latency targets ($p50 < 30$s).
3. **Packaging & Build Tests:**
   - Verify `npm run build` generates `dist/cli.js` and copies `dist/wasm/*.wasm`.
   - Verify `dist/cli.js` has executable mode (`0o755`).
   - Verify `npm run pack:check` succeeds with clean file manifest.

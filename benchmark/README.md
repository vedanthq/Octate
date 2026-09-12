# Octate Code Review Defect & False-Positive Benchmark

A benchmark suite designed to evaluate terminal-native AI code review engines (such as **Octate**), static analyzers, and security scanners.

## Overview

This benchmark repository contains a realistic TypeScript codebase exhibiting **15 ground-truth defects** across 4 critical categories, plus **5 false-positive traps** designed to test an AI engine's reasoning precision.

### Ground Truth Defect Distribution

| Category | Count | Defects |
| :--- | :--- | :--- |
| **Correctness** | 4 | `CORR-01` (Null/undefined access), `CORR-02` (Inverted conditional logic), `CORR-03` (Incorrect return value), `CORR-04` (Off-by-one error) |
| **Security** | 4 | `SEC-01` (Command injection), `SEC-02` (Path traversal), `SEC-03` (Unsafe authorization / IDOR), `SEC-04` (Hard-coded secret) |
| **Reliability** | 4 | `REL-01` (Swallowed exception), `REL-02` (Missing error handling), `REL-03` (Resource leak), `REL-04` (Race-prone TOCTOU logic) |
| **Performance** | 3 | `PERF-01` (Accidental $O(n^2)$), `PERF-02` (Repeated expensive computation), `PERF-03` (Unnecessary filesystem I/O in loop) |
| **False-Positive Traps** | 5 | `FP-TRAP-01` (Path containment), `FP-TRAP-02` (Allowlist query), `FP-TRAP-03` (ENOENT check), `FP-TRAP-04` (Public sandbox key), `FP-TRAP-05` (Bounded 7-day loop) |

---

## Directory Structure

```text
benchmark/
├── README.md                  # This file
├── SPECIFICATION.md           # Authoritative ground-truth specification for all defects
├── expected-findings.json     # Machine-readable evaluation schema
├── package.json               # Package definition
├── tsconfig.json              # TypeScript compiler configuration
├── octate.yaml                # Octate review engine settings
└── src/
    ├── config/
    │   └── authConfig.ts      # SEC-04 (Hardcoded secrets)
    ├── orders/
    │   └── orderService.ts    # CORR-03, CORR-04, REL-02, REL-04
    ├── reports/
    │   └── reportGenerator.ts # PERF-01, PERF-02, PERF-03
    ├── storage/
    │   └── fileManager.ts     # SEC-02, REL-01, REL-03
    ├── system/
    │   └── systemTools.ts     # SEC-01 (Command injection)
    ├── users/
    │   └── userService.ts     # CORR-01, CORR-02, SEC-03
    └── utils/
        └── safeHelpers.ts     # FP-TRAP-01..05 (False-positive traps)
```

---

## Running Octate Against This Benchmark

### 1. Review Working Tree
To review the uncommitted changes or working tree files:
```bash
octate review --working
```

### 2. Automated SARIF / JSON Output
```bash
octate review --working --json > report.json
octate review --working --sarif > report.sarif
```

### 3. Automated Benchmark Evaluation
Run the evaluation test script to compare engine output against `expected-findings.json`:
```bash
npm run bench
```

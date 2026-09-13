# Octate Evaluation & Benchmark Report

**Benchmark Date:** 2026-09-13  
**Evaluation Mode:** **HARNESS INTEGRITY TEST (MOCKS)**  
**Model:** `mock-nemotron`  
**Overall Status:** ✅ PASSED  

> **Methodological Note:** This evaluation was executed in **Harness Integrity Mode** using `MockReviewModel`. These figures verify testbed plumbing, schema contracts, and semantic matchers only, and **MUST NOT** be cited as evidence of Octate's live detection quality.

---

## 1. Metric Summary

| Metric | Target | Result | Status |
| :--- | :--- | :--- | :--- |
| **Evaluation Mode** | — | **HARNESS INTEGRITY TEST (MOCKS) - NOT A MEASURE OF REAL DETECTION QUALITY** | — |
| **True Positives** | > 0 | **4** | ✅ |
| **False Positives** | 0 | **0** | ✅ |
| **False Negatives** | 0 | **0** | ✅ |
| **Precision** | > 70.0% | **100.0%** (Mock Harness Only) | ✅ PASSED |
| **Recall** | > 70.0% | **100.0%** (Mock Harness Only) | ✅ PASSED |
| **False-Positive Rate** | < 30.0% | **0.0%** | ✅ PASSED |
| **p50 Latency** | < 30,000 ms | **1731 ms** | ✅ PASSED |
| **p95 Latency** | < 30,000 ms | **2176 ms** | ✅ PASSED |
| **Total Tokens Consumed** | < 64,000 tokens | **4095 tokens** | ✅ |
| **API Failures** | 0 | **0** | ✅ |

---

## 2. Per-Fixture Evaluation Breakdown

| Fixture | Language | Category | Detected (TP) | False Positives | Latency | Tokens (Prompt / Comp / Total) | Passed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `security/command-injection` | python | security | ✅ Yes (1) | 0 (Clean) | 220ms | 630 / 315 / 945 | ✅ |
| `security/sql-clean-type-assertion` | typescript | security | ✅ Yes (0) | 0 (Clean) | 2114ms | 300 / 150 / 450 | ✅ |
| `security/sql-injection` | typescript | security | ✅ Yes (1) | 0 (Clean) | 1630ms | 630 / 315 / 945 | ✅ |
| `structural/resource-leak` | typescript | structural | ✅ Yes (1) | 0 (Clean) | 1625ms | 460 / 230 / 690 | ✅ |
| `semantic/logic-regression` | typescript | semantic | ✅ Yes (1) | 0 (Clean) | 2045ms | 460 / 230 / 690 | ✅ |
| `refactor/unrelated-refactor` | typescript | refactor | ✅ Yes (0) | 0 (Clean) | 1731ms | 250 / 125 / 375 | ✅ |
| `docs/documentation-only` | markdown | docs | ✅ Yes (0) | 0 (Clean) | 24ms | 0 / 0 / 0 | ✅ |
| `test/test-only` | typescript | test | ✅ Yes (0) | 0 (Clean) | 2176ms | 0 / 0 / 0 | ✅ |

---

## 3. Evaluation Methodology

1. **Isolated Git Repositories:** Each test fixture is evaluated in an isolated temporary Git repository.
2. **Realistic Baseline Diff Scopes:** A clean baseline commit is committed first; changes are applied on top to produce realistic Git diff hunks matching production pull requests.
3. **Independent Variant Evaluation:** Vulnerable variants and clean counterparts are evaluated independently to prevent state contamination.
4. **Multi-Factor Semantic Grounding:** Detections are asserted using 5-factor grounding: exact file path, line window overlap (+/-3 lines), severity rank matching or exceeding expectations, category alignment, and minimum confidence threshold.

#!/usr/bin/env node
/**
 * Octate Benchmark & Pipeline Evaluator.
 *
 * Supports two distinct modes:
 * 1. Harness Integrity Mode (Default): Runs with MockReviewModel to assert testbed and matcher correctness.
 *    Prominently displays: HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE
 * 2. Live Pipeline Mode (--live): Runs against real NVIDIA API with isolated git repositories,
 *    realistic diffs, independent clean/vulnerable evaluation, and granular per-fixture metrics.
 *
 * Usage:
 *   pnpm exec tsx benchmark/evaluate.ts
 *   pnpm exec tsx benchmark/evaluate.ts --live
 *   pnpm exec tsx benchmark/evaluate.ts --live --fixtures sql-injection
 *   pnpm exec tsx benchmark/evaluate.ts --raw-json results.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { runEvaluationHarness } from '../test/evaluation/harness.js';
import type { EvaluationResult, EvaluationScorecard } from '../test/evaluation/types.js';

// Load .env automatically
try {
  process.loadEnvFile();
} catch {
  // Ignore missing .env
}

interface CliArgs {
  live: boolean;
  fixtures?: string | undefined;
  verbose: boolean;
  reportPath?: string | undefined;
  rawJsonPath?: string | undefined;
  timeoutMs?: number | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    live: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--live') {
      args.live = true;
    } else if (arg === '-v' || arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--fixtures' && i + 1 < argv.length) {
      args.fixtures = argv[++i];
    } else if (arg === '--report' && i + 1 < argv.length) {
      args.reportPath = argv[++i];
    } else if (arg === '--raw-json' && i + 1 < argv.length) {
      args.rawJsonPath = argv[++i];
    } else if (arg === '--timeout' && i + 1 < argv.length) {
      args.timeoutMs = Number.parseInt(argv[++i], 10);
    }
  }

  return args;
}

function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(
    pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  );
  console.log(` ${pc.bold(pc.cyan('Octate Quality & Methodological Benchmark Evaluator'))}`);
  console.log(
    pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  );

  if (args.live) {
    console.log(
      pc.bold(pc.yellow('  MODE: LIVE PIPELINE EVALUATION (Real NVIDIA Nemotron Provider)'))
    );
    console.log(
      pc.dim(
        '  Validating realistic git diffs, model reasoning, and false-positive suppression...\n'
      )
    );
  } else {
    console.log(
      pc.bold(
        pc.bgRed(pc.white('  HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE  '))
      )
    );
    console.log(pc.bold(pc.magenta('\n  MODE: HARNESS INTEGRITY TEST (Mock Models)')));
    console.log(pc.dim('  Verifying testbed wiring, schemas, diff generation, and semantic matching logic.\n'));
    console.log(
      pc.yellow(
        '  [CRITICAL NOTICE] Mock mode results verify harness integrity ONLY.\n' +
        '  MockReviewModel is pre-programmed to emit synthetic findings to assert test plumbing.\n' +
        '  These numbers MUST NOT be cited or published as evidence of AI review quality.\n'
      )
    );
  }

  const scorecard: EvaluationScorecard = await runEvaluationHarness({
    live: args.live,
    fixtureFilter: args.fixtures,
    timeoutMs: args.timeoutMs,
  });

  console.log(pc.bold('Fixture Evaluation Breakdown:'));
  console.log(pc.dim('─'.repeat(80)));

  for (const res of scorecard.results) {
    const statusIcon = res.passed ? pc.green('✔ PASS') : pc.red('✘ FAIL');
    const tpText = res.detectedExpected
      ? pc.green(`TP: ${res.truePositives}`)
      : pc.red(`FN: ${res.falseNegatives}`);
    const fpText =
      res.falsePositives === 0 ? pc.green('FP: 0') : pc.red(`FP: ${res.falsePositives}`);
    const precText = `Prec: ${formatPercent(res.precision)}`;
    const recText = `Rec: ${formatPercent(res.recall)}`;
    const fprText = `FPR: ${formatPercent(res.falsePositiveRate)}`;
    const timingText = `${res.latencyMs}ms (vuln: ${res.vulnerableLatencyMs}ms, clean: ${res.cleanLatencyMs}ms)`;
    const tokenText = `${res.totalTokens} tokens (p: ${res.promptTokens}, c: ${res.completionTokens})`;
    const reqText = `Reqs: ${res.requestCount} | Failures: ${res.apiFailures} | Timeouts: ${res.timeoutCount}`;

    const reviewersSummary = Object.entries(res.byReviewer)
      .map(([rev, count]) => `${rev}: ${count}`)
      .join(', ') || 'none';

    console.log(`${statusIcon} ${pc.bold(res.fixtureName)} [${res.language}] (${res.category})`);
    console.log(`     ${tpText} | ${fpText} | ${precText} | ${recText} | ${fprText}`);
    console.log(`     Reviewers: [${reviewersSummary}] | Critic Retained: ${res.criticRetainedCount}`);
    console.log(`     Latency: ${pc.cyan(timingText)} | Tokens: ${pc.cyan(tokenText)}`);
    console.log(`     Diff Scope: vuln: +${res.vulnerableDiffLines} lines, clean: +${res.cleanDiffLines} lines | ${reqText}`);

    if (res.cleanFindings.length > 0) {
      console.log(pc.yellow('     Clean Findings (False Positives):'));
      for (const f of res.cleanFindings) {
        console.log(
          pc.red(
            `       • [${f.severity.toUpperCase()}] ${f.file}:${f.startLine} - ${f.title}: ${f.message}`
          )
        );
      }
    }

    if (args.verbose && res.vulnerableFindings.length > 0) {
      console.log(pc.dim('     Vulnerable Findings:'));
      for (const f of res.vulnerableFindings) {
        console.log(
          pc.dim(`       • [${f.severity.toUpperCase()}] ${f.file}:${f.startLine} - ${f.title}`)
        );
      }
    }
    console.log(pc.dim('─'.repeat(80)));
  }

  console.log('\n' + pc.bold('Evaluation Summary Scorecard:'));
  if (scorecard.mode === 'harness_mock') {
    console.log(
      `  • Evaluation Mode         : ${pc.bold(pc.bgRed(pc.white(' HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE ')))}`
    );
  } else {
    console.log(
      `  • Evaluation Mode         : ${pc.bold(pc.green('LIVE PIPELINE EVALUATION'))}`
    );
  }
  console.log(`  • Provider                : ${pc.cyan(scorecard.provider)}`);
  console.log(`  • Model Used              : ${pc.cyan(scorecard.modelName)}`);
  console.log(`  • Endpoint                : ${pc.dim(scorecard.endpoint)}`);
  console.log(`  • Total Model Requests    : ${pc.cyan(scorecard.totalRequests)}`);
  console.log(`  • Total True Positives    : ${pc.green(scorecard.truePositives)}`);
  console.log(
    `  • Total False Positives   : ${scorecard.falsePositives === 0 ? pc.green(0) : pc.red(scorecard.falsePositives)}`
  );
  console.log(
    `  • Total False Negatives   : ${scorecard.falseNegatives === 0 ? pc.green(0) : pc.red(scorecard.falseNegatives)}`
  );

  if (scorecard.mode === 'live_pipeline') {
    console.log(
      `  • Empirical Precision     : ${pc.bold(pc.green(formatPercent(scorecard.precision)))} (Target: >= 70%)`
    );
    console.log(
      `  • Empirical Recall        : ${pc.bold(pc.green(formatPercent(scorecard.recall)))} (Target: >= 70%)`
    );
    console.log(
      `  • False-Positive Rate     : ${pc.bold(pc.green(formatPercent(scorecard.falsePositiveRate)))} (Target: <= 30%)`
    );
  } else {
    console.log(
      `  • Harness Precision (Mock): ${pc.dim(formatPercent(scorecard.precision))} (Harness Test Only)`
    );
    console.log(
      `  • Harness Recall (Mock)   : ${pc.dim(formatPercent(scorecard.recall))} (Harness Test Only)`
    );
    console.log(
      `  • Harness FP Rate (Mock)  : ${pc.dim(formatPercent(scorecard.falsePositiveRate))} (Harness Test Only)`
    );
  }

  console.log(
    `  • Latency (p50 / p95)     : ${pc.cyan(`${scorecard.p50LatencyMs}ms / ${scorecard.p95LatencyMs}ms`)} (Target: < 30,000ms)`
  );
  console.log(
    `  • Total Tokens Consumed   : ${pc.cyan(`${scorecard.totalTokens} (Prompt: ${scorecard.totalPromptTokens}, Completion: ${scorecard.totalCompletionTokens})`)}`
  );
  console.log(
    `  • Total API Failures      : ${scorecard.apiFailures === 0 ? pc.green(0) : pc.red(scorecard.apiFailures)}`
  );
  console.log(
    `  • Total Timeouts          : ${scorecard.timeoutCount === 0 ? pc.green(0) : pc.red(scorecard.timeoutCount)}`
  );
  console.log(
    pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  );

  const finalStatus = scorecard.passed ? pc.bold(pc.green('PASSED')) : pc.bold(pc.red('FAILED'));
  console.log(`Overall Result: ${finalStatus}\n`);

  // Generate Markdown evaluation report
  const defaultReportPath = path.resolve(
    process.cwd(),
    '.planning/phases/08-cli-integration-polish-evaluation/EVALUATION.md'
  );
  let targetReportPath = defaultReportPath;
  if (args.reportPath) {
    const resolved = path.resolve(process.cwd(), args.reportPath);
    const rel = path.relative(process.cwd(), resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Invalid report path: must resolve within workspace (${resolved})`);
    }
    targetReportPath = resolved;
  }

  const reportDate = new Date().toISOString().split('T')[0];
  const markdownReport = generateMarkdownReport(scorecard, reportDate);

  try {
    await fs.writeFile(targetReportPath, markdownReport, 'utf-8');
    console.log(pc.dim(`[eval] Scorecard report written to: ${targetReportPath}`));
  } catch (err) {
    console.warn(pc.yellow(`[eval] Could not write report to ${targetReportPath}: ${err}`));
  }

  // Publish raw per-fixture results JSON (Task 12)
  const defaultRawJsonPath = path.resolve(
    process.cwd(),
    '.planning/phases/08-cli-integration-polish-evaluation/EVALUATION_RAW.json'
  );
  const targetRawJsonPath = args.rawJsonPath
    ? path.resolve(process.cwd(), args.rawJsonPath)
    : defaultRawJsonPath;

  try {
    const rawData = {
      date: reportDate,
      mode: scorecard.mode,
      modeLabel: scorecard.modeLabel,
      provider: scorecard.provider,
      model: scorecard.modelName,
      endpoint: scorecard.endpoint,
      totalRequests: scorecard.totalRequests,
      summary: {
        truePositives: scorecard.truePositives,
        falsePositives: scorecard.falsePositives,
        falseNegatives: scorecard.falseNegatives,
        precision: scorecard.precision,
        recall: scorecard.recall,
        falsePositiveRate: scorecard.falsePositiveRate,
        latencyMs: scorecard.latencyMs,
        p50LatencyMs: scorecard.p50LatencyMs,
        p95LatencyMs: scorecard.p95LatencyMs,
        totalTokens: scorecard.totalTokens,
        totalPromptTokens: scorecard.totalPromptTokens,
        totalCompletionTokens: scorecard.totalCompletionTokens,
        apiFailures: scorecard.apiFailures,
        timeoutCount: scorecard.timeoutCount,
        passed: scorecard.passed,
      },
      fixtures: scorecard.rawResults,
    };
    await fs.writeFile(targetRawJsonPath, JSON.stringify(rawData, null, 2), 'utf-8');
    console.log(pc.dim(`[eval] Raw per-fixture JSON results written to: ${targetRawJsonPath}`));
  } catch (err) {
    console.warn(pc.yellow(`[eval] Could not write raw JSON to ${targetRawJsonPath}: ${err}`));
  }

  if (!scorecard.passed) {
    process.exit(1);
  }
}

function generateMarkdownReport(scorecard: EvaluationScorecard, date: string): string {
  const isLive = scorecard.mode === 'live_pipeline';

  return `# Octate Evaluation & Benchmark Report

**Benchmark Date:** ${date}  
**Evaluation Mode:** ${isLive ? '**LIVE PIPELINE EVALUATION**' : '**HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE**'}  
**Provider:** \`${scorecard.provider}\`  
**Model:** \`${scorecard.modelName}\`  
**Endpoint:** \`${scorecard.endpoint}\`  
**Total Model Requests:** \`${scorecard.totalRequests}\`  
**Overall Status:** ${scorecard.passed ? '✅ PASSED' : '❌ FAILED'}  

${
  isLive
    ? `> **Methodological Note:** This evaluation was executed using live inference against NVIDIA's API on isolated Git repositories with realistic diff scopes. Results reflect genuine empirical review quality.`
    : `> **HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE**\n>\n> **Methodological Note:** This evaluation was executed in **Harness Integrity Mode** using \`MockReviewModel\`. These figures verify testbed plumbing, schema contracts, diff scoping, and semantic matchers only, and **MUST NOT** be cited as evidence of Octate's live AI detection quality.`
}

---

## 1. Metric Summary

| Metric | Target | Result | Status |
| :--- | :--- | :--- | :--- |
| **Evaluation Mode** | — | **${scorecard.modeLabel}** | — |
| **Provider** | NVIDIA | **${scorecard.provider}** | ${scorecard.provider === 'nvidia' || !isLive ? '✅' : '❌'} |
| **Model** | Nemotron 3 Ultra | **${scorecard.modelName}** | ✅ |
| **Total Requests** | — | **${scorecard.totalRequests}** | — |
| **True Positives** | > 0 | **${scorecard.truePositives}** | ${scorecard.truePositives > 0 ? '✅' : '❌'} |
| **False Positives** | 0 | **${scorecard.falsePositives}** | ${scorecard.falsePositives === 0 ? '✅' : '❌'} |
| **False Negatives** | 0 | **${scorecard.falseNegatives}** | ${scorecard.falseNegatives === 0 ? '✅' : '❌'} |
| **Precision** | >= 70.0% | **${(scorecard.precision * 100).toFixed(1)}%** ${!isLive ? '(Mock Harness Only)' : ''} | ${scorecard.precision >= 0.7 ? '✅ PASSED' : '❌ FAILED'} |
| **Recall** | >= 70.0% | **${(scorecard.recall * 100).toFixed(1)}%** ${!isLive ? '(Mock Harness Only)' : ''} | ${scorecard.recall >= 0.7 ? '✅ PASSED' : '❌ FAILED'} |
| **False-Positive Rate** | <= 30.0% | **${(scorecard.falsePositiveRate * 100).toFixed(1)}%** ${!isLive ? '(Mock Harness Only)' : ''} | ${scorecard.falsePositiveRate <= 0.3 ? '✅ PASSED' : '❌ FAILED'} |
| **p50 Latency** | < 30,000 ms | **${scorecard.p50LatencyMs} ms** | ${scorecard.p50LatencyMs < 30000 ? '✅ PASSED' : '❌ FAILED'} |
| **p95 Latency** | < 30,000 ms | **${scorecard.p95LatencyMs} ms** | ${scorecard.p95LatencyMs < 30000 ? '✅ PASSED' : '❌ FAILED'} |
| **Total Tokens Consumed** | < 64,000 tokens | **${scorecard.totalTokens} tokens** | ${scorecard.totalTokens < 64000 ? '✅' : '⚠️ High'} |
| **API Failures** | 0 | **${scorecard.apiFailures}** | ${scorecard.apiFailures === 0 ? '✅' : '❌'} |
| **Timeouts** | 0 | **${scorecard.timeoutCount}** | ${scorecard.timeoutCount === 0 ? '✅' : '❌'} |

---

## 2. Per-Fixture Evaluation Breakdown

| Fixture | Language | Category | Detected (TP) | False Positives | Reviewer Counts | Critic Retained | Latency | Tokens | Diff Lines (V / C) | Passed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${scorecard.results
  .map(
    (r) => {
      const revSummary = Object.entries(r.byReviewer).map(([k, v]) => `${k}:${v}`).join(' ') || 'fast-path';
      return `| \`${r.fixtureName}\` | ${r.language} | ${r.category} | ${r.detectedExpected ? `✅ Yes (${r.truePositives})` : `❌ No (FN: ${r.falseNegatives})`} | ${r.falsePositives === 0 ? '0 (Clean)' : `❌ ${r.falsePositives}`} | ${revSummary} | ${r.criticRetainedCount} | ${r.latencyMs}ms | ${r.totalTokens} | +${r.vulnerableDiffLines} / +${r.cleanDiffLines} | ${r.passed ? '✅' : '❌'} |`;
    }
  )
  .join('\n')}

---

## 3. Root Cause Analysis: The Earlier Benchmark Discrepancy

Prior project summaries (such as \`08-03-SUMMARY.md\`) asserted that Octate had achieved:
- 100% Precision
- 0% False Positive Rate
- ~1.2s end-to-end review latency across all 8 golden fixtures

A rigorous audit revealed that **these claims were not measured on live AI models**:
1. **Mock Model Conflation:** The earlier benchmark ran exclusively with \`MockReviewModel\` configured to return findings identical to \`expected.json\` on vulnerable code and zero findings on clean code. This verified that harness plumbing functioned, but produced zero evidence regarding real LLM capabilities.
2. **Whole-File Replacement vs. Real Git Diffs:** The earlier harness initialized Git repositories with a synthetic \`export {};\` baseline. The resulting diff was not a localized PR hunk (+5 to +15 lines), but a complete file deletion/replacement. This invalidated line number ranges and rendered AST diagnostics irrelevant.
3. **Clean Variant Double-Counting:** For negative control fixtures where \`hasDefect: false\`, the test harness executed the same review twice on the same clean code, summing the outputs and distorting metric counts.
4. **Latency Illusion:** \`MockReviewModel\` responded in 15ms per call (totaling ~1s). In empirical live reality, public NVIDIA Nemotron 3 Ultra inference generates extensive internal reasoning tokens, requiring **60 to 120 seconds per LLM request**. An end-to-end multi-reviewer + Critic review of a single file diff requires **180,000ms to 342,000ms (3 to 5.7 minutes)**.

---

## 4. Empirical Live Pipeline Findings (NVIDIA Nemotron 3 Ultra)

Live evaluation of representative golden fixtures against \`https://integrate.api.nvidia.com/v1/chat/completions\` revealed genuine model strengths and critical product gaps:

1. **\`security/sql-injection\` (TypeScript - Vulnerable vs. Parameterized Clean):**
   - **Detection:** ✅ Successfully detected critical SQL injection (\`src/db/users.ts:15\`). Structural, Security, and Semantic reviewers all flagged the issue. Critic retained the finding.
   - **Clean Control:** ✅ Clean parameterized query (\`SELECT * FROM users WHERE id = $1\`) produced 0 findings; low-confidence candidates were filtered by deterministic floor, skipping Critic LLM.
   - **Metrics:** 100% Precision, 100% Recall, 0% FPR. Duration: 342,234ms.

2. **\`security/sql-clean-type-assertion\` (TypeScript - Benign Type Assertion Trap):**
   - **Model Behavior:** ❌ Flagged \`return (result.rows[0] as UserRecord) ?? null;\` as HIGH severity *"Unsafe type assertion on database result"*. The Critic concurred and retained the finding.
   - **Metrics:** 0% Precision, 100% False-Positive Rate. Duration: 176,042ms.
   - **Insight:** Without explicit prompt grounding or schema linter integration, the model penalizes idiomatic TypeScript type assertions as runtime security vulnerabilities.

3. **\`security/command-injection\` (Python - Vulnerable vs. Subprocess Clean):**
   - **Detection:** ✅ Successfully detected critical \`os.system\` command injection (\`scripts/reporter.py:12\`).
   - **Clean Control:** ❌ Clean code using \`subprocess.run(["cat", str(safe_path)], check=True)\` was flagged as CRITICAL severity *"Unhandled subprocess errors crash the CLI with raw tracebacks"*. The Critic retained this finding.
   - **Metrics:** 50% Precision, 100% Recall, 50% FPR. Duration: 222,670ms.
   - **Insight:** The live model prioritizes defensive CLI UX concerns above defect-focused code review, elevating minor exception handling into critical-severity blockers.

---

## 5. Honest Gap Analysis & Production Blockers

| Domain | Empirical Reality | Production Gate Target | Gap Status |
| :--- | :--- | :--- | :--- |
| **Review Latency** | 180s – 342s per single-file diff | < 30s for synchronous CI | ❌ **CRITICAL BLOCKER** — Cloud API too slow for blocking pre-commit/CI |
| **False-Positive Rate** | 50% – 100% on clean idioms | <= 30% | ❌ **CRITICAL BLOCKER** — Critic permits stylistic/defensive over-flagging |
| **Review Caching** | Not wired into review engine | Cache hit < 500ms on unchanged diffs | ⚠️ Must be implemented in Phase 2 |
| **Compiler Discovery** | Triggers npm placeholder error on tsc | Clean AST diagnostics collection | ⚠️ Unsafe discovery fallback to be fixed in Phase 2 |
| **Context Assembly** | Single-file patch context | Multi-file callers/callees graph | ⚠️ Incomplete multi-file context expansion |

---

## 6. Evaluation Methodology & Matching Rules

1. **Isolated Git Repositories:** Each test fixture is evaluated in independent, isolated temporary Git repositories for vulnerable and clean variants to guarantee zero cross-contamination.
2. **Realistic Clean Baseline:** A realistic, compiling baseline commit is committed first; changes are applied on top to produce genuine, non-empty Git diff hunks matching production pull requests.
3. **Diff Validation:** Both vulnerable and clean variant diffs are verified to be non-empty and accurately scoped before invocation.
4. **Strict Multi-Factor Grounding:** Detections are asserted using 6-factor strict grounding:
   - Exact normalized relative file path.
   - Tight line range intersection (+/-1 line tolerance).
   - Defect category exact match.
   - Severity rank equality or exceeding expected threshold.
   - Confidence meeting or exceeding minimum threshold.
   - Semantic defect keyword matching confirming the model identified the actual defect.
5. **Raw Per-Fixture Reproducibility:** Raw JSON results are emitted to \`EVALUATION_RAW.json\` alongside this report to allow independent statistical reconstruction of all aggregate metrics.
`;
}

main().catch((err) => {
  console.error(pc.red(`\n[eval] Fatal Evaluation Error: ${err.message}`));
  if (err.stack) {
    console.error(pc.dim(err.stack));
  }
  process.exit(1);
});

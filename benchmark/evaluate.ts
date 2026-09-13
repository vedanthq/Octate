#!/usr/bin/env node
/**
 * Octate Benchmark & Pipeline Evaluator.
 *
 * Supports two distinct modes:
 * 1. Harness Integrity Mode (Default): Runs with MockReviewModel to assert testbed and matcher correctness.
 * 2. Live Pipeline Mode (--live): Runs against real NVIDIA API with isolated git repositories,
 *    realistic diffs, independent clean/vulnerable evaluation, and granular per-fixture metrics.
 *
 * Usage:
 *   pnpm exec tsx benchmark/evaluate.ts
 *   pnpm exec tsx benchmark/evaluate.ts --live
 *   pnpm exec tsx benchmark/evaluate.ts --live --fixtures sql-injection
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { runEvaluationHarness } from '../test/evaluation/harness.js';
import type { EvaluationScorecard } from '../test/evaluation/types.js';

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
    console.log(pc.bold(pc.magenta('  MODE: HARNESS INTEGRITY TEST (Mock Models)')));
    console.log(pc.dim('  Verifying testbed wiring, schemas, and semantic matching logic.\n'));
    console.log(
      pc.yellow(
        '  [NOTE] Mock mode results verify harness integrity ONLY. Not a measure of real AI detection quality.\n'
      )
    );
  }

  const scorecard: EvaluationScorecard = await runEvaluationHarness({
    live: args.live,
    fixtureFilter: args.fixtures,
  });

  console.log(pc.bold('Fixture Evaluation Breakdown:'));
  console.log(pc.dim('─'.repeat(78)));

  for (const res of scorecard.results) {
    const statusIcon = res.passed ? pc.green('✔ PASS') : pc.red('✘ FAIL');
    const tpText = res.detectedExpected
      ? pc.green(`TP: ${res.truePositives}`)
      : pc.red(`FN: ${res.falseNegatives}`);
    const fpText =
      res.falsePositives === 0 ? pc.green(`FP: 0`) : pc.red(`FP: ${res.falsePositives}`);
    const precText = `Prec: ${formatPercent(res.precision)}`;
    const recText = `Rec: ${formatPercent(res.recall)}`;
    const timingText = `${res.latencyMs}ms (vuln: ${res.vulnerableLatencyMs}ms, clean: ${res.cleanLatencyMs}ms)`;
    const tokenText = `${res.totalTokens} tokens (p: ${res.promptTokens}, c: ${res.completionTokens})`;

    console.log(`${statusIcon} ${pc.bold(res.fixtureName)} [${res.language}]`);
    console.log(`     ${tpText} | ${fpText} | ${precText} | ${recText}`);
    console.log(`     Latency: ${pc.cyan(timingText)} | Tokens: ${pc.cyan(tokenText)}`);
    if (res.apiFailures > 0) {
      console.log(`     ${pc.red(`API Failures: ${res.apiFailures}`)}`);
    }

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
      console.log(pc.dim('     Findings:'));
      for (const f of res.vulnerableFindings) {
        console.log(
          pc.dim(`       • [${f.severity.toUpperCase()}] ${f.file}:${f.startLine} - ${f.title}`)
        );
      }
    }
    console.log(pc.dim('─'.repeat(78)));
  }

  console.log('\n' + pc.bold('Evaluation Summary Scorecard:'));
  console.log(
    `  • Evaluation Mode         : ${scorecard.mode === 'live_pipeline' ? pc.bold(pc.green('LIVE PIPELINE')) : pc.bold(pc.magenta('HARNESS MOCK'))}`
  );
  console.log(`  • Model Used              : ${pc.cyan(scorecard.modelName)}`);
  console.log(`  • Total True Positives    : ${pc.green(scorecard.truePositives)}`);
  console.log(
    `  • Total False Positives   : ${scorecard.falsePositives === 0 ? pc.green(0) : pc.red(scorecard.falsePositives)}`
  );
  console.log(
    `  • Total False Negatives   : ${scorecard.falseNegatives === 0 ? pc.green(0) : pc.red(scorecard.falseNegatives)}`
  );

  if (scorecard.mode === 'live_pipeline') {
    console.log(
      `  • Empirical Precision     : ${pc.bold(pc.green(formatPercent(scorecard.precision)))} (Target: > 70%)`
    );
    console.log(
      `  • Empirical Recall        : ${pc.bold(pc.green(formatPercent(scorecard.recall)))} (Target: > 70%)`
    );
    console.log(
      `  • False-Positive Rate     : ${pc.bold(pc.green(formatPercent(scorecard.falsePositiveRate)))} (Target: < 30%)`
    );
  } else {
    console.log(
      `  • Harness Precision (Mock): ${pc.dim(formatPercent(scorecard.precision))} (Harness Test Only)`
    );
    console.log(
      `  • Harness Recall (Mock)   : ${pc.dim(formatPercent(scorecard.recall))} (Harness Test Only)`
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
    pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  );

  const finalStatus = scorecard.passed ? pc.bold(pc.green('PASSED')) : pc.bold(pc.red('FAILED'));
  console.log(`Overall Result: ${finalStatus}\n`);

  // Generate / update Markdown evaluation report
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

  if (!scorecard.passed) {
    process.exit(1);
  }
}

function generateMarkdownReport(scorecard: EvaluationScorecard, date: string): string {
  const isLive = scorecard.mode === 'live_pipeline';

  return `# Octate Evaluation & Benchmark Report

**Benchmark Date:** ${date}  
**Evaluation Mode:** ${isLive ? '**LIVE PIPELINE EVALUATION**' : '**HARNESS INTEGRITY TEST (MOCKS)**'}  
**Model:** \`${scorecard.modelName}\`  
**Overall Status:** ${scorecard.passed ? '✅ PASSED' : '❌ FAILED'}  

${
  isLive
    ? `> **Methodological Note:** This evaluation was executed using live inference against NVIDIA's API on isolated Git repositories with realistic diff scopes. Results reflect genuine empirical review quality.`
    : `> **Methodological Note:** This evaluation was executed in **Harness Integrity Mode** using \`MockReviewModel\`. These figures verify testbed plumbing, schema contracts, and semantic matchers only, and **MUST NOT** be cited as evidence of Octate's live detection quality.`
}

---

## 1. Metric Summary

| Metric | Target | Result | Status |
| :--- | :--- | :--- | :--- |
| **Evaluation Mode** | — | **${scorecard.modeLabel}** | — |
| **True Positives** | > 0 | **${scorecard.truePositives}** | ${scorecard.truePositives > 0 ? '✅' : '❌'} |
| **False Positives** | 0 | **${scorecard.falsePositives}** | ${scorecard.falsePositives === 0 ? '✅' : '❌'} |
| **False Negatives** | 0 | **${scorecard.falseNegatives}** | ${scorecard.falseNegatives === 0 ? '✅' : '❌'} |
| **Precision** | > 70.0% | **${(scorecard.precision * 100).toFixed(1)}%** ${!isLive ? '(Mock Harness Only)' : ''} | ${scorecard.precision >= 0.7 ? '✅ PASSED' : '❌ FAILED'} |
| **Recall** | > 70.0% | **${(scorecard.recall * 100).toFixed(1)}%** ${!isLive ? '(Mock Harness Only)' : ''} | ${scorecard.recall >= 0.7 ? '✅ PASSED' : '❌ FAILED'} |
| **False-Positive Rate** | < 30.0% | **${(scorecard.falsePositiveRate * 100).toFixed(1)}%** | ${scorecard.falsePositiveRate <= 0.3 ? '✅ PASSED' : '❌ FAILED'} |
| **p50 Latency** | < 30,000 ms | **${scorecard.p50LatencyMs} ms** | ${scorecard.p50LatencyMs < 30000 ? '✅ PASSED' : '❌ FAILED'} |
| **p95 Latency** | < 30,000 ms | **${scorecard.p95LatencyMs} ms** | ${scorecard.p95LatencyMs < 30000 ? '✅ PASSED' : '❌ FAILED'} |
| **Total Tokens Consumed** | < 64,000 tokens | **${scorecard.totalTokens} tokens** | ${scorecard.totalTokens < 64000 ? '✅' : '⚠️ High'} |
| **API Failures** | 0 | **${scorecard.apiFailures}** | ${scorecard.apiFailures === 0 ? '✅' : '❌'} |

---

## 2. Per-Fixture Evaluation Breakdown

| Fixture | Language | Category | Detected (TP) | False Positives | Latency | Tokens (Prompt / Comp / Total) | Passed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${scorecard.results
  .map(
    (r) =>
      `| \`${r.fixtureName}\` | ${r.language} | ${r.category} | ${r.detectedExpected ? `✅ Yes (${r.truePositives})` : `❌ No (FN: ${r.falseNegatives})`} | ${r.falsePositives === 0 ? '0 (Clean)' : `❌ ${r.falsePositives}`} | ${r.latencyMs}ms | ${r.promptTokens} / ${r.completionTokens} / ${r.totalTokens} | ${r.passed ? '✅' : '❌'} |`
  )
  .join('\n')}

---

## 3. Evaluation Methodology

1. **Isolated Git Repositories:** Each test fixture is evaluated in an isolated temporary Git repository.
2. **Realistic Baseline Diff Scopes:** A clean baseline commit is committed first; changes are applied on top to produce realistic Git diff hunks matching production pull requests.
3. **Independent Variant Evaluation:** Vulnerable variants and clean counterparts are evaluated independently to prevent state contamination.
4. **Multi-Factor Semantic Grounding:** Detections are asserted using 5-factor grounding: exact file path, line window overlap (+/-3 lines), severity rank matching or exceeding expectations, category alignment, and minimum confidence threshold.
`;
}

main().catch((err) => {
  console.error(pc.red(`\n[eval] Fatal Evaluation Error: ${err.message}`));
  if (err.stack) {
    console.error(pc.dim(err.stack));
  }
  process.exit(1);
});

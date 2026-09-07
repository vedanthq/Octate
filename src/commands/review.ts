/**
 * Review command - runs code review with various scope and output options.
 */

import { Command } from 'commander';
import { resolve, relative } from 'node:path';
import { createLogger } from '../logging/index.js';
import { loadConfig } from '../config/merger.js';
import { findGitRoot } from '../repository/discovery.js';
import { resolveScope, parseRange, type ScopeOptions } from '../repository/scope.js';
import { CancellationController, createCancellationController, withCancellation } from '../cancellation/index.js';
import {
  ConfigurationError,
  GitError,
  ModelError,
  InternalError,
  isConfigurationError,
  isGitError,
  isModelError,
} from '../errors/index.js';

const logger = createLogger('commands:review');

/**
 * Creates the review command for Commander.js.
 */
export function createReviewCommand(): Command {
  const cmd = new Command('review')
    .description('Run code review on the specified scope')
    .argument('[refs...]', 'Git refs to review (commits, branches, tags)')
    .option('-s, --staged', 'Review staged changes (index vs HEAD)')
    .option('-w, --working', 'Review working tree changes (working dir vs index)')
    .option('-c, --commit <ref>', 'Review a specific commit (commit vs parent)')
    .option('-r, --range <range>', 'Review a range of commits (base..head or base...head)')
    .option('--branch <branch>', 'Review changes on a branch vs its merge base with HEAD')
    .option('-j, --json', 'Output results as JSON')
    .option('--sarif', 'Output results as SARIF v2.1.0')
    .option('-q, --quiet', 'Minimal output (summary only)')
    .option('--output <file>', 'Write output to file instead of stdout')
    .option('--no-tui', 'Disable interactive TUI (use with --json/--sarif/--quiet)')
    .action(async (refs: string[], options: ReviewOptions) => {
      const controller = createCancellationController();
      return runReview(controller, refs, options);
    });

  return cmd;
}

/**
 * Review command options interface.
 */
interface ReviewOptions {
  staged?: boolean;
  working?: boolean;
  commit?: string;
  range?: string;
  branch?: string;
  json?: boolean;
  sarif?: boolean;
  quiet?: boolean;
  output?: string;
  tui?: boolean;
  config?: string;
  cacheDir?: string;
  logLevel?: string;
  debug?: boolean;
  color?: boolean;
}

/**
 * Validates that exactly one scope option is provided.
 */
function validateScope(options: ReviewOptions): void {
  const scopes = [
    options.staged,
    options.working,
    options.commit,
    options.range,
    options.branch,
  ].filter(Boolean).length;

  if (scopes === 0) {
    throw new ConfigurationError(
      'No scope specified. Use one of: --staged, --working, --commit <ref>, --range <range>, --branch <branch>'
    );
  }

  if (scopes > 1) {
    throw new ConfigurationError(
      'Multiple scopes specified. Use exactly one of: --staged, --working, --commit, --range, --branch'
    );
  }
}

/**
 * Validates output mode options are mutually exclusive.
 */
function validateOutputMode(options: ReviewOptions): void {
  const modes = [options.json, options.sarif, options.quiet].filter(Boolean).length;
  if (modes > 1) {
    throw new ConfigurationError(
      'Output modes are mutually exclusive. Use exactly one of: --json, --sarif, --quiet'
    );
  }
}

/**
 * Determines the scope type and options from CLI flags.
 */
function getScopeOptions(options: ReviewOptions, refs: string[], repoRoot: string): ScopeOptions {
  if (options.staged) {
    return { type: 'staged', repoRoot };
  }
  if (options.working) {
    return { type: 'working-tree', repoRoot };
  }
  if (options.commit) {
    return { type: 'commit', repoRoot, commit: options.commit };
  }
  if (options.range) {
    const { base, head, isThreeDot } = parseRange(options.range);
    return { type: 'range', repoRoot, base, head };
  }
  if (options.branch) {
    return { type: 'branch', repoRoot, branch: options.branch };
  }
  // Default to working tree if refs provided but no explicit scope
  if (refs.length > 0) {
    return { type: 'working-tree', repoRoot };
  }
  throw new ConfigurationError('No scope specified');
}

/**
 * Main review execution function.
 */
async function runReview(
  controller: CancellationController,
  refs: string[],
  options: ReviewOptions
): Promise<void> {
  const startTime = Date.now();

  try {
    // Validate scope and output options
    validateScope(options);
    validateOutputMode(options);

    // Find Git repository root
    const cwd = process.cwd();
    const repoRoot = await findGitRoot(cwd);
    if (!repoRoot) {
      throw new GitError('Not a Git repository (or any parent directory)', { cwd });
    }

    logger.info({ repoRoot, refs, options }, 'Starting review');

    // Load configuration
    const config = await loadConfig({
      cliConfig: {
        review: {
          severity: options.quiet ? 'info' : 'medium',
          maxFindings: 50,
        },
      },
    });

    // Resolve review scope
    const scopeOptions = getScopeOptions(options, refs, repoRoot);
    const scope = await resolveScope(scopeOptions);

    logger.info(
      { scopeType: scope.type, base: scope.base, head: scope.head, fileCount: scope.files.length },
      'Review scope resolved'
    );

    // Run review with cancellation
    const result = await withCancellation(controller, async (signal) => {
      return executeReview(scope, config, signal);
    });

    // Output results
    await outputResults(result, options);

    const duration = Date.now() - startTime;
    logger.info({ duration: `${duration}ms` }, 'Review completed');
  } catch (error) {
    controller.abort(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Executes the review logic (placeholder for Phase 5+ integration).
 */
async function executeReview(
  scope: Awaited<ReturnType<typeof resolveScope>>,
  config: Awaited<ReturnType<typeof loadConfig>>,
  _signal: AbortSignal
): Promise<ReviewResult> {
  // This is a placeholder implementation for Phase 1
  // Full review engine will be implemented in Phase 5
  logger.info('Executing review (placeholder implementation)');

  return {
    summary: {
      totalFindings: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      filesAnalyzed: scope.files.length,
      duration: 0,
    },
    findings: [],
    metadata: {
      scopeType: scope.type,
      base: scope.base,
      head: scope.head,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    },
  };
}

/**
 * Review result structure.
 */
interface ReviewResult {
  summary: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    filesAnalyzed: number;
    duration: number;
  };
  findings: Array<{
    type: string;
    severity: string;
    file: string;
    line: number;
    message: string;
    suggestion?: string;
    confidence: number;
  }>;
  metadata: {
    scopeType: string;
    base: string;
    head: string;
    timestamp: string;
    version: string;
  };
}

/**
 * Outputs results based on selected format.
 */
async function outputResults(result: ReviewResult, options: ReviewOptions): Promise<void> {
  let output = '';

  if (options.json) {
    output = JSON.stringify(result, null, 2);
  } else if (options.sarif) {
    output = convertToSarif(result);
  } else if (options.quiet) {
    output = formatQuietOutput(result);
  } else {
    // Default TUI output (placeholder)
    output = formatDefaultOutput(result);
  }

  if (options.output) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(options.output, output, 'utf-8');
    logger.info({ output: options.output }, 'Results written to file');
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI user output
    console.log(output);
  }
}

/**
 * Converts review result to SARIF format (placeholder).
 */
function convertToSarif(result: ReviewResult): string {
  const sarif = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'Octate',
            version: result.metadata.version,
            informationUri: 'https://octate.dev',
          },
        },
        results: result.findings.map((f) => ({
          ruleId: f.type,
          level: severityToSarifLevel(f.severity),
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: { startLine: f.line },
              },
            },
          ],
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function severityToSarifLevel(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'note';
    default:
      return 'none';
  }
}

/**
 * Formats output for --quiet mode.
 */
function formatQuietOutput(result: ReviewResult): string {
  const { totalFindings, bySeverity, filesAnalyzed } = result.summary;
  const critical = bySeverity.critical ?? 0;
  const high = bySeverity.high ?? 0;

  if (totalFindings === 0) {
    return `✓ No findings in ${filesAnalyzed} files`;
  }

  const parts = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (high > 0) parts.push(`${high} high`);
  if ((bySeverity.medium ?? 0) > 0) parts.push(`${bySeverity.medium} medium`);
  if ((bySeverity.low ?? 0) > 0) parts.push(`${bySeverity.low} low`);
  if ((bySeverity.info ?? 0) > 0) parts.push(`${bySeverity.info} info`);

  return `✗ ${parts.join(', ')} in ${filesAnalyzed} files`;
}

/**
 * Formats default human-readable output.
 */
function formatDefaultOutput(result: ReviewResult): string {
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ' Octate Code Review',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Scope: ${result.metadata.scopeType} (${result.metadata.base} → ${result.metadata.head})`,
    `Files analyzed: ${result.summary.filesAnalyzed}`,
    `Findings: ${result.summary.totalFindings}`,
    '',
  ];

  if (result.findings.length === 0) {
    lines.push('✓ No issues found');
  } else {
    lines.push('Findings:');
    for (const finding of result.findings) {
      const severityIcon = getSeverityIcon(finding.severity);
      lines.push(`  ${severityIcon} [${finding.severity.toUpperCase()}] ${finding.file}:${finding.line}`);
      lines.push(`      ${finding.message}`);
      if (finding.suggestion) {
        lines.push(`      💡 ${finding.suggestion}`);
      }
      lines.push('');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🔵';
    case 'info':
      return '⚪';
    default:
      return '⚫';
  }
}

/**
 * Exported review command for registration.
 */
export const reviewCommand = createReviewCommand();
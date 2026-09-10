/**
 * Review command - runs code review with various scope and output options.
 */

import { Command } from 'commander';
import { analyzeFiles } from '../analysis/orchestrator.js';
import {
  type CancellationController,
  createCancellationController,
  withCancellation,
} from '../cancellation/index.js';
import { loadConfig } from '../config/merger.js';
import { ConfigurationError, GitError } from '../errors/index.js';
import {
  createContextEngine,
  createPathResolver,
  createReferenceGraph,
  createSymbolIndex,
  serializePromptContext,
} from '../intelligence/index.js';
import { createLogger } from '../logging/index.js';
import { LocalNvidiaProvider, type ReviewModelInterface } from '../model/index.js';
import { findGitRoot } from '../repository/discovery.js';
import { parseRange, resolveScope, type ScopeOptions } from '../repository/scope.js';
import { createReviewEngine, type RankedFinding, type ReviewResult } from '../review/index.js';

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
      await runReview(controller, refs, options);
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
    const { base, head } = parseRange(options.range);
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
          minConfidence: 0.6,
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
    const result = await withCancellation(async (signal) => {
      return await executeReview(scope, config, signal, repoRoot);
    }, controller.signal);

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
 * Executes the review logic using AnalysisOrchestrator and ContextEngine.
 */
export async function executeReview(
  scope: Awaited<ReturnType<typeof resolveScope>>,
  config: Awaited<ReturnType<typeof loadConfig>>,
  signal: AbortSignal,
  repoRoot: string,
  modelOverride?: ReviewModelInterface
): Promise<ReviewResult> {
  const startTime = Date.now();
  const filePaths = scope.files.map((f) => f.path);

  logger.info({ fileCount: filePaths.length }, 'Running deterministic analysis pipeline');

  // 1. Run Analysis Orchestrator (Tree-sitter parse, symbol extraction, static diagnostics)
  const analysis = await analyzeFiles(filePaths, repoRoot, { signal });

  // 2. Read file contents into map for intelligence layer
  const { readFile } = await import('node:fs/promises');
  const fileContents = new Map<string, string>();
  await Promise.all(
    filePaths.map(async (file) => {
      try {
        const content = await readFile(`${repoRoot}/${file}`, 'utf-8');
        fileContents.set(file, content);
      } catch {
        fileContents.set(file, '');
      }
    })
  );

  // 3. Build SymbolIndex and PathResolver
  const symbolIndex = createSymbolIndex(analysis.parsedFiles, fileContents);
  const pathResolver = await createPathResolver(repoRoot);

  // 4. Build ReferenceGraph
  const referenceGraph = createReferenceGraph(
    analysis.parsedFiles,
    symbolIndex,
    pathResolver,
    undefined,
    fileContents
  );

  // 5. Build ReviewContext via ContextEngine
  const contextEngine = createContextEngine();
  const reviewContext = await contextEngine.buildContext({
    changedFiles: filePaths,
    diff: scope.diff,
    symbolIndex,
    referenceGraph,
    diagnostics: analysis.diagnostics,
    readFile: async (file: string) => {
      const existing = fileContents.get(file);
      if (existing !== undefined) return existing;
      try {
        const c = await readFile(`${repoRoot}/${file}`, 'utf-8');
        fileContents.set(file, c);
        return c;
      } catch {
        return '';
      }
    },
  });

  // Log context metrics via Pino logger
  logger.info(
    {
      candidateCount: reviewContext.metrics.candidateCount,
      selectedCount: reviewContext.metrics.selectedCount,
      candidateTokens: reviewContext.metrics.candidateTokens,
      selectedTokens: reviewContext.metrics.selectedTokens,
      selectionRatio: reviewContext.metrics.selectionRatio,
      totalTokens: reviewContext.totalTokens,
    },
    'Context Engine token budgeting metrics'
  );

  // 6. Execute full ReviewEngine pipeline
  const model = modelOverride ?? new LocalNvidiaProvider();
  const engine = createReviewEngine();

  const result = await engine.run({
    repoRoot,
    diff: scope.diff,
    changedFiles: filePaths,
    reviewContext,
    referenceGraph,
    symbolIndex,
    diagnostics: analysis.diagnostics,
    model,
    config: config.review,
    signal,
    scopeMetadata: {
      scopeType: scope.type,
      base: scope.base,
      head: scope.head,
    },
  });

  return result;
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
          ruleId: f.category,
          level: severityToSarifLevel(f.severity),
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: { startLine: f.startLine ?? f.line ?? 1 },
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

  const parts: string[] = [];
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
  const baseHead =
    result.metadata.base || result.metadata.head
      ? ` (${result.metadata.base ?? ''} → ${result.metadata.head ?? ''})`
      : '';
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ' Octate Code Review',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Scope: ${result.metadata.scopeType}${baseHead}`,
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
      const lineNum = finding.startLine ?? finding.line ?? 1;
      lines.push(
        `  ${severityIcon} [${finding.severity.toUpperCase()}] ${finding.file}:${lineNum}`
      );
      lines.push(`      ${finding.message}`);
      const fix = finding.suggestedFix ?? (finding as { suggestion?: string }).suggestion;
      if (fix) {
        lines.push(`      💡 ${fix}`);
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

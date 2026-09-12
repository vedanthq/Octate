/**
 * Review command - runs code review with various scope and output options.
 */

import { resolve } from 'node:path';
import { Command } from 'commander';
import { countBlockingFindings, formatFailureBanner } from '../application/policy.js';
import { StderrProgressReporter } from '../application/progress.js';
import { createReviewUseCase } from '../application/review.js';
import type { ReviewFailOnSeverity } from '../application/types.js';
import {
  type CancellationController,
  createCancellationController,
} from '../cancellation/index.js';
import { loadConfig } from '../config/merger.js';
import { ConfigurationError, GitError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';
import { createRenderer, type OutputFormat } from '../renderers/index.js';
import { InteractiveTuiRenderer } from '../renderers/tui/renderer.js';
import { shouldUseTui } from '../renderers/tui/terminal.js';
import { findGitRoot } from '../repository/discovery.js';
import { parseRange, type resolveScope, type ScopeOptions } from '../repository/scope.js';
import type { ReviewResult } from '../review/types.js';

const logger = createLogger('commands:review');

class AbortError extends Error {
  constructor(message = 'Review cancelled by user') {
    super(message);
    this.name = 'AbortError';
  }
}

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
    .option(
      '--fail-on <severity>',
      'Fail with exit code 1 on findings meeting or exceeding severity (critical, high, medium, low, info, none, off)'
    )
    .option('-j, --json', 'Output results as JSON')
    .option('--sarif', 'Output results as SARIF v2.1.0')
    .option('-q, --quiet', 'Minimal output (summary only)')
    .option('--dir <path>', 'Repository or directory to review (defaults to current working directory)')
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
export interface ReviewOptions {
  staged?: boolean | undefined;
  working?: boolean | undefined;
  commit?: string | undefined;
  range?: string | undefined;
  branch?: string | undefined;
  failOn?: ReviewFailOnSeverity | undefined;
  json?: boolean | undefined;
  sarif?: boolean | undefined;
  quiet?: boolean | undefined;
  output?: string | undefined;
  dir?: string | undefined;
  tui?: boolean | undefined;
  config?: string | undefined;
  cacheDir?: string | undefined;
  logLevel?: string | undefined;
  debug?: boolean | undefined;
  color?: boolean | undefined;
}

/**
 * Validates that at most one scope option is provided.
 */
export function validateScope(options: ReviewOptions): void {
  const scopes = [
    options.staged,
    options.working,
    options.commit,
    options.range,
    options.branch,
  ].filter(Boolean).length;

  if (scopes > 1) {
    throw new ConfigurationError(
      'Multiple scopes specified. Use exactly one of: --staged, --working, --commit, --range, --branch'
    );
  }
}

/**
 * Validates output mode options are mutually exclusive.
 */
export function validateOutputMode(options: ReviewOptions): void {
  const modes = [options.json, options.sarif, options.quiet].filter(Boolean).length;
  if (modes > 1) {
    throw new ConfigurationError(
      'Output modes are mutually exclusive. Use exactly one of: --json, --sarif, --quiet'
    );
  }
}

/**
 * Determines the scope type and options from CLI flags or positional refs.
 */
export function getScopeOptions(
  options: ReviewOptions,
  refs: string[] = [],
  repoRoot: string
): ScopeOptions {
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
    return { type: 'range', repoRoot, base, head, isThreeDot };
  }
  if (options.branch) {
    return { type: 'branch', repoRoot, branch: options.branch };
  }

  // Positional refs
  if (refs.length > 0 && refs[0]) {
    const ref = refs[0];
    if (ref.includes('..')) {
      const { base, head, isThreeDot } = parseRange(ref);
      return { type: 'range', repoRoot, base, head, isThreeDot };
    }
    return { type: 'commit', repoRoot, commit: ref };
  }

  // Default invocation: working-tree
  return { type: 'working-tree', repoRoot };
}

/**
 * Main review execution function.
 */
export async function runReview(
  controller: CancellationController,
  refs: string[],
  options: ReviewOptions
): Promise<void> {
  let sigintCount = 0;
  const sigintHandler = () => {
    sigintCount += 1;
    if (sigintCount >= 2) {
      process.exit(130);
    }
    if (!options.quiet && !options.json && !options.sarif) {
      process.stderr.write('\n⚠️ Review cancelled by user.\n');
    }
    controller.abort(new AbortError('Review cancelled by user'));
  };

  process.on('SIGINT', sigintHandler);

  try {
    // Validate scope and output options
    validateScope(options);
    validateOutputMode(options);

    // Find Git repository root
    const cwd = options.dir ? resolve(options.dir) : process.cwd();
    const repoRoot = await findGitRoot(cwd);
    if (!repoRoot) {
      throw new GitError('Not a Git repository (or any parent directory)', {
        cwd,
      });
    }

    logger.info({ repoRoot, refs, options }, 'Starting review');

    // Load configuration
    const config = await loadConfig({
      configPath: options.config,
      cliConfig: {
        review: {
          severity: options.quiet ? 'info' : 'medium',
          failOnSeverity: options.failOn ?? 'critical',
          maxFindings: 50,
          minConfidence: 0.6,
        },
      },
    });

    // Resolve review scope options
    const scopeOptions = getScopeOptions(options, refs, repoRoot);

    const isInteractiveTui = shouldUseTui({
      isTTY: Boolean(process.stdout.isTTY),
      ci: Boolean(process.env.CI),
      term: process.env.TERM,
      plain: false,
      noTui: options.tui === false,
      json: options.json,
      sarif: options.sarif,
      quiet: options.quiet,
      outputFile: options.output,
    });

    const format: OutputFormat = options.json
      ? 'json'
      : options.sarif
        ? 'sarif'
        : options.quiet
          ? 'quiet'
          : isInteractiveTui
            ? 'tui'
            : 'console';

    const useCase = createReviewUseCase();

    if (isInteractiveTui) {
      const effectiveFailOn: ReviewFailOnSeverity =
        options.failOn ?? config.review.failOnSeverity ?? 'critical';

      const tuiRenderer = new InteractiveTuiRenderer({
        repoRoot,
        scopeType: options.staged ? 'staged' : refs.length > 0 ? 'ref' : 'workspace',
        failOn: effectiveFailOn,
        onReReview: async () => {
          const freshResult = await useCase.execute({
            repoRoot,
            scopeOptions,
            refs,
            config,
            signal: controller.signal,
            onProgress: (event) => tuiRenderer.dispatchProgress(event),
          });
          tuiRenderer.dispatchResult(freshResult);
        },
      });

      tuiRenderer.start();

      try {
        const result = await useCase.execute({
          repoRoot,
          scopeOptions,
          refs,
          config,
          signal: controller.signal,
          onProgress: (event) => tuiRenderer.dispatchProgress(event),
        });

        await tuiRenderer.render(result);
      } catch (error) {
        tuiRenderer.exit();
        throw error;
      }
    } else {
      const reporter = new StderrProgressReporter({
        quiet: options.quiet,
        json: options.json,
        sarif: options.sarif,
      });

      const result = await useCase.execute({
        repoRoot,
        scopeOptions,
        refs,
        config,
        signal: controller.signal,
        onProgress: reporter.report,
      });

      reporter.clear();

      const renderer = createRenderer(format, {
        outputFile: options.output,
        color: options.color,
      });

      await renderer.render(result);

      // Evaluate exit code policy
      const threshold: ReviewFailOnSeverity =
        options.failOn ?? config.review.failOnSeverity ?? 'critical';
      const blockingCount = countBlockingFindings(result.findings, threshold);

      if (blockingCount > 0) {
        process.stderr.write(formatFailureBanner(blockingCount, threshold));
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    }
  } catch (error) {
    controller.abort(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    process.off('SIGINT', sigintHandler);
  }
}

/**
 * Executes the review logic using AnalysisOrchestrator and ContextEngine.
 * Maintained for backward-compatible integration.
 */
export async function executeReview(
  scope: Awaited<ReturnType<typeof resolveScope>>,
  config: Awaited<ReturnType<typeof loadConfig>>,
  signal: AbortSignal,
  repoRoot: string,
  modelOverride?: import('../model/index.js').ReviewModelInterface
): Promise<ReviewResult> {
  const { analyzeFiles } = await import('../analysis/orchestrator.js');
  const { createContextEngine, createPathResolver, createReferenceGraph, createSymbolIndex } =
    await import('../intelligence/index.js');
  const { LocalNvidiaProvider } = await import('../model/index.js');
  const { createReviewEngine } = await import('../review/index.js');

  const filePaths = scope.files.map((f) => f.path);
  const analysis = await analyzeFiles(filePaths, repoRoot, { signal });

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

  const symbolIndex = createSymbolIndex(analysis.parsedFiles, fileContents);
  const pathResolver = await createPathResolver(repoRoot);
  const referenceGraph = createReferenceGraph(
    analysis.parsedFiles,
    symbolIndex,
    pathResolver,
    undefined,
    fileContents
  );

  const contextEngine = createContextEngine();
  const reviewContext = await contextEngine.buildContext({
    changedFiles: filePaths,
    diff: scope.diff,
    symbolIndex,
    referenceGraph,
    diagnostics: analysis.diagnostics,
    readFile: async (file: string) => {
      const existing = fileContents.get(file);
      if (existing !== undefined) {
        return existing;
      }
      try {
        const c = await readFile(`${repoRoot}/${file}`, 'utf-8');
        fileContents.set(file, c);
        return c;
      } catch {
        return '';
      }
    },
  });

  const model =
    (modelOverride as unknown as import('../model/types.js').ReviewModel) ??
    new LocalNvidiaProvider();
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
 * Exported review command for registration.
 */
export const reviewCommand = createReviewCommand();

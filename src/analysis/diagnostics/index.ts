/**
 * Main diagnostic collection module.
 */

import { createLogger } from '../../logging/index.js';
import type { Diagnostic } from '../../model/types.js';
import { detectTools, runToolsParallel } from './tools.js';

const log = createLogger('diagnostics');

export interface DiagnosticCollection {
  diagnostics: Diagnostic[];
  toolResults: Map<string, { count: number; timeMs: number }>;
  totalTimeMs: number;
}

/**
 * Collects diagnostics from static analysis tools for the given files.
 * Per D-09: Parallel execution with concurrency limit using p-limit
 * Per D-12: Graceful degradation for tool failures
 */
export async function collectDiagnostics(
  files: string[],
  repoRoot: string,
  languages: string[],
  signal?: AbortSignal
): Promise<DiagnosticCollection> {
  const startTime = Date.now();

  if (files.length === 0) {
    return {
      diagnostics: [],
      toolResults: new Map(),
      totalTimeMs: 0,
    };
  }

  if (signal?.aborted) {
    throw new Error('Diagnostics collection aborted');
  }

  // 1. Detect available tools
  const tools = await detectTools(repoRoot, languages);
  log.debug({ toolCount: tools.length, tools: tools.map((t) => t.name) }, 'Detected tools');

  if (tools.length === 0) {
    log.warn('No static analysis tools available');
    return {
      diagnostics: [],
      toolResults: new Map(),
      totalTimeMs: Date.now() - startTime,
    };
  }

  // 2. Group files by language
  const filesByLanguage = new Map<string, string[]>();
  for (const file of files) {
    const ext = file.split('.').pop()?.toLowerCase();
    let lang = 'unknown';
    if (ext === 'ts' || ext === 'tsx') lang = 'typescript';
    else if (ext === 'js' || ext === 'jsx') lang = 'javascript';
    else if (ext === 'py') lang = 'python';

    if (!filesByLanguage.has(lang)) {
      filesByLanguage.set(lang, []);
    }
    filesByLanguage.get(lang)?.push(file);
  }

  // 3. Filter tools to only those matching detected languages
  const relevantTools = tools.filter((tool) => tool.languages.some((l) => filesByLanguage.has(l)));

  // 4. Run tools in parallel with bounded concurrency
  const toolResults = await runToolsParallel(relevantTools, files, repoRoot, signal);

  // 5. Collect and deduplicate diagnostics
  const allDiagnostics: Diagnostic[] = [];
  const toolMetrics = new Map<string, { count: number; timeMs: number }>();

  for (const [toolName, diagnostics] of toolResults) {
    allDiagnostics.push(...diagnostics);
    toolMetrics.set(toolName, { count: diagnostics.length, timeMs: 0 }); // timeMs tracked in runTool
  }

  // 6. Deduplicate diagnostics (same file, line, message, source)
  const seen = new Set<string>();
  const deduplicated: Diagnostic[] = [];

  for (const diag of allDiagnostics) {
    const key = `${diag.file}:${diag.startLine}:${diag.startColumn}:${diag.message}:${diag.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(diag);
    }
  }

  log.info(
    {
      totalDiagnostics: deduplicated.length,
      tools: Array.from(toolMetrics.keys()),
      timeMs: Date.now() - startTime,
    },
    'Diagnostics collected'
  );

  return {
    diagnostics: deduplicated,
    toolResults: toolMetrics,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Runs a single tool and returns diagnostics (for testing).
 */
export { normalizeDiagnostic } from './severity.js';

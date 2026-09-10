/**
 * Analysis orchestrator combining parsing, symbol extraction, and diagnostics.
 */

import { createLogger } from '../logging/index.js';
import type { Diagnostic } from '../model/types.js';
import { collectDiagnostics, type DiagnosticCollection } from './diagnostics/index.js';
import { parseFiles } from './parser/index.js';
import { extractSymbols } from './symbols/index.js';
import type { ParsedFile, ParseOptions, ParseResult } from './types.js';

const log = createLogger('analysis/orchestrator');

export interface AnalysisResult {
  parsedFiles: ParsedFile[];
  symbols: import('./types.js').Symbol[];
  diagnostics: Diagnostic[];
  errors: Array<{ file: string; error: Error }>;
  metrics: {
    totalFiles: number;
    parsedFiles: number;
    symbolCount: number;
    diagnosticCount: number;
    parseTimeMs: number;
    diagnosticsTimeMs: number;
    totalTimeMs: number;
  };
}

/**
 * Analyzes files through the complete analysis pipeline:
 * 1. Parse all files with Tree-sitter (parallel)
 * 2. Extract symbols from each parsed file
 * 3. Detect languages from file extensions
 * 4. Run static analysis tools for detected languages
 * 5. Collect and structure diagnostics
 * 6. Return combined AnalysisResult
 */
export async function analyzeFiles(
  files: string[],
  repoRoot: string,
  options?: {
    signal?: AbortSignal;
    includeTests?: boolean;
  }
): Promise<AnalysisResult> {
  const totalStartTime = Date.now();

  // Read file contents
  const { readFile } = await import('node:fs/promises');
  const fileContents = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await readFile(`${repoRoot}/${file}`, 'utf-8');
        return { path: file, content };
      } catch (error) {
        log.warn({ file, error }, 'Failed to read file');
        return { path: file, content: '' };
      }
    })
  );

  const validFiles = fileContents.filter((f) => f.content.length > 0);

  // 1. Parse all files with Tree-sitter
  const parseStartTime = Date.now();
  let parseResult: ParseResult;

  const parseOptions: ParseOptions = {};
  if (options?.signal) {
    parseOptions.signal = options.signal;
  }

  // Check abort signal before parsing
  if (options?.signal?.aborted) {
    throw new Error('Analysis aborted');
  }

  try {
    parseResult = await parseFiles(validFiles, parseOptions);
  } catch (error) {
    // Re-throw abort errors, handle other errors gracefully
    if (error instanceof Error && error.message === 'Parsing aborted') {
      throw error;
    }
    log.error({ error }, 'Parse failed');
    parseResult = {
      files: [],
      errors: [{ file: 'unknown', error: error as Error }],
      totalTimeMs: Date.now() - parseStartTime,
    };
  }

  // 2. Extract symbols from each parsed file
  const allSymbols: import('./types.js').Symbol[] = [];
  for (const parsedFile of parseResult.files) {
    try {
      const symbols = extractSymbols(parsedFile);
      parsedFile.symbols = symbols;
      allSymbols.push(...symbols);
    } catch (error) {
      log.warn({ file: parsedFile.file, error }, 'Symbol extraction failed');
      parseResult.errors.push({ file: parsedFile.file, error: error as Error });
    }
  }

  // 3. Detect languages from parsed files
  const languages = Array.from(new Set(parseResult.files.map((f) => f.language)));

  // 4. Run static analysis tools
  const _diagnosticsStartTime = Date.now();
  let diagnosticsResult: DiagnosticCollection;

  try {
    const filePaths = parseResult.files.map((f) => f.file);
    diagnosticsResult = await collectDiagnostics(filePaths, repoRoot, languages, options?.signal);
  } catch (error) {
    log.error({ error }, 'Diagnostics collection failed');
    diagnosticsResult = {
      diagnostics: [],
      toolResults: new Map(),
      totalTimeMs: 0,
    };
  }

  const totalTimeMs = Date.now() - totalStartTime;

  // Build metrics
  const metrics = {
    totalFiles: files.length,
    parsedFiles: parseResult.files.length,
    symbolCount: allSymbols.length,
    diagnosticCount: diagnosticsResult.diagnostics.length,
    parseTimeMs: parseResult.totalTimeMs,
    diagnosticsTimeMs: diagnosticsResult.totalTimeMs,
    totalTimeMs,
  };

  log.info(metrics, 'Analysis complete');

  return {
    parsedFiles: parseResult.files,
    symbols: allSymbols,
    diagnostics: diagnosticsResult.diagnostics,
    errors: parseResult.errors,
    metrics,
  };
}

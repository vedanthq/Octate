/**
 * Tree-sitter WASM parser with eager language loading.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import { createLogger } from '../../logging/index.js';
import type { ParsedFile, ParseOptions, ParseResult } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('parser');

let parserInstance: Parser | null = null;
let languageMap: Map<string, Language> | null = null;

export interface ParserState {
  parser: Parser;
  languages: Map<string, Language>;
}

/**
 * Resolves the filesystem path for a Tree-sitter WASM grammar file (D-09).
 * Prioritizes production distribution (dist/wasm/), then development (test-wasm/),
 * then CWD fallback.
 */
export function resolveWasmPath(filename: string): string {
  // 1. Check production distribution layout: dist/wasm/<filename>
  const prodPath = path.resolve(__dirname, '../../wasm', filename);
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  // 2. Check development source layout: test-wasm/<filename>
  const devPath = path.resolve(__dirname, '../../../test-wasm', filename);
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // 3. Check CWD fallback
  const cwdPath = path.resolve(process.cwd(), 'test-wasm', filename);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  // 4. Check dist/wasm in CWD
  const cwdDistPath = path.resolve(process.cwd(), 'dist/wasm', filename);
  if (fs.existsSync(cwdDistPath)) {
    return cwdDistPath;
  }

  throw new Error(
    `Tree-sitter WASM grammar not found: ${filename}. Checked: ${prodPath}, ${devPath}, ${cwdPath}`
  );
}

export async function initParser(): Promise<ParserState> {
  if (parserInstance && languageMap) {
    return { parser: parserInstance, languages: languageMap };
  }

  log.debug('Initializing Tree-sitter WASM parser');

  await Parser.init();
  parserInstance = new Parser();
  languageMap = new Map();

  // Load language WASM files with dynamic path resolution
  const tsWasm = resolveWasmPath('tree-sitter-typescript.wasm');
  const tsLanguage = await Language.load(tsWasm);
  languageMap.set('typescript', tsLanguage);
  languageMap.set('javascript', tsLanguage);

  const pyWasm = resolveWasmPath('tree-sitter-python.wasm');
  const pyLanguage = await Language.load(pyWasm);
  languageMap.set('python', pyLanguage);

  log.debug('Tree-sitter parser initialized with languages: %o', Array.from(languageMap.keys()));

  return { parser: parserInstance, languages: languageMap };
}

function detectLanguage(filePath: string): 'typescript' | 'javascript' | 'python' | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx') return 'javascript';
  if (ext === 'py') return 'python';
  return null;
}

export async function parseFile(
  filePath: string,
  content: string,
  options?: ParseOptions
): Promise<ParsedFile | null> {
  const startTime = Date.now();

  if (options?.signal?.aborted) {
    throw new Error('Parsing aborted');
  }

  const language = detectLanguage(filePath);
  if (!language) {
    log.warn({ file: filePath }, 'Unsupported file type');
    return null;
  }

  const state = await initParser();
  const lang = state.languages.get(language);

  if (!lang) {
    log.error({ file: filePath, language }, 'Language not loaded');
    return null;
  }

  state.parser.setLanguage(lang);

  try {
    const tree = state.parser.parse(content);

    const parseTimeMs = Date.now() - startTime;

    return {
      file: filePath,
      language,
      tree,
      symbols: [],
      parseTimeMs,
    };
  } catch (error) {
    const parseTimeMs = Date.now() - startTime;
    log.warn({ file: filePath, error }, 'Parse error - graceful degradation');
    return {
      file: filePath,
      language,
      tree: null,
      symbols: [],
      parseTimeMs,
    };
  }
}

export async function parseFiles(
  files: Array<{ path: string; content: string }>,
  options?: ParseOptions
): Promise<ParseResult> {
  const startTime = Date.now();
  const results: ParsedFile[] = [];
  const errors: Array<{ file: string; error: Error }> = [];

  for (const { path: filePath, content } of files) {
    if (options?.signal?.aborted) {
      break;
    }

    const parsed = await parseFile(filePath, content, options);
    if (parsed) {
      results.push(parsed);
    } else {
      errors.push({ file: filePath, error: new Error('Failed to parse') });
    }
  }

  return {
    files: results,
    errors,
    totalTimeMs: Date.now() - startTime,
  };
}

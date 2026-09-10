/**
 * File filtering: binary detection, generated file heuristics, size limits.
 * Integrates with IgnoreMatcher for comprehensive file filtering.
 */

import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { IgnoreMatcher } from './ignore.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default
const BINARY_SAMPLE_SIZE = 8192; // Check first 8KB for binary detection

/**
 * Safely extracts file size from stats, defaulting to 0 if undefined.
 */
function getSafeFileSize(stats: { size?: number }): number {
  return stats.size ?? 0;
}

const GENERATED_PATTERNS = [
  /^\s*\/\/\s*@generated/i,
  /^\s*\/\/\s*Generated\s+by/i,
  /^\s*\/\/\s*DO NOT EDIT/i,
  /^\s*\/\*\s*Generated\s+by/i,
  /^\s*#\s*Generated\s+by/i,
  /^\s*#\s*DO NOT EDIT/i,
  /^\s*\/\*\s*eslint-disable\s*\*\//i,
  /^\s*\/\/\s*ts-nocheck/i,
  /^\s*\/\/\s*@ts-nocheck/i,
  /^\s*#\s*Generated/i,
];

const MINIFIED_PATTERNS = [/\.min\.(js|css|html)$/i, /\.bundle\.(js|css)$/i, /\.map$/i];

const GENERATED_EXTENSIONS = [
  '.d.ts', // TypeScript declaration files (often generated)
  '.map', // Source maps
  '.min.js', // Minified JS
  '.min.css', // Minified CSS
];

/**
 * Configuration for FileFilter.
 */
export interface FileFilterConfig {
  maxFileSize?: number;
  additionalIgnorePatterns?: string[];
  allowBinary?: boolean;
  allowGenerated?: boolean;
}

/**
 * Result of file analysis for filtering.
 */
export interface FileFilterResult {
  shouldAnalyze: boolean;
  reason?: string;
  isBinary: boolean;
  isGenerated: boolean;
  isLarge: boolean;
  isIgnored: boolean;
  size: number;
}

/**
 * Checks if a file is binary by examining its content.
 * Uses UTF-8 validation on a sample of the file.
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const buffer = await readFile(filePath);
    // Check for null bytes in the buffer (strong indicator of binary)
    if (buffer.includes(0)) {
      return true;
    }
    // Try to decode as UTF-8
    const text = buffer.toString('utf-8');
    // If decoding produces replacement characters, likely binary
    if (text.includes('\uFFFD')) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * More efficient binary check using buffer inspection.
 * Reads first 8KB and checks for null bytes or high ratio of non-printable.
 */
export async function isBinaryFileFast(filePath: string): Promise<boolean> {
  try {
    const buffer = await readFile(filePath);
    const sample = buffer.subarray(0, BINARY_SAMPLE_SIZE);

    // Check for null bytes (strong indicator of binary)
    if (sample.includes(0)) {
      return true;
    }

    // Decode as UTF-8 and check for replacement characters
    const text = sample.toString('utf-8');
    if (text.includes('\uFFFD')) {
      return true;
    }

    // Check ratio of non-printable characters in the decoded text
    // Count control characters (except newline, tab, carriage return)
    let nonPrintable = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === undefined) continue;
      const code = char.charCodeAt(0);
      // Allow: printable (32-126), newline (10), tab (9), carriage return (13)
      if (code !== 9 && code !== 10 && code !== 13 && (code < 32 || code > 126)) {
        nonPrintable++;
      }
    }

    // If more than 30% non-printable, likely binary
    return nonPrintable / text.length > 0.3;
  } catch {
    // If we can't read, assume binary to be safe
    return true;
  }
}

/**
 * Checks if a file appears to be generated code.
 * Uses heuristics: file headers, minified patterns, common generated file markers.
 */
export async function isGeneratedFile(
  filePath: string,
  config?: FileFilterConfig
): Promise<boolean> {
  const _ext = extname(filePath).toLowerCase();

  // Check extension-based heuristics first
  if (GENERATED_EXTENSIONS.some((pattern) => filePath.toLowerCase().endsWith(pattern))) {
    return true;
  }

  if (MINIFIED_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return true;
  }

  // Skip content check if disabled
  if (config?.allowGenerated === true) {
    return false;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Check first 50 lines for generated file markers
    const headerLines = lines.slice(0, 50).join('\n');

    // Check for common generated file markers
    for (const pattern of GENERATED_PATTERNS) {
      if (pattern.test(headerLines)) {
        return true;
      }
    }

    // Check for very long lines (minified code often has extremely long lines)
    const hasLongLines = lines.some((line) => line.length > 500);
    if (hasLongLines && lines.length < 100) {
      // Short file with very long lines = likely minified
      return true;
    }

    return false;
  } catch {
    // If we can't read as text, assume it's not generated (might be binary)
    return false;
  }
}

/**
 * Checks if a file is a symlink and resolves it safely.
 * Rejects symlinks that point outside the repository root.
 */
export function resolveSymlinkSafely(
  repoRoot: string,
  filePath: string
): { resolvedPath: string; isSymlink: boolean } {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  const resolvedPath = resolve(absolutePath);

  // Check if resolved path is within repo root
  const relativePath = relative(repoRoot, resolvedPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Symlink points outside repository root: ${filePath}`);
  }

  const isSymlinkResult = absolutePath !== resolvedPath;
  return { resolvedPath, isSymlink: isSymlinkResult };
}

/**
 * Main file filter that combines ignore patterns, binary detection,
 * generated file detection, and size limits.
 */
export class FileFilter {
  private ignoreMatcher: IgnoreMatcher;
  private config: FileFilterConfig;

  constructor(ignoreMatcher: IgnoreMatcher, config: FileFilterConfig = {}) {
    this.ignoreMatcher = ignoreMatcher;
    const additionalIgnorePatterns = config.additionalIgnorePatterns ?? [];
    this.config = {
      maxFileSize: config.maxFileSize ?? MAX_FILE_SIZE,
      additionalIgnorePatterns,
      allowBinary: config.allowBinary ?? false,
      allowGenerated: config.allowGenerated ?? false,
    };

    // Add additional patterns to matcher
    if (additionalIgnorePatterns.length > 0) {
      this.ignoreMatcher.add(additionalIgnorePatterns);
    }
  }

  /**
   * Analyzes a file and returns whether it should be analyzed.
   */
  async analyzeFile(repoRoot: string, filePath: string): Promise<FileFilterResult> {
    const absolutePath = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
    const relativePath = relative(repoRoot, absolutePath).split('\\').join('/');

    // 1. Check ignore patterns first (fastest)
    const isIgnored = this.ignoreMatcher.ignores(relativePath);

    // 2. Get file stats for size check
    let size = 0;
    let isLarge = false;
    const stats = await stat(absolutePath);
    size = getSafeFileSize(stats);
    isLarge = size > (this.config.maxFileSize ?? MAX_FILE_SIZE);

    // 3. Check binary (only if not ignored and not large)
    let isBinary = false;
    if (!isIgnored && !isLarge) {
      isBinary = await isBinaryFileFast(absolutePath);
    }

    // 4. Check generated (only if not ignored, not large, not binary)
    let isGenerated = false;
    if (!isIgnored && !isLarge && !isBinary) {
      isGenerated = await isGeneratedFile(absolutePath, this.config);
    }

    // Determine if should analyze
    const allowBinary = this.config.allowBinary ?? false;
    const allowGenerated = this.config.allowGenerated ?? false;
    const maxFileSize = this.config.maxFileSize ?? MAX_FILE_SIZE;

    const shouldAnalyze =
      !isIgnored && !isLarge && (!isBinary || allowBinary) && (!isGenerated || allowGenerated);
    let reason: string | undefined;

    if (isIgnored) {
      reason = 'File matches ignore patterns';
    } else if (isLarge) {
      reason = `File exceeds max size (${maxFileSize} bytes)`;
    } else if (isBinary && !allowBinary) {
      reason = 'Binary file';
    } else if (isGenerated && !allowGenerated) {
      reason = 'Generated file';
    }

    const result: FileFilterResult = {
      shouldAnalyze,
      isBinary,
      isGenerated,
      isLarge,
      isIgnored,
      size,
    };
    if (reason !== undefined) {
      result.reason = reason;
    }
    return result;
  }

  /**
   * Creates a filter function for array.filter().
   * Note: This is synchronous and only uses ignore patterns.
   * For full analysis, use analyzeFile().
   */
  createFilter(): (filePath: string) => boolean {
    return (filePath: string) => !this.ignoreMatcher.ignores(filePath);
  }

  /**
   * Checks if a file should be analyzed (full async check).
   */
  async shouldAnalyzeFile(repoRoot: string, filePath: string): Promise<boolean> {
    const result = await this.analyzeFile(repoRoot, filePath);
    return result.shouldAnalyze;
  }
}

/**
 * Convenience function to create a FileFilter from repo root and config.
 */
export async function createFileFilter(
  repoRoot: string,
  config: FileFilterConfig = {}
): Promise<FileFilter> {
  const ignoreMatcher = await import('./ignore.js').then((m) =>
    m.loadIgnorePatterns(repoRoot, config.additionalIgnorePatterns)
  );
  return new FileFilter(ignoreMatcher, config);
}

/**
 * Checks if a path is a symlink.
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
    const stats = await stat(absolutePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

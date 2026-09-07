/**
 * Ignore pattern parsing and matching using the `ignore` package.
 * Handles .gitignore, .octateignore, and config-based ignore patterns.
 */

import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ignore } from 'ignore';
import ignore from 'ignore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Represents a compiled ignore pattern matcher.
 */
export interface IgnoreMatcher {
  /** Checks if a path should be ignored */
  ignores(path: string): boolean;
  /** Adds patterns to the matcher */
  add(patterns: string | string[]): this;
  /** Creates a filter function for array.filter() */
  createFilter(): (path: string) => boolean;
}

/**
 * Result of parsing an ignore file.
 */
export interface IgnoreParseResult {
  patterns: string[];
  filePath: string;
}

/**
 * Parses an ignore file (.gitignore, .octateignore) and returns patterns.
 */
export async function parseIgnoreFile(filePath: string): Promise<IgnoreParseResult> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const patterns = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    return { patterns, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { patterns: [], filePath };
    }
    throw error;
  }
}

/**
 * Creates an IgnoreMatcher from patterns.
 * The ignore package handles .gitignore pattern syntax including negation.
 */
export function createIgnoreMatcher(patterns: string[] = []): IgnoreMatcher {
  const matcher: Ignore = ignore();
  if (patterns.length > 0) {
    matcher.add(patterns);
  }
  const result: IgnoreMatcher = {
    ignores: (path: string) => matcher.ignores(path),
    add: (newPatterns: string | string[]) => {
      matcher.add(newPatterns);
      return result;
    },
    createFilter: () => matcher.createFilter(),
  };
  return result;
}

/**
 * Loads and merges ignore patterns from multiple sources.
 * Order of precedence (later overrides earlier):
 * 1. .gitignore (repository root)
 * 2. .octateignore (repository root)
 * 3. Config-based ignore patterns
 */
export async function loadIgnorePatterns(
  repoRoot: string,
  configPatterns: string[] = []
): Promise<IgnoreMatcher> {
  const matcher = createIgnoreMatcher();

  // 1. Load .gitignore from repo root
  const gitIgnorePath = resolve(repoRoot, '.gitignore');
  const gitIgnoreResult = await parseIgnoreFile(gitIgnorePath);
  if (gitIgnoreResult.patterns.length > 0) {
    matcher.add(gitIgnoreResult.patterns);
  }

  // 2. Load .octateignore from repo root
  const octateIgnorePath = resolve(repoRoot, '.octateignore');
  const octateIgnoreResult = await parseIgnoreFile(octateIgnorePath);
  if (octateIgnoreResult.patterns.length > 0) {
    matcher.add(octateIgnoreResult.patterns);
  }

  // 3. Add config-based patterns (highest precedence)
  if (configPatterns.length > 0) {
    matcher.add(configPatterns);
  }

  // Always exclude critical directories regardless of config
  const criticalPatterns = [
    '.git/**',
    'node_modules/**',
    'vendor/**',
    'dist/**',
    'build/**',
    '*.log',
    '.DS_Store',
  ];
  matcher.add(criticalPatterns);

  return matcher;
}

/**
 * Creates an IgnoreMatcher for a monorepo workspace.
 * Union of root patterns + workspace-specific patterns.
 */
export async function createWorkspaceIgnoreMatcher(
  repoRoot: string,
  workspaceRoot: string,
  configPatterns: string[] = []
): Promise<IgnoreMatcher> {
  // Start with root patterns
  const matcher = await loadIgnorePatterns(repoRoot, configPatterns);

  // Add workspace-specific .gitignore if it exists
  const workspaceGitIgnorePath = resolve(workspaceRoot, '.gitignore');
  const workspaceGitIgnoreResult = await parseIgnoreFile(workspaceGitIgnorePath);
  if (workspaceGitIgnoreResult.patterns.length > 0) {
    matcher.add(workspaceGitIgnoreResult.patterns);
  }

  // Add workspace-specific .octateignore if it exists
  const workspaceOctateIgnorePath = resolve(workspaceRoot, '.octateignore');
  const workspaceOctateIgnoreResult = await parseIgnoreFile(workspaceOctateIgnorePath);
  if (workspaceOctateIgnoreResult.patterns.length > 0) {
    matcher.add(workspaceOctateIgnoreResult.patterns);
  }

  return matcher;
}

/**
 * Normalizes a file path for ignore matching.
 * Converts to relative path from repo root with forward slashes.
 */
export function normalizePathForIgnore(repoRoot: string, filePath: string): string {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  const relativePath = relative(repoRoot, absolutePath);
  return relativePath.split('\\').join('/');
}

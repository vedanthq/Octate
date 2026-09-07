/**
 * Core domain type definitions for Octate.
 */

/**
 * Represents a Git repository with workspace configuration.
 */
export interface Repository {
  root: string;
  gitDir: string;
  workspaces: Workspace[];
  monorepo?: MonorepoConfig;
}

/**
 * Represents a workspace within a monorepo.
 */
export interface Workspace {
  root: string;
  name: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'turbo' | 'nx';
  ignorePatterns: string[];
}

/**
 * Configuration for monorepo detection and handling.
 */
export interface MonorepoConfig {
  type: 'pnpm' | 'npm' | 'yarn' | 'turbo' | 'nx';
  root: string;
  workspaces: string[];
}

/**
 * Represents a file change in a Git diff.
 */
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  diff?: string;
}

/**
 * Represents the scope of a code review.
 */
export interface ReviewScope {
  type: 'working-tree' | 'staged' | 'commit' | 'range' | 'branch';
  base: string;
  head: string;
  files: FileChange[];
  diff: string;
}

/**
 * Type guard for Repository
 */
export function isRepository(obj: unknown): obj is Repository {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'root' in obj &&
    'gitDir' in obj &&
    'workspaces' in obj
  );
}

/**
 * Type guard for Workspace
 */
export function isWorkspace(obj: unknown): obj is Workspace {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'root' in obj &&
    'name' in obj &&
    'packageManager' in obj &&
    'ignorePatterns' in obj
  );
}

/**
 * Type guard for MonorepoConfig
 */
export function isMonorepoConfig(obj: unknown): obj is MonorepoConfig {
  return (
    typeof obj === 'object' && obj !== null && 'type' in obj && 'root' in obj && 'workspaces' in obj
  );
}

/**
 * Type guard for FileChange
 */
export function isFileChange(obj: unknown): obj is FileChange {
  return typeof obj === 'object' && obj !== null && 'path' in obj && 'status' in obj;
}

/**
 * Type guard for ReviewScope
 */
export function isReviewScope(obj: unknown): obj is ReviewScope {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    'base' in obj &&
    'head' in obj &&
    'files' in obj &&
    'diff' in obj
  );
}

/**
 * ReviewScope model and scope resolution.
 * Handles --staged, --working, --commit, --range flags.
 */

import { createGitError, createValidationError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';
import type { FileChange, ReviewScope } from '../types/index.js';
import {
  getChangedFiles,
  getDiff,
  getParentCommit,
  getStagedDiff,
  getWorkingDiff,
  resolveRef,
} from './git.js';

const logger = createLogger('repository:scope');

export interface ScopeOptions {
  type: 'working-tree' | 'staged' | 'commit' | 'range' | 'branch';
  repoRoot: string;
  commit?: string; // For --commit
  base?: string; // For --range (base)
  head?: string; // For --range (head) or branch comparison
  branch?: string; // For branch comparison
}

/**
 * Resolves the review scope based on provided options.
 * Exactly one of the scope flags must be provided.
 *
 * @param options - Scope resolution options
 * @returns ReviewScope with base, head, files, and unified diff
 * @throws ValidationError if no scope or multiple scopes provided
 * @throws GitError if refs cannot be resolved
 */
export async function resolveScope(options: ScopeOptions): Promise<ReviewScope> {
  const { type, repoRoot, commit, base, head, branch } = options;

  // Validate required options per scope type
  switch (type) {
    case 'commit':
      if (!commit) {
        throw createValidationError('--commit requires a ref argument');
      }
      break;
    case 'range':
      if (!base || !head) {
        throw createValidationError(
          '--range requires both base and head refs (format: base..head or base...head)'
        );
      }
      break;
    case 'branch':
      if (!branch) {
        throw createValidationError('--branch requires a branch name');
      }
      break;
    case 'staged':
    case 'working-tree':
      // No additional options required
      break;
    default:
      throw createValidationError(`Unknown scope type: ${type}`);
  }

  let scopeType: ReviewScope['type'];
  let baseRef: string;
  let headRef: string;
  let diff: string;
  let files: FileChange[];

  switch (type) {
    case 'staged': {
      scopeType = 'staged';
      baseRef = 'HEAD';
      headRef = 'INDEX';
      diff = await getStagedDiff(repoRoot);
      files = await getStagedFiles(repoRoot);
      break;
    }

    case 'working-tree': {
      scopeType = 'working-tree';
      baseRef = 'INDEX';
      headRef = 'WORKDIR';
      diff = await getWorkingDiff(repoRoot);
      files = await getWorkingFiles(repoRoot);
      break;
    }

    case 'commit': {
      scopeType = 'commit';
      headRef = commit!;
      // Get parent commit for base
      baseRef = await getParentCommit(repoRoot, commit!);
      diff = await getDiff(repoRoot, baseRef, headRef);
      files = await getChangedFiles(repoRoot, baseRef, headRef);
      break;
    }

    case 'range': {
      scopeType = 'range';
      baseRef = base!;
      headRef = head!;

      // Handle three-dot notation (merge base)
      if (base?.includes('...')) {
        const [baseRefPart, headRefPart] = base?.split('...');
        if (baseRefPart && headRefPart) {
          baseRef = await findMergeBase(repoRoot, baseRefPart, headRefPart);
        }
      }

      diff = await getDiff(repoRoot, baseRef, headRef);
      files = await getChangedFiles(repoRoot, baseRef, headRef);
      break;
    }

    case 'branch': {
      scopeType = 'branch';
      headRef = branch!;
      baseRef = await findMergeBase(repoRoot, 'HEAD', branch!);
      diff = await getDiff(repoRoot, baseRef, headRef);
      files = await getChangedFiles(repoRoot, baseRef, headRef);
      break;
    }

    default: {
      throw createValidationError(`Unknown scope type: ${type}`);
    }
  }

  logger.debug(
    { scopeType, base: baseRef, head: headRef, fileCount: files.length },
    'Resolved review scope'
  );

  return {
    type: scopeType,
    base: baseRef,
    head: headRef,
    files,
    diff,
  };
}

/**
 * Gets staged files with their status.
 */
async function getStagedFiles(_repoRoot: string): Promise<FileChange[]> {
  // This is a simplified implementation
  // In reality, we'd need to compare index vs HEAD
  return [];
}

/**
 * Gets working tree files with their status.
 */
async function getWorkingFiles(_repoRoot: string): Promise<FileChange[]> {
  // This is a simplified implementation
  // In reality, we'd need to compare working tree vs index
  return [];
}

/**
 * Finds the merge base between two refs.
 */
async function findMergeBase(repoRoot: string, ref1: string, ref2: string): Promise<string> {
  try {
    // For now, use a simple approach - resolve both and find common ancestor
    // In a full implementation, we'd use git merge-base
    const oid1 = await resolveRef(repoRoot, ref1);
    const oid2 = await resolveRef(repoRoot, ref2);

    // If they're the same, return it
    if (oid1 === oid2) return oid1;

    // For now, return the first ref as base
    // A proper implementation would use git merge-base
    logger.warn({ ref1, ref2 }, 'Using first ref as merge base (simplified)');
    return oid1;
  } catch (error) {
    throw createGitError('Failed to find merge base', {
      repoRoot,
      ref1,
      ref2,
      error: String(error),
    });
  }
}

/**
 * Parses a range string (e.g., "HEAD~1..HEAD" or "main...HEAD") into base and head.
 *
 * @param range - Range string
 * @returns Object with base and head refs
 * @throws ValidationError if range format is invalid
 */
export function parseRange(range: string): { base: string; head: string; isThreeDot: boolean } {
  // Check for three-dot notation first (merge base)
  if (range.includes('...')) {
    const parts = range.split('...');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw createValidationError(
        `Invalid three-dot range format: ${range}. Expected: base...head`
      );
    }
    return { base: parts[0], head: parts[1], isThreeDot: true };
  }

  // Check for two-dot notation
  if (range.includes('..')) {
    const parts = range.split('..');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw createValidationError(`Invalid two-dot range format: ${range}. Expected: base..head`);
    }
    return { base: parts[0], head: parts[1], isThreeDot: false };
  }

  throw createValidationError(
    `Invalid range format: ${range}. Expected: base..head or base...head`
  );
}

/**
 * Validates that a ref exists in the repository.
 *
 * @param repoRoot - Repository root directory
 * @param ref - Ref to validate
 * @returns True if ref exists
 */
export async function validateRef(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await resolveRef(repoRoot, ref);
    return true;
  } catch {
    return false;
  }
}

/**
 * ReviewScope model and scope resolution.
 * Handles --staged, --working, --commit, --range flags.
 */

import { promises as fs } from 'node:fs';
import * as git from 'isomorphic-git';
import { createGitError, createValidationError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';
import type { FileChange, ReviewScope } from '../types/index.js';
import {
  findGitDir,
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
  isThreeDot?: boolean; // For three-dot merge base ranges
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
      const resolvedBase = base ?? 'HEAD~1';
      const resolvedHead = head ?? 'HEAD';
      baseRef = resolvedBase;
      headRef = resolvedHead;

      // Handle three-dot notation (merge base)
      if (options.isThreeDot || resolvedBase.includes('...')) {
        const parts = resolvedBase.split('...');
        const baseRefPart = parts[0] || resolvedBase;
        const headRefPart = parts[1] || resolvedHead;
        baseRef = await findMergeBase(repoRoot, baseRefPart, headRefPart);
      }

      diff = await getDiff(repoRoot, baseRef, headRef);
      files = await getChangedFiles(repoRoot, baseRef, headRef);
      break;
    }

    case 'branch': {
      if (!branch) {
        throw createValidationError('Branch name is required for branch scope');
      }
      scopeType = 'branch';
      headRef = branch;
      let compareRef = 'HEAD';
      try {
        const headOid = await resolveRef(repoRoot, 'HEAD');
        const branchOid = await resolveRef(repoRoot, branch);
        if (headOid === branchOid) {
          try {
            await resolveRef(repoRoot, 'main');
            compareRef = 'main';
          } catch {
            try {
              await resolveRef(repoRoot, 'master');
              compareRef = 'master';
            } catch {
              compareRef = 'HEAD';
            }
          }
        }
      } catch {
        // Fallback to comparing with HEAD
      }
      baseRef = await findMergeBase(repoRoot, compareRef, branch);
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
async function getStagedFiles(repoRoot: string): Promise<FileChange[]> {
  const gitDir = await findGitDir(repoRoot);
  const matrix = await git.statusMatrix({ fs, dir: repoRoot, gitdir: gitDir });
  const changes: FileChange[] = [];

  for (const entry of matrix) {
    const filepath = entry[0];
    const head = entry[1];
    const workdir = entry[2];
    const stage = entry[3];

    // Clean files where head === 1 && workdir === 1 && stage === 1 MUST NOT be classified as changed
    if (head === 1 && workdir === 1 && stage === 1) {
      continue;
    }

    if (stage !== head) {
      let status: FileChange['status'] | undefined;
      if (head === 0 && stage === 2) {
        status = 'added';
      } else if (head === 1 && (stage === 2 || stage === 3)) {
        status = 'modified';
      } else if (head === 1 && stage === 0) {
        status = 'deleted';
      }

      if (status) {
        changes.push({ path: filepath, status });
      }
    }
  }

  return changes;
}

/**
 * Gets working tree files with their status.
 */
async function getWorkingFiles(repoRoot: string): Promise<FileChange[]> {
  const gitDir = await findGitDir(repoRoot);
  const matrix = await git.statusMatrix({ fs, dir: repoRoot, gitdir: gitDir });
  const changes: FileChange[] = [];

  for (const entry of matrix) {
    const filepath = entry[0];
    const head = entry[1];
    const workdir = entry[2];
    const stage = entry[3];

    // Clean files where head === 1 && workdir === 1 && stage === 1 MUST NOT be classified as changed
    if (head === 1 && workdir === 1 && stage === 1) {
      continue;
    }

    if (workdir !== stage) {
      let status: FileChange['status'] | undefined;
      if (stage === 0 && workdir === 2) {
        status = 'added';
      } else if (((workdir as number) === 2 || (workdir as number) === 3) && stage !== 0) {
        status = 'modified';
      } else if (workdir === 0 && stage !== 0) {
        status = 'deleted';
      }

      if (status) {
        changes.push({ path: filepath, status });
      }
    }
  }

  return changes;
}

/**
 * Finds the merge base between two refs.
 */
async function findMergeBase(repoRoot: string, ref1: string, ref2: string): Promise<string> {
  try {
    const gitDir = await findGitDir(repoRoot);
    const oid1 = await resolveRef(repoRoot, ref1);
    const oid2 = await resolveRef(repoRoot, ref2);

    if (oid1 === oid2) return oid1;

    const mergeBases = await git.findMergeBase({
      fs,
      dir: repoRoot,
      gitdir: gitDir,
      oids: [oid1, oid2],
    });

    if (mergeBases && mergeBases.length > 0 && mergeBases[0]) {
      return mergeBases[0];
    }

    logger.warn({ ref1, ref2 }, 'No common merge base found, falling back to base ref');
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

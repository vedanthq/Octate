/**
 * Git operations using isomorphic-git.
 * Provides diff, status, rev-parse, log, and ref resolution.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as git from 'isomorphic-git';
import { createGitError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';
import type { FileChange } from '../types/index.js';

const logger = createLogger('repository:git');

// Use Node.js fs promises as the filesystem adapter
const fsAdapter = fs;

/**
 * Resolves a Git ref to a commit hash.
 *
 * @param repoRoot - Repository root directory
 * @param ref - Git ref (HEAD, branch name, tag, SHA, HEAD~1, etc.)
 * @returns Commit hash (OID)
 * @throws GitError if ref cannot be resolved
 */
export async function resolveRef(repoRoot: string, ref: string): Promise<string> {
  if (!ref || typeof ref !== 'string' || ref.trim() === '') {
    throw createGitError('Git reference cannot be empty', { repoRoot, ref });
  }

  const trimmedRef = ref.trim();
  const gitDir = await findGitDir(repoRoot);

  // Parse relative revision modifiers: e.g. HEAD~1, HEAD~, HEAD^2, HEAD^^, <sha>~3
  const relIndex = trimmedRef.search(/[~^]/);
  let baseRef = trimmedRef;
  let modifiersStr = '';

  if (relIndex !== -1) {
    baseRef = trimmedRef.slice(0, relIndex);
    modifiersStr = trimmedRef.slice(relIndex);

    if (!baseRef) {
      throw createGitError(
        `Invalid revision "${trimmedRef}": missing base revision before modifier`,
        { repoRoot, ref: trimmedRef }
      );
    }

    if (!/^([~^]\d*)+$/.test(modifiersStr)) {
      throw createGitError(`Invalid revision syntax "${trimmedRef}"`, {
        repoRoot,
        ref: trimmedRef,
      });
    }
  }

  // Resolve baseRef to a commit OID
  let oid: string | undefined;

  // 1. Try resolving as a symbolic ref (HEAD, branch name, tag, etc.)
  try {
    oid = await git.resolveRef({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir, ref: baseRef });
  } catch {
    // 2. Try resolving as commit OID (abbreviated or full 40-char SHA)
    if (/^[0-9a-fA-F]{4,40}$/.test(baseRef)) {
      try {
        oid = await git.expandOid({
          fs: fsAdapter,
          dir: repoRoot,
          gitdir: gitDir,
          oid: baseRef.toLowerCase(),
        });
      } catch {
        // Not a known object OID
      }
    }
  }

  if (!oid) {
    // Check if repository is empty
    const validRefs = await listRefs(repoRoot).catch(() => []);
    if (validRefs.length === 0) {
      throw createGitError(`Repository has no commits; cannot resolve ref "${trimmedRef}"`, {
        repoRoot,
        ref: trimmedRef,
      });
    }

    throw createGitError(`Failed to resolve ref "${trimmedRef}"`, {
      ref: trimmedRef,
      validRefs: validRefs.slice(0, 10),
      suggestion:
        validRefs.length > 0
          ? `Valid refs include: ${validRefs.slice(0, 5).join(', ')}`
          : undefined,
    });
  }

  // Ensure peeled to commit if baseRef was an annotated tag
  try {
    const commitObj = await git.readCommit({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      oid,
    });
    oid = commitObj.oid;
  } catch (error) {
    throw createGitError(`Object "${oid}" for ref "${baseRef}" is not a valid commit`, {
      repoRoot,
      ref: trimmedRef,
      oid,
      error: String(error),
    });
  }

  // If there are revision modifiers (~ and/or ^), step through ancestors
  if (modifiersStr) {
    const modifierRegex = /([~^])(\d*)/g;
    let match = modifierRegex.exec(modifiersStr);
    while (match !== null) {
      const op = match[1];
      const numStr = match[2];
      const count = !numStr ? 1 : parseInt(numStr, 10);

      if (count === 0) {
        // e.g. HEAD~0 or HEAD^0 refers to the commit itself
        match = modifierRegex.exec(modifiersStr);
        continue;
      }

      if (op === '~') {
        for (let step = 0; step < count; step++) {
          const commitObj = await git.readCommit({
            fs: fsAdapter,
            dir: repoRoot,
            gitdir: gitDir,
            oid,
          });
          const parents = commitObj.commit.parent;
          if (!parents || parents.length === 0) {
            throw createGitError(
              `Commit ${oid} has no parent (reached root commit while resolving "${trimmedRef}")`,
              { repoRoot, ref: trimmedRef, commit: oid, step }
            );
          }
          oid = parents[0]!;
        }
      } else if (op === '^') {
        const commitObj = await git.readCommit({
          fs: fsAdapter,
          dir: repoRoot,
          gitdir: gitDir,
          oid,
        });
        const parents = commitObj.commit.parent;
        const parentIndex = count - 1;
        if (!parents || parentIndex < 0 || parentIndex >= parents.length) {
          throw createGitError(
            `Commit ${oid} does not have parent ${count} (found ${parents ? parents.length : 0} parents while resolving "${trimmedRef}")`,
            { repoRoot, ref: trimmedRef, commit: oid, parentIndex: count }
          );
        }
        oid = parents[parentIndex]!;
      }
      match = modifierRegex.exec(modifiersStr);
    }
  }

  logger.debug({ ref: trimmedRef, oid }, 'Resolved ref');
  return oid;
}

/**
 * Finds the .git directory (handles both directory and file cases for worktrees).
 */
export async function findGitDir(repoRoot: string): Promise<string> {
  const gitDir = path.join(repoRoot, '.git');

  try {
    const stat = await fs.stat(gitDir);
    if (stat.isDirectory()) {
      return gitDir;
    }
    if (stat.isFile()) {
      // Worktree case: .git is a file pointing to the actual git dir
      const content = await fs.readFile(gitDir, 'utf-8');
      const match = content.match(/gitdir: (.+)/);
      if (match?.[1]) {
        const actualGitDir = match[1].trim();
        // Handle relative paths
        return path.isAbsolute(actualGitDir) ? actualGitDir : path.join(repoRoot, actualGitDir);
      }
    }
  } catch {
    // Fall through to default
  }

  return gitDir;
}

/**
 * Lists all refs in the repository.
 */
async function listRefs(repoRoot: string): Promise<string[]> {
  try {
    const gitDir = await findGitDir(repoRoot);
    const refs = await git.listRefs({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir });
    return refs.map((r) => (r as { ref?: string }).ref ?? '');
  } catch {
    return [];
  }
}

/**
 * Gets the commit log for a repository.
 *
 * @param repoRoot - Repository root directory
 * @param options - Log options
 * @returns Array of commit objects
 */
export async function getLog(
  repoRoot: string,
  options: { ref?: string; depth?: number } = {}
): Promise<
  Array<{
    oid: string;
    message: string;
    author: { name: string; email: string; timestamp: number };
  }>
> {
  try {
    const gitDir = await findGitDir(repoRoot);
    const log = await git.log({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      ref: options.ref,
      depth: options.depth ?? 100,
    });

    return log.map((commit) => ({
      oid: commit.oid,
      message: commit.commit.message.trim(),
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        timestamp: commit.commit.author.timestamp,
      },
    }));
  } catch (error) {
    throw createGitError('Failed to get commit log', { repoRoot, error: String(error) });
  }
}

/**
 * Gets the status of files in the working tree.
 *
 * @param repoRoot - Repository root directory
 * @returns Status matrix entries
 */
export async function getStatus(
  repoRoot: string
): Promise<Array<[string, number, number, number]>> {
  try {
    const gitDir = await findGitDir(repoRoot);
    const matrix = await git.statusMatrix({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir });
    return matrix;
  } catch (error) {
    throw createGitError('Failed to get status', { repoRoot, error: String(error) });
  }
}

/**
 * Gets the diff between two commits/refs.
 *
 * @param repoRoot - Repository root directory
 * @param base - Base ref/commit
 * @param head - Head ref/commit
 * @returns Unified diff string
 */
export async function getDiff(repoRoot: string, base: string, head: string): Promise<string> {
  try {
    const gitDir = await findGitDir(repoRoot);

    // Resolve refs to commit OIDs
    const baseOid = await resolveRef(repoRoot, base);
    const headOid = await resolveRef(repoRoot, head);

    // Get the tree OIDs for both commits
    const baseCommit = await git.readCommit({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      oid: baseOid,
    });
    const headCommit = await git.readCommit({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      oid: headOid,
    });

    const baseTreeOid = baseCommit.commit.tree;
    const headTreeOid = headCommit.commit.tree;

    // Use walk to generate diff
    const diffs: string[] = [];

    await git.walk({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      trees: [git.TREE({ ref: baseTreeOid }), git.TREE({ ref: headTreeOid })],
      map: async (filepath, [baseEntry, headEntry]) => {
        if (filepath === '.') return;

        const baseType = baseEntry ? await baseEntry.type() : undefined;
        const headType = headEntry ? await headEntry.type() : undefined;

        // Skip directories
        if (baseType === 'tree' || headType === 'tree') return;

        const baseBlobOid = baseEntry ? await baseEntry.oid() : undefined;
        const headBlobOid = headEntry ? await headEntry.oid() : undefined;

        // Skip unchanged files
        if (baseBlobOid === headBlobOid) return;

        let status: FileChange['status'] = 'modified';
        if (baseBlobOid === undefined && headBlobOid !== undefined) status = 'added';
        if (baseBlobOid !== undefined && headBlobOid === undefined) status = 'deleted';

        // Read file contents for diff
        let diff = '';
        if (status !== 'deleted' && headBlobOid) {
          try {
            const headBlob = await git.readBlob({
              fs: fsAdapter,
              dir: repoRoot,
              gitdir: gitDir,
              oid: headBlobOid,
            });
            const headContent = Buffer.from(headBlob.blob).toString('utf-8');
            if (status === 'added') {
              diff = generateAddedDiff(filepath, headContent);
            } else if (baseBlobOid) {
              const baseBlob = await git.readBlob({
                fs: fsAdapter,
                dir: repoRoot,
                gitdir: gitDir,
                oid: baseBlobOid,
              });
              const baseContent = Buffer.from(baseBlob.blob).toString('utf-8');
              diff = generateUnifiedDiff(filepath, baseContent, headContent);
            }
          } catch {
            // Binary file or read error
            diff = `# Binary file ${filepath} differs\n`;
          }
        } else if (status === 'deleted' && baseBlobOid) {
          try {
            const baseBlob = await git.readBlob({
              fs: fsAdapter,
              dir: repoRoot,
              gitdir: gitDir,
              oid: baseBlobOid,
            });
            const baseContent = Buffer.from(baseBlob.blob).toString('utf-8');
            diff = generateDeletedDiff(filepath, baseContent);
          } catch {
            diff = `# Binary file ${filepath} deleted\n`;
          }
        }

        diffs.push(diff);
      },
    });

    return diffs.join('\n');
  } catch (error) {
    throw createGitError('Failed to get diff', { repoRoot, base, head, error: String(error) });
  }
}

/**
 * Generates a unified diff between two file contents.
 */
function generateUnifiedDiff(filepath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple diff algorithm - find common prefix and suffix
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldStart = prefixLen + 1;
  const oldCount = oldLines.length - prefixLen - suffixLen;
  const newStart = prefixLen + 1;
  const newCount = newLines.length - prefixLen - suffixLen;

  const diffLines: string[] = [];
  diffLines.push(`--- a/${filepath}`);
  diffLines.push(`+++ b/${filepath}`);
  diffLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

  // Context lines before changes
  for (let i = Math.max(0, prefixLen - 3); i < prefixLen; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  // Removed lines
  for (let i = prefixLen; i < oldLines.length - suffixLen; i++) {
    diffLines.push(`-${oldLines[i]}`);
  }

  // Added lines
  for (let i = prefixLen; i < newLines.length - suffixLen; i++) {
    diffLines.push(`+${newLines[i]}`);
  }

  // Context lines after changes
  for (
    let i = oldLines.length - suffixLen;
    i < Math.min(oldLines.length, oldLines.length - suffixLen + 3);
    i++
  ) {
    diffLines.push(` ${oldLines[i]}`);
  }

  return diffLines.join('\n');
}

/**
 * Generates diff for added file.
 */
function generateAddedDiff(filepath: string, content: string): string {
  const lines = content.split('\n');
  const diffLines: string[] = [];
  diffLines.push(`--- /dev/null`);
  diffLines.push(`+++ b/${filepath}`);
  diffLines.push(`@@ -0,0 +1,${lines.length} @@`);

  for (const line of lines) {
    diffLines.push(`+${line}`);
  }

  return diffLines.join('\n');
}

/**
 * Generates diff for deleted file.
 */
function generateDeletedDiff(filepath: string, content: string): string {
  const lines = content.split('\n');
  const diffLines: string[] = [];
  diffLines.push(`--- a/${filepath}`);
  diffLines.push(`+++ /dev/null`);
  diffLines.push(`@@ -1,${lines.length} +0,0 @@`);

  for (const line of lines) {
    diffLines.push(`-${line}`);
  }

  return diffLines.join('\n');
}

/**
 * Gets changed files with their status between two refs.
 *
 * @param repoRoot - Repository root directory
 * @param base - Base ref/commit
 * @param head - Head ref/commit
 * @returns Array of file changes
 */
export async function getChangedFiles(
  repoRoot: string,
  base: string,
  head: string
): Promise<FileChange[]> {
  try {
    const gitDir = await findGitDir(repoRoot);
    const baseOid = await resolveRef(repoRoot, base);
    const headOid = await resolveRef(repoRoot, head);

    const baseCommit = await git.readCommit({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      oid: baseOid,
    });
    const headCommit = await git.readCommit({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      oid: headOid,
    });

    const baseTreeOid = baseCommit.commit.tree;
    const headTreeOid = headCommit.commit.tree;

    const changes: FileChange[] = [];

    await git.walk({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      trees: [git.TREE({ ref: baseTreeOid }), git.TREE({ ref: headTreeOid })],
      map: async (filepath, [baseEntry, headEntry]) => {
        if (filepath === '.') return;

        const baseType = baseEntry ? await baseEntry.type() : undefined;
        const headType = headEntry ? await headEntry.type() : undefined;

        if (baseType === 'tree' || headType === 'tree') return;

        const baseBlobOid = baseEntry ? await baseEntry.oid() : undefined;
        const headBlobOid = headEntry ? await headEntry.oid() : undefined;

        // Skip unchanged files
        if (baseBlobOid === headBlobOid) return;

        let status: FileChange['status'] = 'modified';
        if (baseBlobOid === undefined && headBlobOid !== undefined) status = 'added';
        if (baseBlobOid !== undefined && headBlobOid === undefined) status = 'deleted';

        const change: FileChange = {
          path: filepath,
          status,
        };

        // Note: rename detection would require additional logic
        // For now, we don't detect renames

        changes.push(change);
      },
    });

    return changes;
  } catch (error) {
    throw createGitError('Failed to get changed files', {
      repoRoot,
      base,
      head,
      error: String(error),
    });
  }
}

/**
 * Reads a blob by filepath at a specific commit.
 */
async function readBlobAtCommit(
  repoRoot: string,
  gitDir: string,
  commitOid: string,
  filepath: string
): Promise<string | null> {
  try {
    const blob = await git.readBlob({
      fs: fsAdapter,
      dir: repoRoot,
      gitdir: gitDir,
      oid: commitOid,
      filepath,
    });
    return Buffer.from(blob.blob).toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Gets the diff for staged changes (index vs HEAD).
 *
 * @param repoRoot - Repository root directory
 * @returns Unified diff string for staged changes
 */
export async function getStagedDiff(repoRoot: string): Promise<string> {
  try {
    const gitDir = await findGitDir(repoRoot);
    let headOid: string | null = null;
    try {
      headOid = await resolveRef(repoRoot, 'HEAD');
    } catch {
      headOid = null;
    }

    // Use statusMatrix to find staged changes
    const matrix = await git.statusMatrix({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir });

    const diffs: string[] = [];

    for (const entry of matrix) {
      const filepath = entry[0];
      const headStatus = entry[1] as 0 | 1;
      const _workdirStatus = entry[2] as 0 | 1 | 2;
      const stageStatus = entry[3] as 0 | 1 | 2 | 3;

      // Files where stage matches head must NOT be classified as staged changes
      if (stageStatus === headStatus) {
        continue;
      }

      let status: FileChange['status'] | undefined;
      if (headStatus === 0 && stageStatus === 2) {
        status = 'added';
      } else if (headStatus === 1 && (stageStatus === 2 || stageStatus === 3)) {
        status = 'modified';
      } else if (headStatus === 1 && stageStatus === 0) {
        status = 'deleted';
      }

      if (!status) {
        continue;
      }

      let diff = '';
      if (status !== 'deleted') {
        // Read from working tree (which matches index for staged)
        try {
          const filePath = path.join(repoRoot, filepath);
          const content = await fs.readFile(filePath, 'utf-8');
          if (status === 'added' || !headOid) {
            diff = generateAddedDiff(filepath, content);
          } else {
            // Read from HEAD for comparison
            const headContent = await readBlobAtCommit(repoRoot, gitDir, headOid, filepath);
            if (headContent !== null) {
              diff = generateUnifiedDiff(filepath, headContent, content);
            } else {
              diff = generateAddedDiff(filepath, content);
            }
          }
        } catch {
          diff = `# Binary file ${filepath} differs\n`;
        }
      } else {
        // Deleted file - read from HEAD
        const headContent = headOid
          ? await readBlobAtCommit(repoRoot, gitDir, headOid, filepath)
          : null;
        if (headContent !== null) {
          diff = generateDeletedDiff(filepath, headContent);
        } else {
          diff = `# Binary file ${filepath} deleted\n`;
        }
      }

      diffs.push(diff);
    }

    return diffs.join('\n');
  } catch (error) {
    throw createGitError('Failed to get staged diff', { repoRoot, error: String(error) });
  }
}

/**
 * Gets the diff for working tree changes (working tree vs index).
 *
 * @param repoRoot - Repository root directory
 * @returns Unified diff string for working tree changes
 */
export async function getWorkingDiff(repoRoot: string): Promise<string> {
  try {
    const gitDir = await findGitDir(repoRoot);

    // Use statusMatrix to find working tree changes
    const matrix = await git.statusMatrix({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir });
    let headOid: string | null = null;
    try {
      headOid = await resolveRef(repoRoot, 'HEAD');
    } catch {
      headOid = null;
    }

    const diffs: string[] = [];

    for (const entry of matrix) {
      const filepath = entry[0];
      const _headStatus = entry[1];
      const workdirStatus = entry[2] as 0 | 1 | 2;
      const stageStatus = entry[3] as 0 | 1 | 2 | 3;

      // Clean files or files where workdir matches stage have no working tree changes
      if (workdirStatus === stageStatus || (workdirStatus === 1 && stageStatus === 1)) {
        continue;
      }

      if (workdirStatus === 0 && stageStatus !== 0) {
        // Deleted in working tree
        let diff = '';
        const indexContent = headOid
          ? await readBlobAtCommit(repoRoot, gitDir, headOid, filepath)
          : null;
        if (indexContent !== null) {
          diff = generateDeletedDiff(filepath, indexContent);
        } else {
          diff = `# Binary file ${filepath} deleted\n`;
        }
        diffs.push(diff);
      } else if (workdirStatus === 2) {
        // Added or modified in working tree
        let diff = '';
        try {
          const filePath = path.join(repoRoot, filepath);
          const content = await fs.readFile(filePath, 'utf-8');

          if (stageStatus === 0 || !headOid) {
            diff = generateAddedDiff(filepath, content);
          } else {
            const indexContent = await readBlobAtCommit(repoRoot, gitDir, headOid, filepath);
            if (indexContent !== null) {
              diff = generateUnifiedDiff(filepath, indexContent, content);
            } else {
              diff = generateAddedDiff(filepath, content);
            }
          }
        } catch {
          diff = `# Binary file ${filepath} differs\n`;
        }
        diffs.push(diff);
      }
    }

    return diffs.join('\n');
  } catch (error) {
    throw createGitError('Failed to get working diff', { repoRoot, error: String(error) });
  }
}

/**
 * Gets the parent commit OID of a given commit.
 *
 * @param repoRoot - Repository root directory
 * @param commit - Commit ref (HEAD, branch, SHA, etc.)
 * @returns Parent commit OID
 */
export async function getParentCommit(repoRoot: string, commit: string): Promise<string> {
  try {
    const oid = await resolveRef(repoRoot, commit);
    const gitDir = await findGitDir(repoRoot);
    const commitObj = await git.readCommit({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir, oid });
    const parentOid = commitObj.commit.parent[0];
    if (!parentOid) {
      throw createGitError('Commit has no parent', { repoRoot, commit });
    }
    return parentOid;
  } catch (error) {
    throw createGitError('Failed to get parent commit', { repoRoot, commit, error: String(error) });
  }
}

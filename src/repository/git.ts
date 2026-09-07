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
  try {
    const gitDir = await findGitDir(repoRoot);
    const oid = await git.resolveRef({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir, ref });
    logger.debug({ ref, oid }, 'Resolved ref');
    return oid;
  } catch (_error) {
    const validRefs = await listRefs(repoRoot).catch(() => []);
    throw createGitError(`Failed to resolve ref "${ref}"`, {
      ref,
      validRefs: validRefs.slice(0, 10),
      suggestion:
        validRefs.length > 0
          ? `Valid refs include: ${validRefs.slice(0, 5).join(', ')}`
          : undefined,
    });
  }
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

        const baseOid = baseEntry ? await baseEntry.oid() : undefined;
        const headOid = headEntry ? await headEntry.oid() : undefined;

        let status: FileChange['status'] = 'modified';
        if (baseOid === undefined && headOid !== undefined) status = 'added';
        if (baseOid !== undefined && headOid === undefined) status = 'deleted';

        // Read file contents for diff
        let diff = '';
        if (status !== 'deleted' && headOid) {
          try {
            const headBlob = await git.readBlob({
              fs: fsAdapter,
              dir: repoRoot,
              gitdir: gitDir,
              oid: headOid,
            });
            const headContent = Buffer.from(headBlob.blob).toString('utf-8');
            if (status === 'added') {
              diff = generateAddedDiff(filepath, headContent);
            } else if (baseOid) {
              const baseBlob = await git.readBlob({
                fs: fsAdapter,
                dir: repoRoot,
                gitdir: gitDir,
                oid: baseOid,
              });
              const baseContent = Buffer.from(baseBlob.blob).toString('utf-8');
              diff = generateUnifiedDiff(filepath, baseContent, headContent);
            }
          } catch {
            // Binary file or read error
            diff = `# Binary file ${filepath} differs\n`;
          }
        } else if (status === 'deleted' && baseOid) {
          try {
            const baseBlob = await git.readBlob({
              fs: fsAdapter,
              dir: repoRoot,
              gitdir: gitDir,
              oid: baseOid,
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

        const baseOid = baseEntry ? await baseEntry.oid() : undefined;
        const headOid = headEntry ? await headEntry.oid() : undefined;

        let status: FileChange['status'] = 'modified';
        if (baseOid === undefined && headOid !== undefined) status = 'added';
        if (baseOid !== undefined && headOid === undefined) status = 'deleted';

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
    const headOid = await resolveRef(repoRoot, 'HEAD');

    // Use statusMatrix to find staged changes
    const matrix = await git.statusMatrix({ fs: fsAdapter, dir: repoRoot, gitdir: gitDir });

    const diffs: string[] = [];

    for (const entry of matrix) {
      const filepath = entry[0];
      const _headStatus = entry[1];
      const _workdirStatus = entry[2];
      const stageStatus = entry[3] as 0 | 1 | 2 | 3;
      // stageStatus: 0 = unmodified, 1 = modified, 2 = added, 3 = deleted
      if (stageStatus === 1 || stageStatus === 2 || stageStatus === 3) {
        const status: FileChange['status'] =
          stageStatus === 2 ? 'added' : stageStatus === 3 ? 'deleted' : 'modified';

        let diff = '';
        if (status !== 'deleted') {
          // Read from working tree (which matches index for staged)
          try {
            const filePath = path.join(repoRoot, filepath);
            const content = await fs.readFile(filePath, 'utf-8');
            if (status === 'added') {
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
          const headContent = await readBlobAtCommit(repoRoot, gitDir, headOid, filepath);
          if (headContent !== null) {
            diff = generateDeletedDiff(filepath, headContent);
          } else {
            diff = `# Binary file ${filepath} deleted\n`;
          }
        }

        diffs.push(diff);
      }
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
    const headOid = await resolveRef(repoRoot, 'HEAD');

    const diffs: string[] = [];

    for (const entry of matrix) {
      const filepath = entry[0];
      const _headStatus = entry[1];
      const workdirStatus = entry[2] as 0 | 1 | 2 | 3;
      const stageStatus = entry[3] as 0 | 1 | 2 | 3;
      // workdirStatus: 0 = unmodified, 1 = modified, 2 = added, 3 = deleted
      // Only include if working tree differs from index
      if (workdirStatus !== 0 && workdirStatus !== stageStatus) {
        const status: FileChange['status'] =
          workdirStatus === 2 ? 'added' : workdirStatus === 3 ? 'deleted' : 'modified';

        let diff = '';
        if (status !== 'deleted') {
          try {
            const filePath = path.join(repoRoot, filepath);
            const content = await fs.readFile(filePath, 'utf-8');

            if (status === 'added') {
              diff = generateAddedDiff(filepath, content);
            } else {
              // Compare with staged version (index)
              // For staged files, we need to read from index
              // We'll use HEAD as approximation for now
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
        } else {
          // Deleted in working tree
          const indexContent = await readBlobAtCommit(repoRoot, gitDir, headOid, filepath);
          if (indexContent !== null) {
            diff = generateDeletedDiff(filepath, indexContent);
          } else {
            diff = `# Binary file ${filepath} deleted\n`;
          }
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

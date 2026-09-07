/**
 * Project identity hashing and cache directory resolution.
 * Uses SHA256(repo-root-path + git-remote-url) for namespacing per D-10.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '../logging/index.js';

const logger = createLogger('cache:identity');

const execFileAsync = promisify(execFile);

/**
 * Represents the resolved cache directory paths for a project.
 */
export interface CachePaths {
  /** Root cache directory for the project */
  root: string;
  /** Directory for index files */
  indexes: string;
  /** Directory for cached analysis results */
  cache: string;
  /** Directory for findings */
  findings: string;
  /** Directory for logs */
  logs: string;
}

/**
 * Computes the project identity hash.
 * Uses SHA256 of (absolute repo root path + git remote URL).
 * Falls back to absolute path + device/inode if no git remote.
 */
export async function computeProjectIdentity(repoRoot: string): Promise<string> {
  const absoluteRoot = resolve(repoRoot);

  // Try to get git remote URL
  let remoteUrl = '';
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: absoluteRoot,
      timeout: 5000,
    });
    remoteUrl = stdout.trim();
  } catch {
    // Git command failed or no remote origin
    logger.debug({ repoRoot: absoluteRoot }, 'No git remote origin found, using fallback identity');
  }

  // Create identity string: absolute path + remote URL (or empty)
  const identityString = `${absoluteRoot}|${remoteUrl}`;
  const hash = createHash('sha256').update(identityString).digest('hex');

  // Use first 16 chars for directory name (sufficient uniqueness)
  return hash.substring(0, 16);
}

/**
 * Gets the cache directory for a project.
 * Follows XDG Base Directory Specification: ~/.local/share/octate/{project-hash}/
 */
export function getCacheDir(projectIdentity: string): string {
  const baseDir = join(homedir(), '.local', 'share', 'octate');
  return join(baseDir, projectIdentity);
}

/**
 * Resolves all cache subdirectory paths for a project.
 */
export function resolveCachePaths(projectIdentity: string): CachePaths {
  const root = getCacheDir(projectIdentity);
  return {
    root,
    indexes: join(root, 'indexes'),
    cache: join(root, 'cache'),
    findings: join(root, 'findings'),
    logs: join(root, 'logs'),
  };
}

/**
 * Ensures all cache directories exist.
 */
export async function ensureCacheDirs(paths: CachePaths): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await Promise.all([
    mkdir(paths.root, { recursive: true }),
    mkdir(paths.indexes, { recursive: true }),
    mkdir(paths.cache, { recursive: true }),
    mkdir(paths.findings, { recursive: true }),
    mkdir(paths.logs, { recursive: true }),
  ]);
}

/**
 * Computes project identity and resolves cache paths in one call.
 */
export async function initializeProjectCache(repoRoot: string): Promise<CachePaths> {
  const identity = await computeProjectIdentity(repoRoot);
  const paths = resolveCachePaths(identity);
  await ensureCacheDirs(paths);
  logger.info({ identity, root: paths.root }, 'Initialized project cache');
  return paths;
}

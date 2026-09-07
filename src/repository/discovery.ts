/**
 * Repository discovery: Git root finding and workspace detection.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { detectMonorepo, aggregateWorkspaces, type MonorepoType } from './monorepo.js';
import type { Repository, Workspace } from '../types/index.js';
import { createLogger } from '../logging/index.js';
import { createRepositoryError } from '../errors/index.js';

const logger = createLogger('repository:discovery');

/**
 * Finds the Git repository root by walking up the directory tree.
 * Returns the absolute path to the repository root, or null if not in a Git repo.
 *
 * @param startDir - Directory to start searching from (default: cwd)
 * @returns Absolute path to Git root, or null if not found
 */
export async function findGitRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = path.resolve(startDir);

  // Prevent infinite loops
  const visited = new Set<string>();

  while (currentDir !== path.parse(currentDir).root && !visited.has(currentDir)) {
    visited.add(currentDir);

    const gitDir = path.join(currentDir, '.git');
    try {
      const stat = await fs.stat(gitDir);
      if (stat.isDirectory() || stat.isFile()) {
        // Verify it's a valid git directory by checking for HEAD
        const headPath = path.join(gitDir, 'HEAD');
        try {
          await fs.access(headPath);
          logger.debug({ gitRoot: currentDir }, 'Found Git repository root');
          return currentDir;
        } catch {
          // HEAD doesn't exist, continue searching
        }
      }
    } catch {
      // .git doesn't exist, continue searching
    }

    currentDir = path.dirname(currentDir);
  }

  logger.debug({ startDir }, 'No Git repository found');
  return null;
}

/**
 * Detects the workspace configuration for a repository.
 * Returns the monorepo configuration if detected, undefined otherwise.
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Monorepo configuration or undefined
 */
export async function detectWorkspace(repoRoot: string): Promise<Repository['monorepo']> {
  const monorepoConfig = await detectMonorepo(repoRoot);
  if (!monorepoConfig) {
    return undefined;
  }

  // Use the exported aggregateWorkspaces which handles glob expansion
  const workspacePaths = await aggregateWorkspaces(repoRoot, monorepoConfig.type, monorepoConfig.workspaces);

  return {
    type: monorepoConfig.type,
    root: monorepoConfig.root,
    workspaces: workspacePaths,
  };
}

/**
 * Discovers the full repository configuration from a starting directory.
 * Finds Git root, detects monorepo, and aggregates workspaces.
 *
 * @param startDir - Directory to start discovery from (default: cwd)
 * @returns Repository object with full configuration
 * @throws RepositoryError if not in a Git repository
 */
export async function discoverRepository(startDir: string = process.cwd()): Promise<Repository> {
  const gitRoot = await findGitRoot(startDir);

  if (!gitRoot) {
    throw createRepositoryError('Not in a Git repository', { startDir });
  }

  const monorepoConfig = await detectWorkspace(gitRoot);

  const workspaces = monorepoConfig
    ? await Promise.all(
        monorepoConfig.workspaces.map(async (wsPath): Promise<Workspace | null> => {
          const wsRoot = path.resolve(gitRoot, wsPath);
          try {
            const stat = await fs.stat(wsRoot);
            if (!stat.isDirectory()) {
              return null;
            }

            let name = path.basename(wsPath);
            const packageJsonPath = path.join(wsRoot, 'package.json');
            try {
              const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
              const packageJson = JSON.parse(packageJsonContent);
              if (packageJson.name) {
                name = packageJson.name;
              }
            } catch {
              // package.json not found or invalid, use directory name
            }

            return {
              root: wsRoot,
              name,
              packageManager: monorepoConfig.type,
              ignorePatterns: [],
            };
          } catch {
            logger.warn({ workspace: wsPath }, 'Workspace directory not found, skipping');
            return null;
          }
        })
      ).then((results) => results.filter((w): w is Workspace => w !== null))
    : [
        {
          root: gitRoot,
          name: path.basename(gitRoot),
          packageManager: 'npm' as const,
          ignorePatterns: [],
        },
      ];

  const result: Repository = {
    root: gitRoot,
    gitDir: path.join(gitRoot, '.git'),
    workspaces,
  };

  if (monorepoConfig) {
    result.monorepo = monorepoConfig;
  }

  return result;
}
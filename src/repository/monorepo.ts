/**
 * Monorepo detection and workspace aggregation.
 * Supports pnpm, npm/yarn workspaces, Turborepo, and Nx.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';

export type MonorepoType = 'pnpm' | 'npm' | 'yarn' | 'turbo' | 'nx';

export interface MonorepoConfig {
  type: MonorepoType;
  root: string;
  workspaces: string[];
}

/**
 * Detects monorepo configuration in a repository.
 * Priority order: pnpm → npm/yarn → turbo → nx
 *
 * @param repoRoot - Repository root directory
 * @returns Monorepo configuration or null if not a monorepo
 */
export async function detectMonorepo(repoRoot: string): Promise<MonorepoConfig | null> {
  // Priority 1: pnpm-workspace.yaml
  const pnpmConfig = await detectPnpmWorkspace(repoRoot);
  if (pnpmConfig) {
    return pnpmConfig;
  }

  // Priority 2: npm/yarn workspaces (package.json with workspaces field)
  const npmWorkspace = await detectNpmYarnWorkspace(repoRoot);
  if (npmWorkspace) {
    return npmWorkspace;
  }

  // Priority 3: Turborepo (turbo.json)
  const turboConfig = await detectTurborepo(repoRoot);
  if (turboConfig) {
    return turboConfig;
  }

  // Priority 4: Nx (nx.json)
  const nxConfig = await detectNxWorkspace(repoRoot);
  if (nxConfig) {
    return nxConfig;
  }

  return null;
}

/**
 * Detects pnpm workspace configuration.
 */
async function detectPnpmWorkspace(repoRoot: string): Promise<MonorepoConfig | null> {
  const pnpmWorkspacePath = path.join(repoRoot, 'pnpm-workspace.yaml');

  try {
    const content = await fs.readFile(pnpmWorkspacePath, 'utf-8');
    const workspaces = parsePnpmWorkspaces(content);

    if (workspaces.length > 0) {
      return {
        type: 'pnpm',
        root: repoRoot,
        workspaces,
      };
    }
  } catch {
    // File doesn't exist or can't be read
  }

  return null;
}

/**
 * Parses pnpm-workspace.yaml content to extract workspace patterns.
 */
function parsePnpmWorkspaces(content: string): string[] {
  const workspaces: string[] = [];
  const lines = content.split('\n');

  let inPackages = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      if (trimmed.startsWith('- ')) {
        const pattern = trimmed.slice(2).trim();
        // Remove quotes if present
        const cleanPattern = pattern.replace(/^["']|["']$/g, '');
        workspaces.push(cleanPattern);
      } else if (trimmed && !trimmed.startsWith('#')) {
        // End of packages section
        break;
      }
    }
  }

  return workspaces;
}

/**
 * Detects npm/yarn workspaces from package.json.
 */
async function detectNpmYarnWorkspace(repoRoot: string): Promise<MonorepoConfig | null> {
  const packageJsonPath = path.join(repoRoot, 'package.json');

  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);

    if (packageJson.workspaces) {
      let workspaces: string[] = [];

      if (Array.isArray(packageJson.workspaces)) {
        workspaces = packageJson.workspaces;
      } else if (typeof packageJson.workspaces === 'object' && packageJson.workspaces.packages) {
        workspaces = packageJson.workspaces.packages;
      }

      if (workspaces.length > 0) {
        // Determine if it's yarn or npm based on lockfile
        const lockfile = await detectLockfile(repoRoot);
        const type = lockfile === 'yarn' ? 'yarn' : 'npm';

        return {
          type,
          root: repoRoot,
          workspaces,
        };
      }
    }
  } catch {
    // package.json doesn't exist or invalid
  }

  return null;
}

/**
 * Detects Turborepo configuration.
 */
async function detectTurborepo(repoRoot: string): Promise<MonorepoConfig | null> {
  const turboJsonPath = path.join(repoRoot, 'turbo.json');

  try {
    const content = await fs.readFile(turboJsonPath, 'utf-8');
    const turboJson = JSON.parse(content);

    // Turborepo uses "pipeline" and "tasks" - workspaces are typically in package.json
    // Check if there's a package.json with workspaces
    const npmWorkspace = await detectNpmYarnWorkspace(repoRoot);
    if (npmWorkspace) {
      return {
        type: 'turbo',
        root: repoRoot,
        workspaces: npmWorkspace.workspaces,
      };
    }

    // If no npm workspaces, check for turbo.json "packages" field (older versions)
    if (turboJson.packages && Array.isArray(turboJson.packages)) {
      return {
        type: 'turbo',
        root: repoRoot,
        workspaces: turboJson.packages,
      };
    }
  } catch {
    // turbo.json doesn't exist or invalid
  }

  return null;
}

/**
 * Detects Nx workspace configuration.
 */
async function detectNxWorkspace(repoRoot: string): Promise<MonorepoConfig | null> {
  const nxJsonPath = path.join(repoRoot, 'nx.json');

  try {
    const content = await fs.readFile(nxJsonPath, 'utf-8');
    const nxJson = JSON.parse(content);

    // Nx workspaces typically use package.json workspaces or have "projects" in nx.json
    const npmWorkspace = await detectNpmYarnWorkspace(repoRoot);
    if (npmWorkspace) {
      return {
        type: 'nx',
        root: repoRoot,
        workspaces: npmWorkspace.workspaces,
      };
    }

    // Check for projects in nx.json
    if (nxJson.projects && typeof nxJson.projects === 'object') {
      const projects = Object.keys(nxJson.projects);
      if (projects.length > 0) {
        return {
          type: 'nx',
          root: repoRoot,
          workspaces: projects,
        };
      }
    }
  } catch {
    // nx.json doesn't exist or invalid
  }

  return null;
}

/**
 * Detects the lockfile to determine package manager.
 */
async function detectLockfile(repoRoot: string): Promise<'npm' | 'yarn' | 'pnpm' | null> {
  const lockfiles = [
    { file: 'pnpm-lock.yaml', type: 'pnpm' as const },
    { file: 'yarn.lock', type: 'yarn' as const },
    { file: 'package-lock.json', type: 'npm' as const },
  ];

  for (const { file, type } of lockfiles) {
    try {
      await fs.access(path.join(repoRoot, file));
      return type;
    } catch {
      // File doesn't exist
    }
  }

  return null;
}

/**
 * Expands workspace glob patterns to actual directory paths.
 *
 * @param repoRoot - Repository root directory
 * @param patterns - Workspace glob patterns
 * @returns Resolved absolute workspace paths
 */
export async function expandWorkspacePatterns(
  repoRoot: string,
  patterns: string[]
): Promise<string[]> {
  const workspaces: string[] = [];

  for (const pattern of patterns) {
    // Use fast-glob to expand patterns
    const matches = await fastGlob(pattern, {
      cwd: repoRoot,
      onlyDirectories: true,
      absolute: false,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    for (const match of matches) {
      workspaces.push(match);
    }
  }

  return workspaces;
}

/**
 * Aggregates workspaces from monorepo configuration.
 *
 * @param repoRoot - Repository root directory
 * @param type - Monorepo type
 * @param workspacePaths - Relative workspace paths from config
 * @returns Array of workspace root paths
 */
export async function aggregateWorkspaces(
  repoRoot: string,
  _type: MonorepoType,
  workspacePaths: string[]
): Promise<string[]> {
  const expanded = await expandWorkspacePatterns(repoRoot, workspacePaths);
  return expanded.map((ws) => path.resolve(repoRoot, ws));
}

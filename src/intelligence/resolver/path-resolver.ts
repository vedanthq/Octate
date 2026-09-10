/**
 * Cross-file path resolution for TypeScript/JavaScript and Python.
 * Resolves relative imports, directory index files, path aliases,
 * workspace packages, and identifies external dependencies.
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { detectMonorepo, expandWorkspacePatterns } from '../../repository/monorepo.js';
import type { ResolvedImport } from '../types.js';

export interface WorkspaceInfo {
  name: string;
  path: string;
}

export interface PathResolverOptions {
  repoRoot: string;
  tsconfigPaths?: Record<string, string[]> | undefined;
  baseUrl?: string | undefined;
  workspaces?: WorkspaceInfo[] | undefined;
  knownFiles?: Set<string> | undefined;
}

export class PathResolver {
  private repoRoot: string;
  private tsconfigPaths: Record<string, string[]>;
  private baseUrl: string;
  private workspaces: WorkspaceInfo[];
  private knownFiles?: Set<string>;

  constructor(options: PathResolverOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.tsconfigPaths = options.tsconfigPaths ?? {};
    this.baseUrl = options.baseUrl ?? '.';
    this.workspaces = options.workspaces ?? [];
    if (options.knownFiles) {
      // Normalize known files to relative paths with forward slashes
      this.knownFiles = new Set(
        Array.from(options.knownFiles).map((f) => this.normalizeRelative(f))
      );
    }
  }

  /**
   * Resolves an import specifier from a source file.
   */
  public resolve(fromFile: string, specifier: string): ResolvedImport {
    const trimmedSpecifier = specifier.trim();

    // 1. Check path traversal attack: reject if it attempts to navigate out of repo
    const absFromFile = path.isAbsolute(fromFile)
      ? fromFile
      : path.resolve(this.repoRoot, fromFile);

    const fromDir = path.dirname(absFromFile);

    // 2. Python relative imports (starting with one or more dots)
    const pythonRelativeMatch = trimmedSpecifier.match(/^(\.+)(.*)$/);
    const isPython = fromFile.endsWith('.py');

    if (
      pythonRelativeMatch &&
      (isPython || (!trimmedSpecifier.startsWith('./') && !trimmedSpecifier.startsWith('../')))
    ) {
      const dotCount = pythonRelativeMatch[1]?.length ?? 0;
      const subpath = pythonRelativeMatch[2] ?? '';

      // In Python: 1 dot is current package dir, 2 dots is parent dir, etc.
      const levelsUp = dotCount - 1;
      let baseDir = fromDir;
      for (let i = 0; i < levelsUp; i++) {
        baseDir = path.dirname(baseDir);
      }

      if (!this.isWithinRepo(baseDir)) {
        return {
          specifier: trimmedSpecifier,
          resolvedPath: null,
          isExternal: false,
          isWorkspace: false,
        };
      }

      const slashSubpath = subpath ? subpath.split('.').filter(Boolean).join('/') : '';
      const candidateBase = slashSubpath ? path.resolve(baseDir, slashSubpath) : baseDir;

      const matched = this.matchFile(candidateBase, ['.py', '/__init__.py']);
      if (matched) {
        return {
          specifier: trimmedSpecifier,
          resolvedPath: this.toRepoRelative(matched),
          isExternal: false,
          isWorkspace: false,
        };
      }

      return {
        specifier: trimmedSpecifier,
        resolvedPath: null,
        isExternal: false,
        isWorkspace: false,
      };
    }

    // 3. Relative JS/TS/General imports (starting with ./ or ../)
    if (trimmedSpecifier.startsWith('./') || trimmedSpecifier.startsWith('../')) {
      const candidateBase = path.resolve(fromDir, trimmedSpecifier);

      if (!this.isWithinRepo(candidateBase)) {
        return {
          specifier: trimmedSpecifier,
          resolvedPath: null,
          isExternal: false,
          isWorkspace: false,
        };
      }

      const matched = this.matchFileWithAllExtensions(candidateBase);
      if (matched) {
        return {
          specifier: trimmedSpecifier,
          resolvedPath: this.toRepoRelative(matched),
          isExternal: false,
          isWorkspace: false,
        };
      }

      return {
        specifier: trimmedSpecifier,
        resolvedPath: null,
        isExternal: false,
        isWorkspace: false,
      };
    }

    // 4. TSConfig path aliases (e.g. @/*, @components/*)
    for (const [pattern, targets] of Object.entries(this.tsconfigPaths)) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (trimmedSpecifier.startsWith(prefix)) {
          const suffix = trimmedSpecifier.slice(prefix.length);
          for (const target of targets) {
            const replaced = target.replace('*', suffix);
            const candidateBase = path.resolve(this.repoRoot, this.baseUrl, replaced);
            if (this.isWithinRepo(candidateBase)) {
              const matched = this.matchFileWithAllExtensions(candidateBase);
              if (matched) {
                return {
                  specifier: trimmedSpecifier,
                  resolvedPath: this.toRepoRelative(matched),
                  isExternal: false,
                  isWorkspace: false,
                };
              }
            }
          }
        }
      } else if (pattern === trimmedSpecifier) {
        for (const target of targets) {
          const candidateBase = path.resolve(this.repoRoot, this.baseUrl, target);
          if (this.isWithinRepo(candidateBase)) {
            const matched = this.matchFileWithAllExtensions(candidateBase);
            if (matched) {
              return {
                specifier: trimmedSpecifier,
                resolvedPath: this.toRepoRelative(matched),
                isExternal: false,
                isWorkspace: false,
              };
            }
          }
        }
      }
    }

    // 5. Workspace packages
    for (const ws of this.workspaces) {
      if (trimmedSpecifier === ws.name || trimmedSpecifier.startsWith(`${ws.name}/`)) {
        const subpath =
          trimmedSpecifier === ws.name ? '' : trimmedSpecifier.slice(ws.name.length + 1);

        const wsDir = path.resolve(this.repoRoot, ws.path);
        const candidateBase = subpath ? path.resolve(wsDir, subpath) : wsDir;

        if (this.isWithinRepo(candidateBase)) {
          const matched = this.matchFileWithAllExtensions(candidateBase);
          if (matched) {
            return {
              specifier: trimmedSpecifier,
              resolvedPath: this.toRepoRelative(matched),
              isExternal: false,
              isWorkspace: true,
              packageName: ws.name,
            };
          }

          // Return workspace directory if no specific file matched
          return {
            specifier: trimmedSpecifier,
            resolvedPath: this.toRepoRelative(candidateBase),
            isExternal: false,
            isWorkspace: true,
            packageName: ws.name,
          };
        }
      }
    }

    // 6. Python absolute project-internal imports (e.g. app.models -> app/models.py)
    if (isPython) {
      const pythonPath = trimmedSpecifier.replace(/\./g, '/');
      const directCandidate = path.resolve(this.repoRoot, pythonPath);
      const matched = this.matchFile(directCandidate, ['.py', '/__init__.py']);
      if (matched && this.isWithinRepo(matched)) {
        return {
          specifier: trimmedSpecifier,
          resolvedPath: this.toRepoRelative(matched),
          isExternal: false,
          isWorkspace: false,
        };
      }

      // Also check under src/ if applicable
      const srcCandidate = path.resolve(this.repoRoot, 'src', pythonPath);
      const srcMatched = this.matchFile(srcCandidate, ['.py', '/__init__.py']);
      if (srcMatched && this.isWithinRepo(srcMatched)) {
        return {
          specifier: trimmedSpecifier,
          resolvedPath: this.toRepoRelative(srcMatched),
          isExternal: false,
          isWorkspace: false,
        };
      }
    }

    // 7. Bare external package
    const packageName = this.extractPackageName(trimmedSpecifier);
    return {
      specifier: trimmedSpecifier,
      resolvedPath: null,
      isExternal: true,
      isWorkspace: false,
      packageName,
    };
  }

  private matchFileWithAllExtensions(basePath: string): string | null {
    // If basePath has an extension (.js, .jsx) in ESM, try mapping to .ts, .tsx
    if (basePath.endsWith('.js')) {
      const tsPath = `${basePath.slice(0, -3)}.ts`;
      if (this.testFile(tsPath)) return tsPath;
      const tsxPath = `${basePath.slice(0, -3)}.tsx`;
      if (this.testFile(tsxPath)) return tsxPath;
      if (this.testFile(basePath)) return basePath;
    }

    if (basePath.endsWith('.jsx')) {
      const tsxPath = `${basePath.slice(0, -4)}.tsx`;
      if (this.testFile(tsxPath)) return tsxPath;
      if (this.testFile(basePath)) return basePath;
    }

    // Direct check if exact file exists
    if (this.testFile(basePath)) return basePath;

    // Suffix extensions to try
    const extensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.d.ts',
      '.py',
      '/index.ts',
      '/index.tsx',
      '/index.js',
      '/index.jsx',
      '/__init__.py',
    ];

    return this.matchFile(basePath, extensions);
  }

  private matchFile(basePath: string, extensions: string[]): string | null {
    for (const ext of extensions) {
      const candidate = `${basePath}${ext}`;
      if (this.testFile(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private testFile(absPath: string): boolean {
    if (!this.isWithinRepo(absPath)) return false;

    if (this.knownFiles) {
      const rel = this.toRepoRelative(absPath);
      return this.knownFiles.has(rel);
    }

    try {
      return existsSync(absPath);
    } catch {
      return false;
    }
  }

  private isWithinRepo(candidatePath: string): boolean {
    const resolved = path.resolve(candidatePath);
    const rel = path.relative(this.repoRoot, resolved);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  private toRepoRelative(absPath: string): string {
    const rel = path.relative(this.repoRoot, path.resolve(absPath));
    return this.normalizeRelative(rel);
  }

  private normalizeRelative(filePath: string): string {
    return filePath.split(path.sep).join('/');
  }

  private extractPackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }
    const first = specifier.split('/')[0];
    return first ?? specifier;
  }
}

/**
 * Resolves an import path using a PathResolver instance or direct options.
 */
export function resolveImportPath(
  fromFile: string,
  specifier: string,
  resolverOrOptions: PathResolver | PathResolverOptions
): ResolvedImport {
  const resolver =
    resolverOrOptions instanceof PathResolver
      ? resolverOrOptions
      : new PathResolver(resolverOrOptions);
  return resolver.resolve(fromFile, specifier);
}

/**
 * Creates a PathResolver by inspecting tsconfig.json and repository workspaces.
 */
export async function createPathResolver(
  repoRoot: string,
  options?: Partial<PathResolverOptions>
): Promise<PathResolver> {
  const root = path.resolve(repoRoot);
  let tsconfigPaths: Record<string, string[]> = {};
  let baseUrl = '.';

  // Attempt to read tsconfig.json
  const tsconfigPath = path.join(root, 'tsconfig.json');
  try {
    const raw = await fs.readFile(tsconfigPath, 'utf-8');
    // Strip single-line and multi-line comments
    const stripped = raw
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1');
    const parsed = JSON.parse(stripped);
    if (parsed.compilerOptions) {
      if (parsed.compilerOptions.paths) {
        tsconfigPaths = parsed.compilerOptions.paths;
      }
      if (parsed.compilerOptions.baseUrl) {
        baseUrl = parsed.compilerOptions.baseUrl;
      }
    }
  } catch {
    // tsconfig not found or invalid JSON
  }

  // Detect workspaces
  const workspaces: WorkspaceInfo[] = [];
  try {
    const monorepo = await detectMonorepo(root);
    if (monorepo && monorepo.workspaces.length > 0) {
      const dirs = await expandWorkspacePatterns(root, monorepo.workspaces);
      for (const dir of dirs) {
        const pkgJsonPath = path.join(root, dir, 'package.json');
        try {
          const pkgRaw = await fs.readFile(pkgJsonPath, 'utf-8');
          const pkg = JSON.parse(pkgRaw);
          if (pkg.name) {
            workspaces.push({
              name: pkg.name,
              path: dir,
            });
          }
        } catch {
          // No package.json or invalid
        }
      }
    }
  } catch {
    // Workspace detection failed
  }

  return new PathResolver({
    repoRoot: root,
    tsconfigPaths: options?.tsconfigPaths ?? tsconfigPaths,
    baseUrl: options?.baseUrl ?? baseUrl,
    workspaces: options?.workspaces ?? workspaces,
    knownFiles: options?.knownFiles,
  });
}

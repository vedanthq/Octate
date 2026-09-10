/**
 * Package and module-level dependency graph.
 * Tracks workspace packages, internal module dependencies, and external dependencies.
 */

import path from 'node:path';
import type { ParsedFile } from '../../analysis/types.js';
import type { PathResolver } from '../resolver/path-resolver.js';
import { extractImportStatements } from './reference.js';

export interface ModuleDependencyEdge {
  from: string;
  to: string;
  isExternal: boolean;
  isWorkspace: boolean;
}

export interface FileDependencies {
  internal: string[];
  external: string[];
  workspace: string[];
}

export class DependencyGraph {
  private internalDeps: Map<string, Set<string>> = new Map();
  private externalDeps: Map<string, Set<string>> = new Map();
  private workspaceDeps: Map<string, Set<string>> = new Map();
  private dependents: Map<string, Set<string>> = new Map();
  private allEdges: ModuleDependencyEdge[] = [];

  /**
   * Adds a module dependency edge.
   */
  public addModuleDependency(
    fromFile: string,
    toFileOrPackage: string,
    isExternal: boolean,
    isWorkspace: boolean
  ): void {
    const normFrom = path.normalize(fromFile);
    const normTo = isExternal || isWorkspace ? toFileOrPackage : path.normalize(toFileOrPackage);

    this.allEdges.push({
      from: normFrom,
      to: normTo,
      isExternal,
      isWorkspace,
    });

    if (isExternal) {
      const set = this.externalDeps.get(normFrom) ?? new Set();
      set.add(normTo);
      this.externalDeps.set(normFrom, set);
    } else if (isWorkspace) {
      const set = this.workspaceDeps.get(normFrom) ?? new Set();
      set.add(normTo);
      this.workspaceDeps.set(normFrom, set);
    } else {
      const set = this.internalDeps.get(normFrom) ?? new Set();
      set.add(normTo);
      this.internalDeps.set(normFrom, set);
    }

    // Add reverse dependent mapping
    const depSet = this.dependents.get(normTo) ?? new Set();
    depSet.add(normFrom);
    this.dependents.set(normTo, depSet);
  }

  /**
   * Returns all dependencies of a file or package categorized by type.
   */
  public getDependencies(fileOrPackage: string): FileDependencies {
    const norm = path.normalize(fileOrPackage);
    return {
      internal: Array.from(this.internalDeps.get(norm) ?? []),
      external: Array.from(this.externalDeps.get(norm) ?? []),
      workspace: Array.from(this.workspaceDeps.get(norm) ?? []),
    };
  }

  /**
   * Returns modules that depend on the given file or package.
   */
  public getDependents(fileOrPackage: string): string[] {
    const norm = path.normalize(fileOrPackage);
    const direct = this.dependents.get(norm);
    if (direct) {
      return Array.from(direct);
    }
    // Check raw name for external/workspace
    const raw = this.dependents.get(fileOrPackage);
    return raw ? Array.from(raw) : [];
  }

  /**
   * Detects circular dependencies among internal modules.
   * Returns list of cycles, each represented by an array of file paths in the cycle.
   */
  public detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const pathStack: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      recursionStack.add(node);
      pathStack.push(node);

      const neighbors = this.internalDeps.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Cycle detected
          const cycleStartIndex = pathStack.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            const cycle = pathStack.slice(cycleStartIndex);
            cycle.push(neighbor);
            cycles.push(cycle);
          }
        }
      }

      pathStack.pop();
      recursionStack.delete(node);
    };

    for (const node of this.internalDeps.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Returns all dependency edges.
   */
  public getAllEdges(): ModuleDependencyEdge[] {
    return [...this.allEdges];
  }
}

/**
 * Creates and populates a DependencyGraph from parsed files and PathResolver.
 */
export async function createDependencyGraph(
  files: ParsedFile[],
  pathResolver: PathResolver,
  _repoRoot: string,
  fileContents?: Map<string, string>
): Promise<DependencyGraph> {
  await Promise.resolve();
  const graph = new DependencyGraph();

  for (const file of files) {
    const normFile = path.normalize(file.file);
    const content = fileContents?.get(file.file);
    if (!content) continue;

    const imports = extractImportStatements(normFile, content);

    for (const imp of imports) {
      const resolved = pathResolver.resolve(normFile, imp.specifier);

      if (resolved.isExternal) {
        const pkgName = resolved.packageName ?? imp.specifier;
        graph.addModuleDependency(normFile, pkgName, true, false);
      } else if (resolved.isWorkspace) {
        const pkgName = resolved.packageName ?? resolved.resolvedPath ?? imp.specifier;
        graph.addModuleDependency(normFile, pkgName, false, true);
      } else if (resolved.resolvedPath) {
        graph.addModuleDependency(normFile, resolved.resolvedPath, false, false);
      }
    }
  }

  return graph;
}

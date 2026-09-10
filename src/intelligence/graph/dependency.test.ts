import { describe, expect, it } from '@jest/globals';
import type { ParsedFile } from '../../analysis/types.js';
import { PathResolver } from '../resolver/path-resolver.js';
import { createDependencyGraph, DependencyGraph } from './dependency.js';

describe('DependencyGraph', () => {
  it('categorizes dependencies into internal, workspace, and external', () => {
    const graph = new DependencyGraph();

    graph.addModuleDependency('src/app.ts', 'src/utils.ts', false, false);
    graph.addModuleDependency('src/app.ts', '@octate/core', false, true);
    graph.addModuleDependency('src/app.ts', 'zod', true, false);

    const deps = graph.getDependencies('src/app.ts');
    expect(deps.internal).toEqual(['src/utils.ts']);
    expect(deps.workspace).toEqual(['@octate/core']);
    expect(deps.external).toEqual(['zod']);

    const dependentsOfUtils = graph.getDependents('src/utils.ts');
    expect(dependentsOfUtils).toEqual(['src/app.ts']);

    const dependentsOfPkg = graph.getDependents('@octate/core');
    expect(dependentsOfPkg).toEqual(['src/app.ts']);
  });

  it('detects cycles among internal dependencies', () => {
    const graph = new DependencyGraph();

    // A -> B -> C -> A
    graph.addModuleDependency('src/a.ts', 'src/b.ts', false, false);
    graph.addModuleDependency('src/b.ts', 'src/c.ts', false, false);
    graph.addModuleDependency('src/c.ts', 'src/a.ts', false, false);

    const cycles = graph.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);
    const cycle = cycles[0];
    expect(cycle).toBeDefined();
    expect(cycle).toContain('src/a.ts');
    expect(cycle).toContain('src/b.ts');
    expect(cycle).toContain('src/c.ts');
  });

  it('returns empty cycles when graph is a DAG', () => {
    const graph = new DependencyGraph();

    graph.addModuleDependency('src/a.ts', 'src/b.ts', false, false);
    graph.addModuleDependency('src/b.ts', 'src/c.ts', false, false);

    const cycles = graph.detectCycles();
    expect(cycles).toHaveLength(0);
  });

  it('creates dependency graph from parsed files', async () => {
    const file1: ParsedFile = {
      file: 'src/main.ts',
      language: 'typescript',
      tree: null,
      symbols: [],
      parseTimeMs: 1,
    };

    const file2: ParsedFile = {
      file: 'src/helper.ts',
      language: 'typescript',
      tree: null,
      symbols: [],
      parseTimeMs: 1,
    };

    const contents = new Map<string, string>([
      ['src/main.ts', "import { help } from './helper';\nimport express from 'express';"],
      ['src/helper.ts', 'export const help = 1;'],
    ]);

    const resolver = new PathResolver({
      repoRoot: '/repo',
      knownFiles: new Set(['src/main.ts', 'src/helper.ts']),
    });

    const graph = await createDependencyGraph([file1, file2], resolver, '/repo', contents);
    const deps = graph.getDependencies('src/main.ts');

    expect(deps.internal).toEqual(['src/helper.ts']);
    expect(deps.external).toEqual(['express']);
  });
});

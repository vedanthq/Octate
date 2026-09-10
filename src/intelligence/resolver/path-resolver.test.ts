import { describe, expect, it } from '@jest/globals';
import { PathResolver, resolveImportPath } from './path-resolver.js';

describe('PathResolver', () => {
  const repoRoot = '/repo';
  const knownFiles = new Set([
    'src/index.ts',
    'src/utils.ts',
    'src/components/button.tsx',
    'src/components/index.ts',
    'src/config/app.json',
    'packages/core/index.ts',
    'packages/core/src/index.ts',
    'app/views/home.py',
    'app/views/__init__.py',
    'app/models/user.py',
    'app/models/__init__.py',
    'app/utils.py',
  ]);

  const resolver = new PathResolver({
    repoRoot,
    knownFiles,
    tsconfigPaths: {
      '@/*': ['src/*'],
      '@components/*': ['src/components/*'],
    },
    workspaces: [{ name: '@octate/core', path: 'packages/core' }],
  });

  it('resolves relative TypeScript/JavaScript imports', () => {
    const res = resolver.resolve('src/index.ts', './utils');
    expect(res.resolvedPath).toBe('src/utils.ts');
    expect(res.isExternal).toBe(false);
    expect(res.isWorkspace).toBe(false);
  });

  it('resolves ESM imports with .js extension to .ts file', () => {
    const res = resolver.resolve('src/index.ts', './utils.js');
    expect(res.resolvedPath).toBe('src/utils.ts');
    expect(res.isExternal).toBe(false);
  });

  it('resolves directory index imports', () => {
    const res = resolver.resolve('src/index.ts', './components');
    expect(res.resolvedPath).toBe('src/components/index.ts');
    expect(res.isExternal).toBe(false);
  });

  it('resolves parent relative imports', () => {
    const res = resolver.resolve('src/components/button.tsx', '../utils');
    expect(res.resolvedPath).toBe('src/utils.ts');
  });

  it('resolves tsconfig path aliases (@/*)', () => {
    const res = resolver.resolve('src/index.ts', '@/components/button');
    expect(res.resolvedPath).toBe('src/components/button.tsx');
    expect(res.isExternal).toBe(false);
  });

  it('resolves workspace package imports', () => {
    const res = resolver.resolve('src/index.ts', '@octate/core');
    expect(res.isWorkspace).toBe(true);
    expect(res.packageName).toBe('@octate/core');
    expect(res.resolvedPath).toBe('packages/core/index.ts');
  });

  it('flags bare external packages as external', () => {
    const lodashRes = resolver.resolve('src/index.ts', 'lodash');
    expect(lodashRes.isExternal).toBe(true);
    expect(lodashRes.resolvedPath).toBeNull();
    expect(lodashRes.packageName).toBe('lodash');

    const zodRes = resolver.resolve('src/index.ts', 'zod');
    expect(zodRes.isExternal).toBe(true);
    expect(zodRes.packageName).toBe('zod');

    const scopedRes = resolver.resolve('src/index.ts', '@types/node');
    expect(scopedRes.isExternal).toBe(true);
    expect(scopedRes.packageName).toBe('@types/node');
  });

  it('resolves Python relative imports', () => {
    const res = resolver.resolve('app/views/home.py', '..models.user');
    expect(res.resolvedPath).toBe('app/models/user.py');
    expect(res.isExternal).toBe(false);

    const sameDirRes = resolver.resolve('app/views/home.py', '..utils');
    expect(sameDirRes.resolvedPath).toBe('app/utils.py');
  });

  it('rejects path traversal attempts outside repoRoot', () => {
    const traversal = resolver.resolve('src/index.ts', '../../../../etc/passwd');
    expect(traversal.resolvedPath).toBeNull();
    expect(traversal.isExternal).toBe(false);

    const sneakyTraversal = resolver.resolve('src/index.ts', './../../../../../../etc/shadow');
    expect(sneakyTraversal.resolvedPath).toBeNull();
  });

  it('resolveImportPath helper works with options or instance', () => {
    const res1 = resolveImportPath('src/index.ts', './utils', resolver);
    expect(res1.resolvedPath).toBe('src/utils.ts');

    const res2 = resolveImportPath('src/index.ts', 'express', { repoRoot });
    expect(res2.isExternal).toBe(true);
    expect(res2.packageName).toBe('express');
  });
});

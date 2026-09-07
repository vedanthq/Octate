/**
 * Tests for repository discovery module.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findGitRoot, detectWorkspace, discoverRepository } from './discovery.js';
import { detectMonorepo } from './monorepo.js';

describe('findGitRoot', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-test-'));
    await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('finds .git directory in current directory', async () => {
    const result = await findGitRoot(testDir);
    expect(result).toBe(testDir);
  });

  it('finds .git directory from subdirectory', async () => {
    const subDir = path.join(testDir, 'src', 'lib');
    await fs.mkdir(subDir, { recursive: true });
    const result = await findGitRoot(subDir);
    expect(result).toBe(testDir);
  });

  it('returns null when not in a git repository', async () => {
    const nonGitDir = await fs.mkdtemp(path.join('/tmp', 'octate-nongit-'));
    try {
      const result = await findGitRoot(nonGitDir);
      expect(result).toBeNull();
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it('handles worktree .git file', async () => {
    // Create a worktree scenario
    const worktreeDir = path.join(testDir, 'worktree');
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(path.join(worktreeDir, '.git'), `gitdir: ${path.join(testDir, '.git')}\n`);
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');

    const result = await findGitRoot(worktreeDir);
    expect(result).toBe(testDir);
  });
});

describe('detectWorkspace', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-test-'));
    await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('detects pnpm workspace', async () => {
    await fs.writeFile(
      path.join(testDir, 'pnpm-workspace.yaml'),
      `packages:\n  - packages/*\n  - apps/*\n`
    );
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'apps', 'app1'), { recursive: true });

    const result = await detectWorkspace(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('pnpm');
    // workspaces contains expanded absolute paths
    expect(result?.workspaces.some(w => w.includes('packages/pkg1'))).toBe(true);
    expect(result?.workspaces.some(w => w.includes('apps/app1'))).toBe(true);
  });

  it('detects npm/yarn workspace', async () => {
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );
    await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectWorkspace(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('npm');
  });

  it('detects yarn workspace', async () => {
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );
    await fs.writeFile(path.join(testDir, 'yarn.lock'), '# yarn lockfile');
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectWorkspace(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('yarn');
  });

  it('detects Turborepo when no npm workspaces', async () => {
    await fs.writeFile(
      path.join(testDir, 'turbo.json'),
      JSON.stringify({ packages: ['packages/*'] }, null, 2)
    );
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectWorkspace(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('turbo');
  });

  it('detects Nx workspace when no npm workspaces', async () => {
    await fs.writeFile(
      path.join(testDir, 'nx.json'),
      JSON.stringify({ projects: { 'my-app': {}, 'my-lib': {} } }, null, 2)
    );
    await fs.mkdir(path.join(testDir, 'my-app'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'my-lib'), { recursive: true });

    const result = await detectWorkspace(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('nx');
  });

  it('returns undefined for non-monorepo', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'single' }, null, 2));
    const result = await detectWorkspace(testDir);
    expect(result).toBeUndefined();
  });
});

describe('discoverRepository', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-test-'));
    await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'test-repo' }, null, 2));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('discovers repository from current directory', async () => {
    const repo = await discoverRepository(testDir);
    expect(repo.root).toBe(testDir);
    expect(repo.gitDir).toBe(path.join(testDir, '.git'));
    expect(repo.workspaces).toHaveLength(1);
    expect(repo.workspaces[0]?.root).toBe(testDir);
  });

  it('discovers repository from subdirectory', async () => {
    const subDir = path.join(testDir, 'src', 'lib');
    await fs.mkdir(subDir, { recursive: true });
    const repo = await discoverRepository(subDir);
    expect(repo.root).toBe(testDir);
  });

  it('throws error when not in a git repository', async () => {
    const nonGitDir = await fs.mkdtemp(path.join('/tmp', 'octate-nongit-'));
    try {
      await expect(discoverRepository(nonGitDir)).rejects.toThrow('Not in a Git repository');
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe('detectMonorepo', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-test-'));
    await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('prioritizes pnpm over npm', async () => {
    await fs.writeFile(path.join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2));
    await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('pnpm');
  });

  it('prioritizes npm over turbo', async () => {
    await fs.writeFile(path.join(testDir, 'turbo.json'), JSON.stringify({ pipeline: {} }, null, 2));
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2));
    await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('npm');
  });

  it('prioritizes turbo over nx when no npm workspaces', async () => {
    await fs.writeFile(path.join(testDir, 'turbo.json'), JSON.stringify({ packages: ['packages/*'] }, null, 2));
    await fs.writeFile(path.join(testDir, 'nx.json'), JSON.stringify({ projects: {} }, null, 2));
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('turbo');
  });
});
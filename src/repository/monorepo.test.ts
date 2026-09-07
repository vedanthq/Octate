/**
 * Tests for monorepo detection module.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { aggregateWorkspaces, detectMonorepo, expandWorkspacePatterns } from './monorepo.js';

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

  it('detects pnpm workspace', async () => {
    await fs.writeFile(path.join(testDir, 'pnpm-workspace.yaml'), `packages:\n  - packages/*\n`);
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('pnpm');
    expect(result?.workspaces).toEqual(['packages/*']);
  });

  it('detects npm workspace with package-lock.json', async () => {
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );
    await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('npm');
    expect(result?.workspaces).toEqual(['packages/*']);
  });

  it('detects yarn workspace with yarn.lock', async () => {
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );
    await fs.writeFile(path.join(testDir, 'yarn.lock'), '# yarn lockfile');
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('yarn');
  });

  it('detects Turborepo when no npm workspaces', async () => {
    await fs.writeFile(
      path.join(testDir, 'turbo.json'),
      JSON.stringify({ packages: ['packages/*'] }, null, 2)
    );
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('turbo');
    expect(result?.workspaces).toEqual(['packages/*']);
  });

  it('detects Nx workspace when no npm workspaces', async () => {
    await fs.writeFile(
      path.join(testDir, 'nx.json'),
      JSON.stringify({ projects: { 'my-app': {}, 'my-lib': {} } }, null, 2)
    );
    await fs.mkdir(path.join(testDir, 'my-app'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'my-lib'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('nx');
    expect(result?.workspaces).toContain('my-app');
    expect(result?.workspaces).toContain('my-lib');
  });

  it('returns null when no monorepo config', async () => {
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'single' }, null, 2)
    );
    const result = await detectMonorepo(testDir);
    expect(result).toBeNull();
  });

  it('prioritizes pnpm > npm > turbo > nx', async () => {
    // Create all configs
    await fs.writeFile(path.join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );
    await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(testDir, 'turbo.json'), JSON.stringify({ pipeline: {} }, null, 2));
    await fs.writeFile(path.join(testDir, 'nx.json'), JSON.stringify({ projects: {} }, null, 2));
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('pnpm');
  });

  it('prioritizes npm over turbo when both present', async () => {
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );
    await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(testDir, 'turbo.json'), JSON.stringify({ pipeline: {} }, null, 2));
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await detectMonorepo(testDir);
    expect(result).toBeDefined();
    expect(result?.type).toBe('npm');
  });
});

describe('expandWorkspacePatterns', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('expands literal directory paths', async () => {
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'packages', 'pkg2'), { recursive: true });

    const result = await expandWorkspacePatterns(testDir, ['packages/pkg1', 'packages/pkg2']);
    expect(result).toContain('packages/pkg1');
    expect(result).toContain('packages/pkg2');
  });

  it('skips non-existent directories', async () => {
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });

    const result = await expandWorkspacePatterns(testDir, [
      'packages/pkg1',
      'packages/nonexistent',
    ]);
    expect(result).toContain('packages/pkg1');
    expect(result).not.toContain('packages/nonexistent');
  });
});

describe('aggregateWorkspaces', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-test-'));
    await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('aggregates workspace paths', async () => {
    await fs.mkdir(path.join(testDir, 'packages', 'pkg1'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'packages', 'pkg2'), { recursive: true });

    const result = await aggregateWorkspaces(testDir, 'npm', ['packages/pkg1', 'packages/pkg2']);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(path.resolve(testDir, 'packages/pkg1'));
    expect(result[1]).toBe(path.resolve(testDir, 'packages/pkg2'));
  });
});

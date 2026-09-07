/**
 * Tests for scope resolution module.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as git from 'isomorphic-git';
import { resolveScope, parseRange, validateRef } from './scope.js';

describe('parseRange', () => {
  it('parses two-dot range', () => {
    const result = parseRange('HEAD~1..HEAD');
    expect(result).toEqual({ base: 'HEAD~1', head: 'HEAD', isThreeDot: false });
  });

  it('parses three-dot range', () => {
    const result = parseRange('main...HEAD');
    expect(result).toEqual({ base: 'main', head: 'HEAD', isThreeDot: true });
  });

  it('parses branch names', () => {
    const result = parseRange('feature/main..develop');
    expect(result).toEqual({ base: 'feature/main', head: 'develop', isThreeDot: false });
  });

  it('throws for invalid two-dot format', () => {
    expect(() => parseRange('HEAD..')).toThrow('Invalid two-dot range format');
    expect(() => parseRange('..HEAD')).toThrow('Invalid two-dot range format');
    expect(() => parseRange('HEAD...')).toThrow('Invalid three-dot range format');
    expect(() => parseRange('...HEAD')).toThrow('Invalid three-dot range format');
  });

  it('throws for no dots', () => {
    expect(() => parseRange('HEAD')).toThrow('Invalid range format');
  });
});

describe('resolveScope', () => {
  let testDir: string;
  let originalCwd: string;
  let headOid: string;
  let head1Oid: string;
  let head2Oid: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-scope-test-'));

    // Initialize a git repository
    await git.init({ fs, dir: testDir });
    await git.setConfig({ fs, dir: testDir, path: 'user.name', value: 'Test User' });
    await git.setConfig({ fs, dir: testDir, path: 'user.email', value: 'test@example.com' });

    // Create initial commit
    await fs.writeFile(path.join(testDir, 'README.md'), '# Test Repo\n');
    await git.add({ fs, dir: testDir, filepath: 'README.md' });
    await git.commit({ fs, dir: testDir, message: 'Initial commit' });
    headOid = await git.resolveRef({ fs, dir: testDir, ref: 'HEAD' });

    // Create second commit
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const a = 1;\n');
    await git.add({ fs, dir: testDir, filepath: 'file1.ts' });
    await git.commit({ fs, dir: testDir, message: 'Add file1' });
    head1Oid = await git.resolveRef({ fs, dir: testDir, ref: 'HEAD' });

    // Create third commit
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const b = 2;\n');
    await git.add({ fs, dir: testDir, filepath: 'file2.ts' });
    await git.commit({ fs, dir: testDir, message: 'Add file2' });
    head2Oid = await git.resolveRef({ fs, dir: testDir, ref: 'HEAD' });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('throws when no scope specified (commit type without commit)', async () => {
    await expect(
      resolveScope({ type: 'commit', repoRoot: testDir })
    ).rejects.toThrow('--commit requires a ref argument');
  });

  describe('--staged', () => {
    it('resolves staged scope', async () => {
      // Stage a new file
      await fs.writeFile(path.join(testDir, 'staged.ts'), 'export const c = 3;\n');
      await git.add({ fs, dir: testDir, filepath: 'staged.ts' });

      const scope = await resolveScope({
        type: 'staged',
        repoRoot: testDir,
      });

      expect(scope.type).toBe('staged');
      expect(scope.base).toBe('HEAD');
      expect(scope.head).toBe('INDEX');
      expect(scope.diff).toContain('staged.ts');
    });
  });

  describe('--working', () => {
    it('resolves working tree scope', async () => {
      // Create unstaged change
      await fs.writeFile(path.join(testDir, 'unstaged.ts'), 'export const d = 4;\n');

      const scope = await resolveScope({
        type: 'working-tree',
        repoRoot: testDir,
      });

      expect(scope.type).toBe('working-tree');
      expect(scope.base).toBe('INDEX');
      expect(scope.head).toBe('WORKDIR');
      expect(scope.diff).toContain('unstaged.ts');
    });
  });

  describe('--commit', () => {
    it('resolves commit scope', async () => {
      const scope = await resolveScope({
        type: 'commit',
        repoRoot: testDir,
        commit: head1Oid,
      });

      expect(scope.type).toBe('commit');
      expect(scope.head).toBe(head1Oid);
      expect(scope.base).toBe(headOid);
      expect(scope.files.length).toBeGreaterThan(0);
    });

    it('throws when commit ref not provided', async () => {
      await expect(
        resolveScope({ type: 'commit', repoRoot: testDir })
      ).rejects.toThrow('--commit requires a ref argument');
    });
  });

  describe('--range', () => {
    it('resolves two-dot range', async () => {
      const scope = await resolveScope({
        type: 'range',
        repoRoot: testDir,
        base: headOid,
        head: head2Oid,
      });

      expect(scope.type).toBe('range');
      expect(scope.base).toBe(headOid);
      expect(scope.head).toBe(head2Oid);
      // Should detect file1.ts, file2.ts added (and potentially README.md)
      expect(scope.files.length).toBeGreaterThanOrEqual(2);
    });

    it('throws when base or head not provided', async () => {
      await expect(
        resolveScope({ type: 'range', repoRoot: testDir, base: headOid })
      ).rejects.toThrow('--range requires both base and head refs');

      await expect(
        resolveScope({ type: 'range', repoRoot: testDir, head: head2Oid })
      ).rejects.toThrow('--range requires both base and head refs');
    });
  });

  describe('--branch', () => {
    it('resolves branch scope', async () => {
      // Create a branch
      await git.branch({ fs, dir: testDir, ref: 'feature-branch' });
      await fs.writeFile(path.join(testDir, 'feature.ts'), 'export const f = 1;\n');
      await git.add({ fs, dir: testDir, filepath: 'feature.ts' });
      await git.commit({ fs, dir: testDir, message: 'Feature commit' });

      const scope = await resolveScope({
        type: 'branch',
        repoRoot: testDir,
        branch: 'feature-branch',
      });

      expect(scope.type).toBe('branch');
      expect(scope.head).toBe('feature-branch');
      expect(scope.base).toBeDefined();
    });

    it('throws when branch not provided', async () => {
      await expect(
        resolveScope({ type: 'branch', repoRoot: testDir })
      ).rejects.toThrow('--branch requires a branch name');
    });
  });
});

describe('validateRef', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-validate-test-'));
    await git.init({ fs, dir: testDir });
    await git.setConfig({ fs, dir: testDir, path: 'user.name', value: 'Test User' });
    await git.setConfig({ fs, dir: testDir, path: 'user.email', value: 'test@example.com' });
    await fs.writeFile(path.join(testDir, 'README.md'), '# Test\n');
    await git.add({ fs, dir: testDir, filepath: 'README.md' });
    await git.commit({ fs, dir: testDir, message: 'Initial' });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns true for valid ref', async () => {
    const result = await validateRef(testDir, 'HEAD');
    expect(result).toBe(true);
  });

  it('returns true for valid branch', async () => {
    await git.branch({ fs, dir: testDir, ref: 'test-branch' });
    const result = await validateRef(testDir, 'test-branch');
    expect(result).toBe(true);
  });

  it('returns false for invalid ref', async () => {
    const result = await validateRef(testDir, 'invalid-ref-12345');
    expect(result).toBe(false);
  });
});
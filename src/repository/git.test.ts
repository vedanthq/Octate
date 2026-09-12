/**
 * Tests for Git operations module.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as git from 'isomorphic-git';
import {
  getChangedFiles,
  getDiff,
  getLog,
  getParentCommit,
  getStagedDiff,
  getStatus,
  getWorkingDiff,
  resolveRef,
} from './git.js';

describe('Git operations', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-git-test-'));

    // Initialize a git repository
    await git.init({ fs, dir: testDir });
    await git.setConfig({ fs, dir: testDir, path: 'user.name', value: 'Test User' });
    await git.setConfig({ fs, dir: testDir, path: 'user.email', value: 'test@example.com' });

    // Create initial commit
    await fs.writeFile(path.join(testDir, 'README.md'), '# Test Repo\n');
    await git.add({ fs, dir: testDir, filepath: 'README.md' });
    await git.commit({ fs, dir: testDir, message: 'Initial commit' });

    // Create second commit (Add file1)
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const a = 1;\n');
    await git.add({ fs, dir: testDir, filepath: 'file1.ts' });
    await git.commit({ fs, dir: testDir, message: 'Add file1' });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('resolveRef', () => {
    it('resolves HEAD to commit hash', async () => {
      const oid = await resolveRef(testDir, 'HEAD');
      expect(oid).toBeDefined();
      expect(oid.length).toBe(40); // SHA-1
    });

    it('resolves branch name', async () => {
      // Create a branch
      await git.branch({ fs, dir: testDir, ref: 'main' });
      const oid = await resolveRef(testDir, 'main');
      expect(oid).toBeDefined();
    });

    it('resolves full SHA', async () => {
      const oid = await resolveRef(testDir, 'HEAD');
      const resolved = await resolveRef(testDir, oid);
      expect(resolved).toBe(oid);
    });

    it('resolves short SHA', async () => {
      const headOid = await resolveRef(testDir, 'HEAD');
      const shortOid = headOid.slice(0, 7);
      const resolved = await resolveRef(testDir, shortOid);
      expect(resolved).toBe(headOid);
    });

    it('resolves relative ref HEAD~1', async () => {
      const commits = await getLog(testDir, { depth: 2 });
      const expectedInitialOid = commits[1]!.oid;
      const resolved = await resolveRef(testDir, 'HEAD~1');
      expect(resolved).toBe(expectedInitialOid);
    });

    it('resolves relative ref HEAD^', async () => {
      const commits = await getLog(testDir, { depth: 2 });
      const expectedInitialOid = commits[1]!.oid;
      const resolved = await resolveRef(testDir, 'HEAD^');
      expect(resolved).toBe(expectedInitialOid);
    });

    it('resolves relative ref with short SHA base', async () => {
      const commits = await getLog(testDir, { depth: 2 });
      const headShort = commits[0]!.oid.slice(0, 7);
      const expectedInitialOid = commits[1]!.oid;
      const resolved = await resolveRef(testDir, `${headShort}~1`);
      expect(resolved).toBe(expectedInitialOid);
    });

    it('resolves multi-step ancestors HEAD~2', async () => {
      // Add a third commit
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const b = 2;\n');
      await git.add({ fs, dir: testDir, filepath: 'file2.ts' });
      await git.commit({ fs, dir: testDir, message: 'Add file2' });

      const commits = await getLog(testDir, { depth: 3 });
      const initialOid = commits[2]!.oid;
      const resolved = await resolveRef(testDir, 'HEAD~2');
      expect(resolved).toBe(initialOid);

      const resolvedChained = await resolveRef(testDir, 'HEAD^^');
      expect(resolvedChained).toBe(initialOid);
    });

    it('resolves zero modifier HEAD~0 and HEAD^0 to commit itself', async () => {
      const headOid = await resolveRef(testDir, 'HEAD');
      expect(await resolveRef(testDir, 'HEAD~0')).toBe(headOid);
      expect(await resolveRef(testDir, 'HEAD^0')).toBe(headOid);
    });

    it('throws when stepping past root commit', async () => {
      await expect(resolveRef(testDir, 'HEAD~99')).rejects.toThrow('reached root commit');
    });

    it('throws when empty repository has no commits', async () => {
      const emptyDir = await fs.mkdtemp(path.join('/tmp', 'octate-empty-test-'));
      try {
        await git.init({ fs, dir: emptyDir });
        await expect(resolveRef(emptyDir, 'HEAD')).rejects.toThrow('Repository has no commits');
      } finally {
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('throws for empty or whitespace ref', async () => {
      await expect(resolveRef(testDir, '')).rejects.toThrow('Git reference cannot be empty');
      await expect(resolveRef(testDir, '   ')).rejects.toThrow('Git reference cannot be empty');
    });

    it('throws for invalid modifier syntax', async () => {
      await expect(resolveRef(testDir, 'HEAD~foo')).rejects.toThrow('Invalid revision syntax');
      await expect(resolveRef(testDir, '~1')).rejects.toThrow('missing base revision');
    });

    it('throws for invalid ref', async () => {
      await expect(resolveRef(testDir, 'invalid-ref-12345')).rejects.toThrow();
    });
  });

  describe('getLog', () => {
    it('returns commit history (newest first)', async () => {
      // Create third commit (Second commit)
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2\n');
      await git.add({ fs, dir: testDir, filepath: 'file2.txt' });
      await git.commit({ fs, dir: testDir, message: 'Second commit' });

      const log = await getLog(testDir, { depth: 10 });
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(log[0]?.oid).toBeDefined();
      expect(log[0]?.message).toBe('Second commit');
      expect(log[1]?.message).toBe('Add file1');
    });

    it('respects depth option', async () => {
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), `content${i}\n`);
        await git.add({ fs, dir: testDir, filepath: `file${i}.txt` });
        await git.commit({ fs, dir: testDir, message: `Commit ${i}` });
      }

      const log = await getLog(testDir, { depth: 3 });
      expect(log.length).toBe(3);
    });
  });

  describe('getStatus', () => {
    it('returns status matrix', async () => {
      const matrix = await getStatus(testDir);
      expect(Array.isArray(matrix)).toBe(true);
      // Should have at least README.md
      expect(matrix.length).toBeGreaterThanOrEqual(1);
    });

    it('detects unstaged changes', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), '# Modified\n');
      const matrix = await getStatus(testDir);
      const readmeEntry = matrix.find(([filepath]) => filepath === 'README.md');
      expect(readmeEntry).toBeDefined();
      // workdir status: 2 = modified in workdir
      expect(readmeEntry?.[2]).toBe(2);
    });
  });

  describe('getDiff', () => {
    it('produces diff between two commits', async () => {
      // Create third commit
      await fs.writeFile(path.join(testDir, 'new-file.txt'), 'new content\n');
      await git.add({ fs, dir: testDir, filepath: 'new-file.txt' });
      await git.commit({ fs, dir: testDir, message: 'Add new file' });

      const headOid = await resolveRef(testDir, 'HEAD');
      const head1Oid = await getParentCommit(testDir, headOid);

      const diff = await getDiff(testDir, head1Oid, headOid);
      expect(diff).toContain('new-file.txt');
      expect(diff).toContain('+new content');
    });

    it('produces diff for modified file', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), '# Modified\n');
      await git.add({ fs, dir: testDir, filepath: 'README.md' });
      await git.commit({ fs, dir: testDir, message: 'Modify README' });

      const headOid = await resolveRef(testDir, 'HEAD');
      const head1Oid = await getParentCommit(testDir, headOid);

      const diff = await getDiff(testDir, head1Oid, headOid);
      expect(diff).toContain('README.md');
      expect(diff).toContain('-# Test Repo');
      expect(diff).toContain('+# Modified');
    });
  });

  describe('getChangedFiles', () => {
    it('returns file changes between commits', async () => {
      await fs.writeFile(path.join(testDir, 'new-file.txt'), 'new content\n');
      await git.add({ fs, dir: testDir, filepath: 'new-file.txt' });
      await fs.writeFile(path.join(testDir, 'README.md'), '# Modified\n');
      await git.add({ fs, dir: testDir, filepath: 'README.md' });
      await git.commit({ fs, dir: testDir, message: 'Add and modify' });

      const headOid = await resolveRef(testDir, 'HEAD');
      const head1Oid = await getParentCommit(testDir, headOid);

      const changes = await getChangedFiles(testDir, head1Oid, headOid);
      expect(changes.length).toBeGreaterThanOrEqual(2);

      const newFile = changes.find((c) => c.path === 'new-file.txt');
      expect(newFile).toBeDefined();
      expect(newFile?.status).toBe('added');

      const modifiedFile = changes.find((c) => c.path === 'README.md');
      expect(modifiedFile).toBeDefined();
      expect(modifiedFile?.status).toBe('modified');
    });
  });

  describe('getStagedDiff', () => {
    it('produces diff for staged changes', async () => {
      await fs.writeFile(path.join(testDir, 'staged-file.txt'), 'staged content\n');
      await git.add({ fs, dir: testDir, filepath: 'staged-file.txt' });

      const diff = await getStagedDiff(testDir);
      expect(diff).toContain('staged-file.txt');
      expect(diff).toContain('+staged content');
    });

    it('returns empty string when nothing is staged', async () => {
      const diff = await getStagedDiff(testDir);
      expect(diff.trim()).toBe('');
    });
  });

  describe('getWorkingDiff', () => {
    it('produces diff for unstaged working tree changes', async () => {
      // Stage a file first
      await fs.writeFile(path.join(testDir, 'staged.txt'), 'staged\n');
      await git.add({ fs, dir: testDir, filepath: 'staged.txt' });
      await git.commit({ fs, dir: testDir, message: 'Stage file' });

      // Now make unstaged change
      await fs.writeFile(path.join(testDir, 'unstaged.txt'), 'unstaged\n');
      // Don't add it

      const diff = await getWorkingDiff(testDir);
      expect(diff).toContain('unstaged.txt');
      expect(diff).toContain('+unstaged');
    });

    it('returns empty string when changes are staged and working tree matches index', async () => {
      await fs.writeFile(path.join(testDir, 'only-staged.txt'), 'content\n');
      await git.add({ fs, dir: testDir, filepath: 'only-staged.txt' });

      const workingDiff = await getWorkingDiff(testDir);
      expect(workingDiff.trim()).toBe('');
    });
  });
});

describe('Git error handling', () => {
  it('throws GitError for non-existent repository', async () => {
    const nonExistentDir = '/tmp/this-does-not-exist-12345';
    await expect(resolveRef(nonExistentDir, 'HEAD')).rejects.toThrow();
  });
});

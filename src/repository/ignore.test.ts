/**
 * Tests for ignore.ts - Ignore pattern parsing and matching.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  createIgnoreMatcher,
  createWorkspaceIgnoreMatcher,
  loadIgnorePatterns,
  normalizePathForIgnore,
  parseIgnoreFile,
} from './ignore.js';

describe('ignore', () => {
  let testDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `octate-test-${randomUUID()}`);
    repoRoot = join(testDir, 'repo');
    await mkdir(repoRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('parseIgnoreFile', () => {
    it('parses .gitignore patterns correctly', async () => {
      const gitignorePath = join(repoRoot, '.gitignore');
      await writeFile(gitignorePath, `node_modules/\n*.log\n# comment\nbuild/\n\ndist/\n`);

      const result = await parseIgnoreFile(gitignorePath);

      expect(result.patterns).toEqual(['node_modules/', '*.log', 'build/', 'dist/']);
      expect(result.filePath).toBe(gitignorePath);
    });

    it('handles empty file', async () => {
      const gitignorePath = join(repoRoot, '.gitignore');
      await writeFile(gitignorePath, '');

      const result = await parseIgnoreFile(gitignorePath);

      expect(result.patterns).toEqual([]);
    });

    it('handles missing file gracefully', async () => {
      const gitignorePath = join(repoRoot, '.gitignore');

      const result = await parseIgnoreFile(gitignorePath);

      expect(result.patterns).toEqual([]);
      expect(result.filePath).toBe(gitignorePath);
    });

    it('ignores comments and blank lines', async () => {
      const gitignorePath = join(repoRoot, '.gitignore');
      await writeFile(
        gitignorePath,
        `# This is a comment\n\nnode_modules/\n  \n# Another comment\ndist/\n`
      );

      const result = await parseIgnoreFile(gitignorePath);

      expect(result.patterns).toEqual(['node_modules/', 'dist/']);
    });
  });

  describe('createIgnoreMatcher', () => {
    it('creates matcher with patterns', () => {
      const matcher = createIgnoreMatcher(['node_modules/', '*.log']);

      expect(matcher.ignores('node_modules/foo.js')).toBe(true);
      expect(matcher.ignores('src/foo.log')).toBe(true);
      expect(matcher.ignores('src/foo.js')).toBe(false);
    });

    it('handles empty patterns', () => {
      const matcher = createIgnoreMatcher([]);

      expect(matcher.ignores('anything')).toBe(false);
    });

    it('createFilter returns filter function', () => {
      const matcher = createIgnoreMatcher(['node_modules/']);
      const filter = matcher.createFilter();

      expect(filter('node_modules/foo.js')).toBe(false);
      expect(filter('src/foo.js')).toBe(true);
    });

    it('add method adds patterns', () => {
      const matcher = createIgnoreMatcher(['*.log']);
      matcher.add('dist/');

      expect(matcher.ignores('app.log')).toBe(true);
      expect(matcher.ignores('dist/main.js')).toBe(true);
    });
  });

  describe('loadIgnorePatterns', () => {
    it('loads .gitignore patterns', async () => {
      await writeFile(join(repoRoot, '.gitignore'), 'node_modules/\n*.log\n');

      const matcher = await loadIgnorePatterns(repoRoot);

      expect(matcher.ignores('node_modules/foo.js')).toBe(true);
      expect(matcher.ignores('app.log')).toBe(true);
    });

    it('loads .octateignore patterns on top of .gitignore', async () => {
      await writeFile(join(repoRoot, '.gitignore'), 'node_modules/\n');
      await writeFile(join(repoRoot, '.octateignore'), '*.tmp\n');

      const matcher = await loadIgnorePatterns(repoRoot);

      expect(matcher.ignores('node_modules/foo.js')).toBe(true);
      expect(matcher.ignores('app.tmp')).toBe(true);
    });

    it('adds config patterns with highest precedence', async () => {
      await writeFile(join(repoRoot, '.gitignore'), '*.log\n');

      const matcher = await loadIgnorePatterns(repoRoot, ['custom/']);

      expect(matcher.ignores('app.log')).toBe(true);
      expect(matcher.ignores('custom/file.txt')).toBe(true);
    });

    it('always excludes critical directories', async () => {
      const matcher = await loadIgnorePatterns(repoRoot);

      expect(matcher.ignores('.git/config')).toBe(true);
      expect(matcher.ignores('node_modules/foo/package.json')).toBe(true);
      expect(matcher.ignores('vendor/lib.js')).toBe(true);
      expect(matcher.ignores('dist/main.js')).toBe(true);
      expect(matcher.ignores('build/output.js')).toBe(true);
      expect(matcher.ignores('app.log')).toBe(true);
      expect(matcher.ignores('.DS_Store')).toBe(true);
    });
  });

  describe('createWorkspaceIgnoreMatcher', () => {
    it('unions root and workspace patterns', async () => {
      await writeFile(join(repoRoot, '.gitignore'), 'node_modules/\n');
      await writeFile(join(repoRoot, '.octateignore'), '*.root.tmp\n');

      const workspaceRoot = join(repoRoot, 'packages', 'my-package');
      await mkdir(workspaceRoot, { recursive: true });
      await writeFile(join(workspaceRoot, '.gitignore'), 'dist/\n');
      await writeFile(join(workspaceRoot, '.octateignore'), '*.workspace.tmp\n');

      const matcher = await createWorkspaceIgnoreMatcher(repoRoot, workspaceRoot);

      // Root patterns
      expect(matcher.ignores('node_modules/foo.js')).toBe(true);
      expect(matcher.ignores('app.root.tmp')).toBe(true);
      // Workspace patterns
      expect(matcher.ignores('packages/my-package/dist/main.js')).toBe(true);
      expect(matcher.ignores('packages/my-package/app.workspace.tmp')).toBe(true);
    });
  });

  describe('normalizePathForIgnore', () => {
    it('normalizes relative paths with forward slashes', () => {
      const normalized = normalizePathForIgnore('/repo', 'src/foo.js');
      expect(normalized).toBe('src/foo.js');
    });

    it('normalizes absolute paths to relative', () => {
      const normalized = normalizePathForIgnore('/repo', '/repo/src/foo.js');
      expect(normalized).toBe('src/foo.js');
    });

    it('handles Windows backslashes', () => {
      const normalized = normalizePathForIgnore('/repo', 'src\\foo.js');
      expect(normalized).toBe('src/foo.js');
    });
  });
});

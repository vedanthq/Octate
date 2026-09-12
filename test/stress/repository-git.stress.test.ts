/**
 * Phase 2 & Phase 3 Stress Tests:
 * Repository, Filesystem, Git Scope, and Diff Resilience.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from '@jest/globals';
import fastGlob from 'fast-glob';
import * as git from 'isomorphic-git';
import { analyzeFiles } from '../../src/analysis/orchestrator.js';
import { findGitRoot } from '../../src/repository/discovery.js';
import { createFileFilter } from '../../src/repository/filter.js';
import { findGitDir } from '../../src/repository/git.js';
import { createIgnoreMatcher } from '../../src/repository/ignore.js';
import { resolveScope } from '../../src/repository/scope.js';
import { cleanupTempDir, createTempDir, createTempGitRepo } from './stress-helper.js';

describe('Phase 2 & 3: Repository, Filesystem & Git Stress Suite', () => {
  const tempDirsToClean: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirsToClean) {
      await cleanupTempDir(dir);
    }
  });

  describe('Empty and Edge-Case Repositories', () => {
    it('handles completely empty repository with no commits', async () => {
      const { repoRoot, cleanup } = await createTempGitRepo();
      tempDirsToClean.push(repoRoot);

      // Verify Git detection recognizes empty repo
      const root = await findGitRoot(repoRoot);
      expect(root).toBe(repoRoot);

      // Verify Git dir can be located
      const gitDir = await findGitDir(repoRoot);
      expect(gitDir).toBeDefined();

      // Working tree scope resolution on empty repo should return empty files & diff without throwing
      const scope = await resolveScope({ type: 'working-tree', repoRoot });
      expect(scope.files).toEqual([]);
      expect(scope.diff).toBe('');

      // Staged scope resolution on empty repo
      const stagedScope = await resolveScope({ type: 'staged', repoRoot });
      expect(stagedScope.files).toEqual([]);
      expect(stagedScope.diff).toBe('');

      await cleanup();
    });

    it('handles repository containing only ignored files', async () => {
      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          '.gitignore': '*.log\nbuild/\n*.tmp\n',
          'app.log': 'system log 1',
          'build/bundle.js': 'console.log("bundled");',
          'temp.tmp': 'temporary data',
        },
      });
      tempDirsToClean.push(repoRoot);

      const allFiles = await fastGlob('**/*', { cwd: repoRoot, dot: true });
      expect(allFiles.length).toBeGreaterThanOrEqual(4);

      const matcher = await createIgnoreMatcher(repoRoot);
      const filter = await createFileFilter(repoRoot, matcher);
      const allowed: string[] = [];
      for (const p of allFiles) {
        const res = await filter.analyzeFile(repoRoot, p);
        if (res.shouldAnalyze) {
          allowed.push(p);
        }
      }

      expect(allowed).toContain('.gitignore');
      expect(allowed).not.toContain('app.log');
      expect(allowed).not.toContain('build/bundle.js');
      expect(allowed).not.toContain('temp.tmp');

      await cleanup();
    });
  });

  describe('Deep Nesting and Extreme File Contents', () => {
    it('handles deeply nested directories (depth 50) without stack overflow', async () => {
      const nestedPathParts = Array.from({ length: 50 }, (_, i) => `level_${i}`);
      const deepRelDir = path.join(...nestedPathParts);
      const deepRelFile = path.join(deepRelDir, 'deep_module.ts');

      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          [deepRelFile]:
            'export const DEEP_CONSTANT = 42;\nexport function deep() { return DEEP_CONSTANT; }\n',
        },
      });
      tempDirsToClean.push(repoRoot);

      const tracked = await git.listFiles({ fs, dir: repoRoot });
      expect(tracked).toContain(deepRelFile);

      // Parse and analyze deeply nested file
      const analysis = await analyzeFiles([deepRelFile], repoRoot);
      expect(analysis.metrics.totalFiles).toBe(1);
      expect(analysis.parsedFiles.length).toBe(1);
      expect(analysis.parsedFiles[0]?.symbols.length).toBeGreaterThanOrEqual(2);

      await cleanup();
    });

    it('handles zero-byte files safely without crashing', async () => {
      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          'empty.ts': '',
          'empty.py': '',
        },
      });
      tempDirsToClean.push(repoRoot);

      const analysis = await analyzeFiles(['empty.ts', 'empty.py'], repoRoot);
      expect(analysis.metrics.totalFiles).toBe(2);
      expect(analysis.parsedFiles.length).toBe(0); // Zero-byte files safely bypass AST parsing
      expect(analysis.symbols).toEqual([]);

      await cleanup();
    });

    it('handles binary files masquerading as source files (null bytes)', async () => {
      const tempDir = await createTempDir('binary-source-');
      tempDirsToClean.push(tempDir);

      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x61, 0x62, 0x63]);
      const filePath = path.join(tempDir, 'fake.ts');
      await fs.writeFile(filePath, binaryContent);

      const analysis = await analyzeFiles(['fake.ts'], tempDir);
      expect(analysis.metrics.totalFiles).toBe(1);
      expect(analysis.parsedFiles.length).toBe(1);

      await cleanupTempDir(tempDir);
    });

    it('handles invalid UTF-8 bytes gracefully', async () => {
      const tempDir = await createTempDir('invalid-utf8-');
      tempDirsToClean.push(tempDir);

      const invalidUtf8 = Buffer.from([0xc0, 0xaf, 0xed, 0xa0, 0x80, 0xfe, 0xff]);
      const filePath = path.join(tempDir, 'corrupted.py');
      await fs.writeFile(filePath, invalidUtf8);

      const analysis = await analyzeFiles(['corrupted.py'], tempDir);
      expect(analysis.metrics.totalFiles).toBe(1);
      expect(analysis.parsedFiles.length).toBe(1);

      await cleanupTempDir(tempDir);
    });
  });

  describe('Symlink Chains, Cycles, and Unusual Filenames', () => {
    it('handles broken and dangling symlinks without crashing discovery', async () => {
      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          'valid.ts': 'export const valid = 1;\n',
        },
      });
      tempDirsToClean.push(repoRoot);

      const danglingLink = path.join(repoRoot, 'dangling.ts');
      await fs.symlink(path.join(repoRoot, 'does-not-exist.ts'), danglingLink);

      const allFiles = await fastGlob('**/*', { cwd: repoRoot, followSymbolicLinks: false });
      expect(allFiles).toContain('valid.ts');

      await cleanup();
    });

    it('handles filenames with spaces, quotes, emojis, and leading dashes', async () => {
      const weirdFiles: Record<string, string> = {
        'file with spaces.ts': 'export const spaces = true;\n',
        'file-"with"-quotes.ts': 'export const quotes = true;\n',
        'file-🚀-emoji.ts': 'export const emoji = true;\n',
        '-leading-dash.ts': 'export const dash = true;\n',
      };

      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: weirdFiles,
      });
      tempDirsToClean.push(repoRoot);

      const tracked = await git.listFiles({ fs, dir: repoRoot });
      for (const expectedName of Object.keys(weirdFiles)) {
        expect(tracked).toContain(expectedName);
      }

      // Analyze files with hostile names
      const analysis = await analyzeFiles(Object.keys(weirdFiles), repoRoot);
      expect(analysis.metrics.totalFiles).toBe(4);
      expect(analysis.parsedFiles.length).toBe(4);

      await cleanup();
    });
  });

  describe('Git Diffs & Scope Stress Tests', () => {
    it('handles staged, unstaged, and untracked changes distinctly', async () => {
      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          'staged.ts': 'export const a = 1;\n',
          'unstaged.ts': 'export const b = 1;\n',
        },
      });
      tempDirsToClean.push(repoRoot);

      // 1. Make unstaged modification
      await fs.appendFile(path.join(repoRoot, 'unstaged.ts'), 'export const bModified = 2;\n');

      // 2. Make staged modification
      await fs.appendFile(path.join(repoRoot, 'staged.ts'), 'export const aModified = 2;\n');
      await git.add({ fs, dir: repoRoot, filepath: 'staged.ts' });

      // Check staged scope (compares HEAD vs INDEX)
      const stagedScope = await resolveScope({ type: 'staged', repoRoot });
      expect(stagedScope.files.map((f) => f.path)).toContain('staged.ts');
      expect(stagedScope.files.map((f) => f.path)).not.toContain('unstaged.ts');
      expect(stagedScope.diff).toContain('+export const aModified = 2;');

      // Check working tree scope (compares INDEX vs WORKDIR)
      const workingScope = await resolveScope({ type: 'working-tree', repoRoot });
      const workingPaths = workingScope.files.map((f) => f.path);
      expect(workingPaths).toContain('unstaged.ts');
      expect(workingScope.diff).toContain('+export const bModified = 2;');

      await cleanup();
    });

    it('handles huge diffs with thousands of generated lines without hanging', async () => {
      const hugeLineCount = 2000;
      const lines = Array.from(
        { length: hugeLineCount },
        (_, i) => `export const val_${i} = ${i};`
      );
      const fileContent = `${lines.join('\n')}\n`;

      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          'huge.ts': 'export const val_init = 0;\n',
        },
      });
      tempDirsToClean.push(repoRoot);

      // Replace with 2000 lines
      await fs.writeFile(path.join(repoRoot, 'huge.ts'), fileContent, 'utf-8');

      const scope = await resolveScope({ type: 'working-tree', repoRoot });
      expect(scope.files.length).toBe(1);
      expect(scope.files[0]?.path).toBe('huge.ts');
      expect(scope.diff.length).toBeGreaterThan(10000);

      const analysis = await analyzeFiles(['huge.ts'], repoRoot);
      expect(analysis.parsedFiles.length).toBe(1);
      expect(analysis.parsedFiles[0]?.symbols.length).toBe(hugeLineCount);

      await cleanup();
    });

    it('handles deleted files in working tree without crashing scope resolver', async () => {
      const { repoRoot, cleanup } = await createTempGitRepo({
        initialFiles: {
          'file-to-delete.ts': 'export const toDelete = 1;\n',
          'surviving.ts': 'export const survive = 2;\n',
        },
      });
      tempDirsToClean.push(repoRoot);

      // Delete file from disk
      await fs.unlink(path.join(repoRoot, 'file-to-delete.ts'));

      const scope = await resolveScope({ type: 'working-tree', repoRoot });
      expect(scope.files.map((f) => f.path)).toContain('file-to-delete.ts');
      expect(scope.diff).toContain('--- a/file-to-delete.ts');

      await cleanup();
    });
  });
});

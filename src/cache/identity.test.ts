/**
 * Tests for identity.ts - Project identity hashing and cache directory resolution.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  computeProjectIdentity,
  ensureCacheDirs,
  getCacheDir,
  initializeProjectCache,
  resolveCachePaths,
} from './identity.js';

describe('cache:identity', () => {
  let testDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `octate-cache-test-${randomUUID()}`);
    repoRoot = join(testDir, 'repo');
    await mkdir(repoRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('computeProjectIdentity', () => {
    it('produces consistent hash for same repo root and remote URL', async () => {
      const hash1 = await computeProjectIdentity(repoRoot);
      const hash2 = await computeProjectIdentity(repoRoot);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
      expect(hash1).toMatch(/^[a-f0-9]+$/);
    });

    it('produces different hashes for different repo roots', async () => {
      const otherRepo = join(testDir, 'other-repo');
      await mkdir(otherRepo, { recursive: true });

      const hash1 = await computeProjectIdentity(repoRoot);
      const hash2 = await computeProjectIdentity(otherRepo);

      expect(hash1).not.toBe(hash2);
    });

    it('handles repos without git remote', async () => {
      // No git init, so no remote
      const hash = await computeProjectIdentity(repoRoot);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('getCacheDir', () => {
    it('returns correct path format', () => {
      const identity = 'abc123def456';
      const cacheDir = getCacheDir(identity);

      expect(cacheDir).toContain('.local/share/octate');
      expect(cacheDir).toContain(identity);
    });

    it('uses home directory as base', () => {
      const identity = 'abc123def456';
      const cacheDir = getCacheDir(identity);

      expect(cacheDir).toContain('octate');
    });
  });

  describe('resolveCachePaths', () => {
    it('resolves all subdirectories', () => {
      const identity = 'abc123def456';
      const paths = resolveCachePaths(identity);

      expect(paths.root).toContain(identity);
      expect(paths.indexes).toBe(join(paths.root, 'indexes'));
      expect(paths.cache).toBe(join(paths.root, 'cache'));
      expect(paths.findings).toBe(join(paths.root, 'findings'));
      expect(paths.logs).toBe(join(paths.root, 'logs'));
    });
  });

  describe('ensureCacheDirs', () => {
    it('creates all cache directories', async () => {
      const identity = 'abc123def456';
      const paths = resolveCachePaths(identity);

      await ensureCacheDirs(paths);

      const { stat } = await import('node:fs/promises');
      await expect(stat(paths.root)).resolves.toBeDefined();
      await expect(stat(paths.indexes)).resolves.toBeDefined();
      await expect(stat(paths.cache)).resolves.toBeDefined();
      await expect(stat(paths.findings)).resolves.toBeDefined();
      await expect(stat(paths.logs)).resolves.toBeDefined();
    });
  });

  describe('initializeProjectCache', () => {
    it('computes identity and creates all directories', async () => {
      const paths = await initializeProjectCache(repoRoot);

      expect(paths.root).toBeDefined();
      expect(paths.indexes).toBeDefined();
      expect(paths.cache).toBeDefined();
      expect(paths.findings).toBeDefined();
      expect(paths.logs).toBeDefined();

      const { stat } = await import('node:fs/promises');
      await expect(stat(paths.root)).resolves.toBeDefined();
      await expect(stat(paths.indexes)).resolves.toBeDefined();
    });

    it('returns same paths for same repo root', async () => {
      const paths1 = await initializeProjectCache(repoRoot);
      const paths2 = await initializeProjectCache(repoRoot);

      expect(paths1.root).toBe(paths2.root);
      expect(paths1.indexes).toBe(paths2.indexes);
    });
  });
});

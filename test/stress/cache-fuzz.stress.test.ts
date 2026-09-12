/**
 * Phase 10 & 12: Cache, Concurrency, Lifecycle & Fuzzing Stress Tests.
 *
 * Validates:
 * - CacheStore atomic writes and graceful handling of corrupted JSON cache files.
 * - CacheStore LRU eviction keeping total disk storage bounded.
 * - PromisePool concurrency limits strictly enforced under heavy parallel load.
 * - Cross-platform cache key generation stability (POSIX vs Windows backslashes).
 * - Seed-reproducible property fuzzing for diffs, file paths, and candidate findings.
 * - Invariant: Ranking determinism, composite score monotonicity, and critical protection under fuzzing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { generateCacheKey } from '../../src/cache/keys.js';
import { createPromisePool } from '../../src/cache/pool.js';
import { CacheStore } from '../../src/cache/store.js';
import { ReferenceGraph } from '../../src/intelligence/graph/reference.js';
import { SymbolIndex } from '../../src/intelligence/index/symbol-index.js';
import { groundFinding } from '../../src/model/schema/grounding.js';
import type { ModelFinding } from '../../src/model/types.js';
import { postCriticConsolidate, preCriticDeduplicate } from '../../src/review/dedup.js';
import { rankAndTruncateFindings } from '../../src/review/ranking.js';
import type { FindingCategory, ReviewSeverity } from '../../src/review/types.js';
import { cleanupTempDir, createMulberry32, createTempDir } from './stress-helper.js';

describe('Phase 10: Cache, Concurrency, and Lifecycle Stress Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('octate-cache-stress-');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('CacheStore Atomic Writes & Corruption Handling', () => {
    it('returns null gracefully without throwing when cache file contains corrupted JSON', async () => {
      const store = new CacheStore({ rootDir: tempDir });
      await store.initialize();

      const key = 'test-corrupted-key';
      // Write a corrupted file directly into the cache location
      const subDir = path.join(tempDir, key.substring(0, 2), key.substring(2, 4));
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(
        path.join(subDir, `${key}.json`),
        '{ incomplete json corrupted: [}',
        'utf-8'
      );

      const result = await store.get(key);
      expect(result).toBeNull();
    });

    it('performs concurrent atomic writes safely without race conditions or file corruption', async () => {
      const store = new CacheStore({ rootDir: tempDir });
      await store.initialize();

      const writePromises = Array.from({ length: 50 }, (_, i) => {
        return store.set(`concurrent-key-${i}`, {
          index: i,
          payload: `data-chunk-${i}`.repeat(50),
        });
      });

      await Promise.all(writePromises);

      // Verify all 50 keys can be read cleanly
      for (let i = 0; i < 50; i++) {
        const entry = await store.get<{ index: number; payload: string }>(`concurrent-key-${i}`);
        expect(entry).not.toBeNull();
        expect(entry?.value.index).toBe(i);
      }
    });

    it('bounds total cache size with LRU eviction when exceeding maxSize', async () => {
      // 5KB max cache size
      const store = new CacheStore({ rootDir: tempDir, maxSize: 5000 });
      await store.initialize();

      // Write 20 entries of 1KB each (total 20KB > 5KB)
      for (let i = 0; i < 20; i++) {
        await store.set(`entry-${i}`, {
          content: 'x'.repeat(1024),
        });
      }

      // Check current size
      const currentSize = await store.getSize();
      expect(currentSize).toBeLessThanOrEqual(6000); // Bounded near maxSize
    });
  });

  describe('PromisePool Concurrency Invariants', () => {
    it('strictly limits active concurrent promises to pool size under heavy load', async () => {
      const pool = createPromisePool(3);
      let activeCount = 0;
      let maxObservedActive = 0;

      const tasks = Array.from({ length: 60 }, (_, i) => async () => {
        activeCount++;
        maxObservedActive = Math.max(maxObservedActive, activeCount);
        // Small async pause to simulate I/O
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeCount--;
        return i;
      });

      const results = await pool.runAll(tasks);

      expect(results).toHaveLength(60);
      expect(maxObservedActive).toBeLessThanOrEqual(3);
      expect(activeCount).toBe(0);
    });
  });

  describe('Cache Key Normalization & Stability', () => {
    it('produces identical cache keys across POSIX and Windows file separators', () => {
      const posixKey = generateCacheKey({
        contentHash: 'hash123',
        filePath: 'src/components/Button.tsx',
        parserVersion: 'v1',
        language: 'typescript',
        configHash: 'cfg456',
      });

      const windowsKey = generateCacheKey({
        contentHash: 'hash123',
        filePath: 'src\\components\\Button.tsx',
        parserVersion: 'v1',
        language: 'typescript',
        configHash: 'cfg456',
      });

      expect(posixKey).toBe(windowsKey);
      expect(posixKey).toBe('hash123:src/components/Button.tsx:v1:typescript:cfg456');
    });
  });
});

describe('Phase 12: Seeded Fuzzing & Invariant Testing', () => {
  const rand = createMulberry32(987654321);

  describe('Path Traversal & Grounding Fuzzing', () => {
    it('strictly rejects fuzzed malicious path traversal attempts', async () => {
      const traversalPrefixes = ['../', '..\\', '../../', '..\\..\\', '/etc/', '/var/log/', '..'];
      const suffixes = ['passwd', 'shadow', 'secret.env', 'config.json', 'test.ts', '.git/config'];

      for (let i = 0; i < 100; i++) {
        const prefix = traversalPrefixes[Math.floor(rand() * traversalPrefixes.length)]!;
        const suffix = suffixes[Math.floor(rand() * suffixes.length)]!;
        const candidate = `${prefix}${suffix}`;

        const finding: ModelFinding = {
          file: candidate,
          startLine: 1,
          endLine: 1,
          title: 'Traversal test',
          message: 'Test msg',
          severity: 'high',
          category: 'security',
          confidence: 0.9,
          evidence: [],
        };

        const grounded = await groundFinding(finding, { repoRoot: '/repo/root' });
        expect(grounded).toBeNull();
      }
    });
  });

  describe('Finding Deduplication & Ranking Property Invariants', () => {
    const severities: ReviewSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const categories: FindingCategory[] = [
      'correctness',
      'security',
      'performance',
      'architecture',
      'reliability',
      'maintainability',
      'compatibility',
      'testing',
    ];

    function generateRandomFinding(id: number): ModelFinding {
      const severity = severities[Math.floor(rand() * severities.length)]!;
      const category = categories[Math.floor(rand() * categories.length)]!;
      const startLine = Math.floor(rand() * 500) + 1;
      const endLine = startLine + Math.floor(rand() * 20);
      const confidence = Math.round(rand() * 100) / 100;

      return {
        file: `src/module_${id % 10}.ts`,
        startLine,
        endLine,
        title: `Fuzzed Finding ${id} in module`,
        message: `Randomized message payload ${id}`,
        severity,
        category,
        confidence,
        suggestedFix: `const fix_${id} = doSomethingSubstantialFix();`,
        evidence: [
          {
            file: `src/module_${id % 10}.ts`,
            startLine,
            endLine,
            relationship: 'caller',
            explanation: `Anchor ${id}`,
          },
        ],
      };
    }

    it('preserves sorting monotonicity and Critical findings under high-volume randomized input', () => {
      const symbolIndex = new SymbolIndex();
      const referenceGraph = new ReferenceGraph();

      // Generate 200 randomized findings
      const fuzzedFindings: ModelFinding[] = [];
      for (let i = 0; i < 200; i++) {
        fuzzedFindings.push(generateRandomFinding(i));
      }

      // 1. Pipeline through Pre-critic deduplication
      const preDeduped = preCriticDeduplicate(fuzzedFindings, symbolIndex);
      expect(preDeduped.length).toBeLessThanOrEqual(fuzzedFindings.length);

      // 2. Post-critic consolidation
      const consolidated = postCriticConsolidate(preDeduped, symbolIndex);
      expect(consolidated.length).toBeLessThanOrEqual(preDeduped.length);

      // 3. Composite ranking with maxFindings = 30
      const ranked = rankAndTruncateFindings({
        findings: consolidated,
        referenceGraph,
        symbolIndex,
        maxFindings: 30,
      });

      // INVARIANT 1: Monotonic descending composite score (except where Critical protection inserts lower-scored Criticals)
      // Verify non-critical findings are in strictly descending score order
      const nonCritical = ranked.filter((f) => f.severity !== 'critical');
      for (let i = 0; i < nonCritical.length - 1; i++) {
        const current = nonCritical[i]!;
        const next = nonCritical[i + 1]!;
        expect(current.compositeScore).toBeGreaterThanOrEqual(next.compositeScore);
      }

      // INVARIANT 2: Critical protection - EVERY critical finding in consolidated input must be retained
      const totalInputCriticals = consolidated.filter((f) => f.severity === 'critical').length;
      const totalOutputCriticals = ranked.filter((f) => f.severity === 'critical').length;
      expect(totalOutputCriticals).toBe(totalInputCriticals);

      // INVARIANT 3: Idempotency - ranking an already ranked list produces identical order
      const reranked = rankAndTruncateFindings({
        findings: ranked,
        referenceGraph,
        symbolIndex,
        maxFindings: 30,
      });

      expect(reranked.map((f) => f.id)).toEqual(ranked.map((f) => f.id));
    });
  });
});

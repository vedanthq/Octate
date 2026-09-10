import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { CacheStore } from '../../cache/store.js';
import { DependencyGraph } from './dependency.js';
import { ReferenceGraph } from './reference.js';
import { getGraphCacheKey, loadGraph, saveGraph } from './serializer.js';

describe('Graph Serializer', () => {
  let tempDir: string;
  let store: CacheStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'octate-graph-test-'));
    store = new CacheStore({ rootDir: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('computes deterministic cache keys', () => {
    const key1 = getGraphCacheKey('abc1234', 'conf-hash-1');
    const key2 = getGraphCacheKey('abc1234', 'conf-hash-1');
    const key3 = getGraphCacheKey('def5678', 'conf-hash-1');

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('saves and loads graph state accurately', async () => {
    const reference = new ReferenceGraph();
    reference.addNode({ id: 'sym-1', kind: 'symbol', name: 'myFunc', path: 'src/main.ts' });
    reference.addEdge({ from: 'sym-caller', to: 'sym-1', kind: 'calls' });
    reference.setFileLayer('src/main.ts', 'service');

    const dependency = new DependencyGraph();
    dependency.addModuleDependency('src/main.ts', 'src/utils.ts', false, false);
    dependency.addModuleDependency('src/main.ts', 'zod', true, false);

    const commitSha = 'commit-sha-123';
    const configHash = 'config-hash-456';

    await saveGraph(store, { reference, dependency }, commitSha, configHash);

    const loaded = await loadGraph(store, commitSha, configHash);
    expect(loaded).not.toBeNull();
    expect(loaded?.reference.getNode('sym-1')).toBeDefined();
    expect(loaded?.reference.getLayer('src/main.ts')).toBe('service');

    const deps = loaded?.dependency.getDependencies('src/main.ts');
    expect(deps?.internal).toContain('src/utils.ts');
    expect(deps?.external).toContain('zod');
  });

  it('returns null on commitSha mismatch (cache invalidation)', async () => {
    const reference = new ReferenceGraph();
    const dependency = new DependencyGraph();

    await saveGraph(store, { reference, dependency }, 'commit-sha-1', 'config-hash-1');

    const loaded = await loadGraph(store, 'commit-sha-2', 'config-hash-1');
    expect(loaded).toBeNull();
  });

  it('returns null on configHash mismatch (cache invalidation)', async () => {
    const reference = new ReferenceGraph();
    const dependency = new DependencyGraph();

    await saveGraph(store, { reference, dependency }, 'commit-sha-1', 'config-hash-1');

    const loaded = await loadGraph(store, 'commit-sha-1', 'config-hash-2');
    expect(loaded).toBeNull();
  });

  it('returns null when cache entry does not exist', async () => {
    const loaded = await loadGraph(store, 'non-existent', 'non-existent');
    expect(loaded).toBeNull();
  });
});

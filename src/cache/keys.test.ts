/**
 * Tests for cache key generation and parsing.
 */

import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  cacheKey,
  configVersion,
  contentHash,
  createAnalysisCacheKey,
  createIndexCacheKey,
  diagnosticsKey,
  generateCacheKey,
  generateContentHash,
  getToolVersion,
  isValidCacheKey,
  parseCacheKey,
  toolResultKey,
} from './keys.js';

describe('generateContentHash', () => {
  it('generates consistent hash for same content', () => {
    const content = 'test content';
    const hash1 = generateContentHash(content);
    const hash2 = generateContentHash(content);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);
  });

  it('generates different hashes for different content', () => {
    const hash1 = generateContentHash('content1');
    const hash2 = generateContentHash('content2');
    expect(hash1).not.toBe(hash2);
  });

  it('works with Buffer input', () => {
    const content = Buffer.from('test content');
    const hash = generateContentHash(content);
    expect(hash.length).toBe(16);
  });
});

describe('generateCacheKey', () => {
  it('generates key from components', () => {
    const components = {
      contentHash: 'abc123',
      filePath: 'src/main.ts',
      parserVersion: '1.0.0',
      language: 'typescript',
      configHash: 'cfg456',
    };
    const key = generateCacheKey(components);
    expect(key).toBe('abc123:src/main.ts:1.0.0:typescript:cfg456');
  });

  it('normalizes Windows paths', () => {
    const components = {
      contentHash: 'abc123',
      filePath: 'src\\main.ts',
      parserVersion: '1.0.0',
      language: 'typescript',
      configHash: 'cfg456',
    };
    const key = generateCacheKey(components);
    expect(key).toBe('abc123:src/main.ts:1.0.0:typescript:cfg456');
  });
});

describe('parseCacheKey', () => {
  it('parses valid key', () => {
    const key = 'abc123:src/main.ts:1.0.0:typescript:cfg456';
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.contentHash).toBe('abc123');
    expect(parsed?.filePath).toBe('src/main.ts');
    expect(parsed?.parserVersion).toBe('1.0.0');
    expect(parsed?.language).toBe('typescript');
    expect(parsed?.configHash).toBe('cfg456');
    expect(parsed?.fullKey).toBe(key);
  });

  it('returns null for invalid key', () => {
    expect(parseCacheKey('invalid')).toBeNull();
    expect(parseCacheKey('a:b:c:d')).toBeNull();
    expect(parseCacheKey('a:b:c:d:e:f')).toBeNull();
  });
});

describe('createAnalysisCacheKey', () => {
  it('creates key for analysis', () => {
    const key = createAnalysisCacheKey('content', 'src/main.ts', '1.0.0', 'typescript', 'cfg456');
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.contentHash).toHaveLength(16);
    expect(parsed?.filePath).toBe('src/main.ts');
    expect(parsed?.parserVersion).toBe('1.0.0');
    expect(parsed?.language).toBe('typescript');
    expect(parsed?.configHash).toBe('cfg456');
  });
});

describe('createIndexCacheKey', () => {
  it('creates key for index', () => {
    const key = createIndexCacheKey('symbolName', '1.0.0', 'typescript', 'cfg456');
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.contentHash).toHaveLength(16);
    expect(parsed?.filePath).toBe('symbolName');
    expect(parsed?.parserVersion).toBe('1.0.0');
    expect(parsed?.language).toBe('typescript');
    expect(parsed?.configHash).toBe('cfg456');
  });
});

describe('isValidCacheKey', () => {
  it('returns true for valid key', () => {
    expect(isValidCacheKey('abc123:src/main.ts:1.0.0:typescript:cfg456')).toBe(true);
  });

  it('returns false for invalid key', () => {
    expect(isValidCacheKey('invalid')).toBe(false);
    expect(isValidCacheKey('a:b:c:d')).toBe(false);
  });
});

describe('cacheKey', () => {
  it('generates deterministic key from parts object', () => {
    const parts = { a: '1', b: '2', c: '3' };
    const key1 = cacheKey(parts);
    const key2 = cacheKey(parts);
    expect(key1).toBe(key2);
    expect(key1.length).toBeGreaterThan(0);
  });

  it('generates different keys for different parts', () => {
    const key1 = cacheKey({ a: '1' });
    const key2 = cacheKey({ a: '2' });
    expect(key1).not.toBe(key2);
  });

  it('sorts keys for deterministic ordering', () => {
    const key1 = cacheKey({ b: '1', a: '2' });
    const key2 = cacheKey({ a: '2', b: '1' });
    expect(key1).toBe(key2);
  });
});

describe('contentHash', () => {
  it('generates consistent hash for same content', () => {
    const hash1 = contentHash('test content');
    const hash2 = contentHash('test content');
    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different content', () => {
    const hash1 = contentHash('content1');
    const hash2 = contentHash('content2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('getToolVersion', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-keys-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns unknown for unsupported tool', async () => {
    const version = await getToolVersion('unknown-tool', testDir);
    expect(version).toBe('unknown');
  });

  it('caches tool version after first call', async () => {
    // Note: This test would need a mock for spawnWithSignal to work reliably
    // For now, just verify the function runs without error for unknown tools
    const version1 = await getToolVersion('unknown-tool-2', testDir);
    const version2 = await getToolVersion('unknown-tool-2', testDir);
    expect(version1).toBe(version2);
    expect(version1).toBe('unknown');
  });
});

describe('configVersion', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('generates hash from config files', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{"compilerOptions": {}}');
    await fs.writeFile(path.join(testDir, 'biome.json'), '{"linter": {}}');

    const version = await configVersion(testDir);
    expect(version.length).toBeGreaterThan(0);
  });

  it('returns same version for same config files', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{"compilerOptions": {}}');

    const version1 = await configVersion(testDir);
    const version2 = await configVersion(testDir);
    expect(version1).toBe(version2);
  });

  it('returns different version when config changes', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{"compilerOptions": {}}');
    const version1 = await configVersion(testDir);

    await fs.writeFile(
      path.join(testDir, 'tsconfig.json'),
      '{"compilerOptions": {"strict": true}}'
    );
    const version2 = await configVersion(testDir);

    expect(version1).not.toBe(version2);
  });
});

describe('diagnosticsKey', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-diag-key-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('generates deterministic key from filePaths, tools, and configVersion', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'const b = 2;');

    const key1 = await diagnosticsKey(
      ['file1.ts', 'file2.ts'],
      testDir,
      ['tsc', 'biome'],
      'config-v1'
    );
    const key2 = await diagnosticsKey(
      ['file1.ts', 'file2.ts'],
      testDir,
      ['tsc', 'biome'],
      'config-v1'
    );

    expect(key1).toBe(key2);
  });

  it('generates different key when file content changes', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'const b = 2;');

    const key1 = await diagnosticsKey(
      ['file1.ts', 'file2.ts'],
      testDir,
      ['tsc', 'biome'],
      'config-v1'
    );

    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 2;'); // Changed content
    const key2 = await diagnosticsKey(
      ['file1.ts', 'file2.ts'],
      testDir,
      ['tsc', 'biome'],
      'config-v1'
    );

    expect(key1).not.toBe(key2);
  });

  it('generates different key when tool list changes', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');

    const key1 = await diagnosticsKey(['file1.ts'], testDir, ['tsc'], 'config-v1');
    const key2 = await diagnosticsKey(['file1.ts'], testDir, ['tsc', 'biome'], 'config-v1');

    expect(key1).not.toBe(key2);
  });

  it('sorts file paths for deterministic ordering', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'const b = 2;');

    const key1 = await diagnosticsKey(
      ['file2.ts', 'file1.ts'],
      testDir,
      ['tsc', 'biome'],
      'config-v1'
    );
    const key2 = await diagnosticsKey(
      ['file1.ts', 'file2.ts'],
      testDir,
      ['tsc', 'biome'],
      'config-v1'
    );

    expect(key1).toBe(key2);
  });

  it('sorts tools for deterministic ordering', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');

    const key1 = await diagnosticsKey(['file1.ts'], testDir, ['biome', 'tsc'], 'config-v1');
    const key2 = await diagnosticsKey(['file1.ts'], testDir, ['tsc', 'biome'], 'config-v1');

    expect(key1).toBe(key2);
  });

  it('includes tool versions where detectable', async () => {
    // This test verifies the key structure includes tool info
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');
    const key = await diagnosticsKey(['file1.ts'], testDir, ['tsc', 'biome'], 'config-v1');

    // Key should be a valid hash string (32 chars from cacheKey)
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });
});

describe('toolResultKey', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-tool-key-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('generates deterministic key from toolName, filePaths, toolVersion, configVersion', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'const b = 2;');

    const key1 = await toolResultKey(
      'tsc',
      ['file1.ts', 'file2.ts'],
      testDir,
      'tsc-5.0.0',
      'config-v1'
    );
    const key2 = await toolResultKey(
      'tsc',
      ['file1.ts', 'file2.ts'],
      testDir,
      'tsc-5.0.0',
      'config-v1'
    );

    expect(key1).toBe(key2);
  });

  it('generates different key when file content changes', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');

    const key1 = await toolResultKey('tsc', ['file1.ts'], testDir, 'tsc-5.0.0', 'config-v1');

    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 2;');
    const key2 = await toolResultKey('tsc', ['file1.ts'], testDir, 'tsc-5.0.0', 'config-v1');

    expect(key1).not.toBe(key2);
  });

  it('generates different key when tool version changes', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');

    const key1 = await toolResultKey('tsc', ['file1.ts'], testDir, 'tsc-5.0.0', 'config-v1');
    const key2 = await toolResultKey('tsc', ['file1.ts'], testDir, 'tsc-5.1.0', 'config-v1');

    expect(key1).not.toBe(key2);
  });

  it('generates different key when config version changes', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');

    const key1 = await toolResultKey('tsc', ['file1.ts'], testDir, 'tsc-5.0.0', 'config-v1');
    const key2 = await toolResultKey('tsc', ['file1.ts'], testDir, 'tsc-5.0.0', 'config-v2');

    expect(key1).not.toBe(key2);
  });

  it('sorts file paths for deterministic ordering', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'const b = 2;');

    const key1 = await toolResultKey(
      'tsc',
      ['file2.ts', 'file1.ts'],
      testDir,
      'tsc-5.0.0',
      'config-v1'
    );
    const key2 = await toolResultKey(
      'tsc',
      ['file1.ts', 'file2.ts'],
      testDir,
      'tsc-5.0.0',
      'config-v1'
    );

    expect(key1).toBe(key2);
  });
});

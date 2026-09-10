/**
 * Tests for diagnostic collection.
 */

import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { collectDiagnostics, normalizeDiagnostic } from './index.js';

describe('Diagnostic Collection', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-diag-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should return empty for empty file list', async () => {
    const result = await collectDiagnostics([], testDir, ['typescript']);
    expect(result.diagnostics).toEqual([]);
    expect(result.toolResults.size).toBe(0);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should return empty when no tools available', async () => {
    // Create a temp dir with no config files
    const emptyDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-empty-'));
    try {
      const result = await collectDiagnostics(['test.ts'], emptyDir, ['typescript']);
      expect(result.diagnostics).toEqual([]);
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      collectDiagnostics(['test.ts'], testDir, ['typescript'], controller.signal)
    ).rejects.toThrow('Diagnostics collection aborted');
  });
});

describe('normalizeDiagnostic', () => {
  it('should normalize tsc diagnostic', () => {
    const raw = {
      fileName: 'test.ts',
      start: { line: 10, character: 5 },
      end: { line: 10, character: 20 },
      category: 'error',
      messageText: "Type 'string' is not assignable to type 'number'",
      code: 2322,
    };
    const result = normalizeDiagnostic(raw, 'tsc');
    expect(result).not.toBeNull();
    expect(result?.file).toBe('test.ts');
    expect(result?.startLine).toBe(10);
    expect(result?.severity).toBe('critical');
    expect(result?.source).toBe('tsc');
  });

  it('should normalize biome diagnostic', () => {
    const raw = {
      filePath: 'test.ts',
      location: { start: { line: 5, column: 10 }, end: { line: 5, column: 25 } },
      severity: 'error',
      message: 'Unexpected console statement',
      rule: { id: 'no-console' },
    };
    const result = normalizeDiagnostic(raw, 'biome');
    expect(result).not.toBeNull();
    expect(result?.file).toBe('test.ts');
    expect(result?.severity).toBe('critical');
    expect(result?.source).toBe('biome');
  });

  it('should normalize ruff diagnostic', () => {
    const raw = {
      filename: 'test.py',
      location: { row: 3, column: 1 },
      endLocation: { row: 3, column: 15 },
      code: 'F841',
      message: 'Local variable assigned but never used',
    };
    const result = normalizeDiagnostic(raw, 'ruff');
    expect(result).not.toBeNull();
    expect(result?.file).toBe('test.py');
    expect(result?.severity).toBe('high');
    expect(result?.source).toBe('ruff');
  });

  it('should return null for non-actionable diagnostics', () => {
    const raw = {
      messageText: 'Found 5 errors',
      category: 'error',
    };
    const result = normalizeDiagnostic(raw, 'tsc');
    expect(result).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const raw = {
      messageText: 'Some error',
    };
    const result = normalizeDiagnostic(raw, 'tsc');
    expect(result).toBeNull();
  });
});

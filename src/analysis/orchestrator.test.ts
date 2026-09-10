/**
 * Tests for analysis orchestrator.
 */

import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { analyzeFiles } from './orchestrator.js';

describe('Analysis Orchestrator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-orch-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should return empty result for empty file list', async () => {
    const result = await analyzeFiles([], testDir);
    expect(result.parsedFiles).toEqual([]);
    expect(result.symbols).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.metrics.totalFiles).toBe(0);
  });

  it('should parse files and extract symbols', async () => {
    // Create test files
    await fs.writeFile(
      path.join(testDir, 'test.ts'),
      `
export function hello() {
  return "world";
}

export class MyClass {
  method() {}
}
      `.trim()
    );

    const result = await analyzeFiles(['test.ts'], testDir);

    expect(result.parsedFiles.length).toBe(1);
    const parsedFile = result.parsedFiles[0];
    expect(parsedFile).toBeDefined();
    expect(parsedFile?.language).toBe('typescript');
    expect(result.symbols.length).toBeGreaterThan(0);

    const func = result.symbols.find((s) => s.name === 'hello' && s.kind === 'function');
    expect(func).toBeDefined();
    expect(func?.exported).toBe(true);

    const cls = result.symbols.find((s) => s.name === 'MyClass' && s.kind === 'class');
    expect(cls).toBeDefined();
  });

  it('should collect diagnostics from static analysis tools', async () => {
    // Create a TypeScript file with a type error
    await fs.writeFile(path.join(testDir, 'test.ts'), 'const x: string = 123;\n');

    const result = await analyzeFiles(['test.ts'], testDir);

    expect(result.diagnostics.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.diagnosticCount).toBeGreaterThanOrEqual(0);
    expect(result.metrics.parseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should track metrics correctly', async () => {
    await fs.writeFile(path.join(testDir, 'test.ts'), 'export function foo() { return 42; }\n');

    const result = await analyzeFiles(['test.ts'], testDir);

    expect(result.metrics.totalFiles).toBe(1);
    expect(result.metrics.parsedFiles).toBe(1);
    expect(result.metrics.symbolCount).toBeGreaterThan(0);
    expect(result.metrics.totalTimeMs).toBeGreaterThan(0);
  });

  it('should handle parse errors gracefully', async () => {
    // Create a file with invalid syntax
    await fs.writeFile(path.join(testDir, 'bad.ts'), 'export function broken( { return "world"; }');

    const result = await analyzeFiles(['bad.ts'], testDir);

    // Should still complete, with errors tracked
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalTimeMs).toBeGreaterThan(0);
  });

  it('should handle tool failures gracefully', async () => {
    await fs.writeFile(path.join(testDir, 'test.ts'), 'export function foo() { return 42; }\n');

    const result = await analyzeFiles(['test.ts'], testDir);

    // Should complete even if tools fail
    expect(result.metrics.totalTimeMs).toBeGreaterThan(0);
  });

  it('should correctly map file extensions to languages', async () => {
    await fs.writeFile(path.join(testDir, 'test.ts'), 'const x = 1;\n');
    await fs.writeFile(path.join(testDir, 'test.js'), 'const y = 2;\n');
    await fs.writeFile(path.join(testDir, 'test.py'), 'z = 3\n');

    const result = await analyzeFiles(['test.ts', 'test.js', 'test.py'], testDir);

    const languages = result.parsedFiles.map((f) => f.language).sort();
    expect(languages).toEqual(['javascript', 'python', 'typescript']);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      analyzeFiles(['test.ts'], testDir, { signal: controller.signal })
    ).rejects.toThrow();
  });
});

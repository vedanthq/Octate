/**
 * Tests for tool detection and execution.
 */

import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { detectTools, runTool, runToolsParallel, type ToolConfig } from './tools.js';

describe('Tool Detection', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should enable tsc when tsconfig.json exists', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{}');
    const tools = await detectTools(testDir, ['typescript']);
    expect(tools.find((t) => t.name === 'tsc')?.enabled).toBe(true);
  });

  it('should enable biome when biome.json exists', async () => {
    await fs.writeFile(path.join(testDir, 'biome.json'), '{}');
    const tools = await detectTools(testDir, ['typescript']);
    expect(tools.find((t) => t.name === 'biome')?.enabled).toBe(true);
  });

  it('should enable ruff when ruff.toml exists', async () => {
    await fs.writeFile(path.join(testDir, 'ruff.toml'), '');
    const tools = await detectTools(testDir, ['python']);
    expect(tools.find((t) => t.name === 'ruff')?.enabled).toBe(true);
  });

  it('should filter tools by language', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(testDir, 'ruff.toml'), '');
    const tools = await detectTools(testDir, ['typescript']);
    expect(tools.find((t) => t.name === 'tsc')?.enabled).toBe(true);
    expect(tools.find((t) => t.name === 'ruff')).toBeUndefined();
  });

  it('should enable multiple tools for multi-language repos', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(testDir, 'ruff.toml'), '');
    const tools = await detectTools(testDir, ['typescript', 'python']);
    const enabledNames = tools.map((t) => t.name).sort();
    expect(enabledNames).toContain('tsc');
    expect(enabledNames).toContain('ruff');
  });
});

describe('Tool Execution', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-test-'));
    // Create a simple test file
    await fs.writeFile(path.join(testDir, 'test.ts'), 'const x: string = 123;\n');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should return empty array for tool not available', async () => {
    const tool: ToolConfig = {
      name: 'nonexistent-tool',
      command: 'this-tool-definitely-does-not-exist-12345',
      args: [],
      configFile: '',
      languages: ['typescript'],
      enabled: true,
    };

    const diagnostics = await runTool(tool, ['test.ts'], testDir);
    expect(diagnostics).toEqual([]);
  });

  it('should handle abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const tool: ToolConfig = {
      name: 'tsc',
      command: 'npx',
      args: ['tsc', '--noEmit'],
      configFile: 'tsconfig.json',
      languages: ['typescript'],
      enabled: true,
    };

    await expect(runTool(tool, ['test.ts'], testDir, controller.signal)).rejects.toThrow();
  });
});

describe('Parallel Tool Execution', () => {
  it('should run multiple tools in parallel', async () => {
    const testDir = await fs.mkdtemp(path.join(tmpdir(), 'octate-test-'));

    try {
      const tools: ToolConfig[] = [
        {
          name: 'tool1',
          command: 'echo',
          args: ['{}'],
          configFile: '',
          languages: ['typescript'],
          enabled: true,
        },
        {
          name: 'tool2',
          command: 'echo',
          args: ['{}'],
          configFile: '',
          languages: ['typescript'],
          enabled: true,
        },
      ];

      const results = await runToolsParallel(tools, [], testDir);
      expect(results.size).toBe(2);
      expect(results.has('tool1')).toBe(true);
      expect(results.has('tool2')).toBe(true);
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });
});

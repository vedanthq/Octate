/**
 * Tests for Tree-sitter parser.
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import type * as webTreeSitter from 'web-tree-sitter';
import { initParser, parseFile } from './index.js';

describe('Tree-sitter Parser', () => {
  beforeAll(async () => {
    await initParser();
  });

  it('should initialize WASM parser', async () => {
    const state = await initParser();
    expect(state.parser).toBeDefined();
    expect(state.languages).toBeDefined();
    expect(state.languages.size).toBeGreaterThanOrEqual(3);
  });

  it('should parse TypeScript file', async () => {
    const content = `
      export function hello() {
        return "world";
      }

      class MyClass {
        method() {}
      }
    `;
    const result = await parseFile('test.ts', content);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('typescript');
    expect(result?.tree).toBeDefined();
  });

  it('should parse JavaScript file', async () => {
    const content = `
      export function hello() {
        return "world";
      }

      class MyClass {
        method() {}
      }
    `;
    const result = await parseFile('test.js', content);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('javascript');
    expect(result?.tree).toBeDefined();
  });

  it('should parse Python file', async () => {
    const content = `
      def hello():
          return "world"

      class MyClass:
          def method(self):
              pass
    `;
    const result = await parseFile('test.py', content);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('python');
    expect(result?.tree).toBeDefined();
  });

  it('should handle invalid syntax gracefully', async () => {
    const content = `
      export function broken( {
        return "world";
      }
    `;
    const result = await parseFile('test.ts', content);
    expect(result).not.toBeNull();
    expect(result?.tree).toBeDefined();
    const tree = result?.tree as webTreeSitter.Tree | null;
    expect(tree?.rootNode?.hasError).toBe(true);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      parseFile('test.ts', 'const x = 1;', { signal: controller.signal })
    ).rejects.toThrow('Parsing aborted');
  });

  it('should detect language from file extension', async () => {
    const tsResult = await parseFile('test.ts', 'const x = 1;');
    expect(tsResult?.language).toBe('typescript');

    const jsResult = await parseFile('test.js', 'const x = 1;');
    expect(jsResult?.language).toBe('javascript');

    const pyResult = await parseFile('test.py', 'x = 1');
    expect(pyResult?.language).toBe('python');

    const unknownResult = await parseFile('test.unknown', 'x = 1');
    expect(unknownResult).toBeNull();
  });
});

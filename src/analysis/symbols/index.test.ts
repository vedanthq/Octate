/**
 * Tests for symbol extraction.
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import * as webTreeSitter from 'web-tree-sitter';
import type { ParsedFile } from '../types.js';
import { extractSymbols, symbolId } from './index.js';

const { Parser, Language } = webTreeSitter;

describe('Symbol Extraction', () => {
  let tsParser: webTreeSitter.Parser;
  let pyParser: webTreeSitter.Parser;
  let tsLanguage: webTreeSitter.Language;
  let pyLanguage: webTreeSitter.Language;

  beforeAll(async () => {
    await Parser.init();
    const wasmDir = '/home/ved/Desktop/project_i/Octate/test-wasm';

    tsLanguage = await Language.load(`${wasmDir}/tree-sitter-typescript.wasm`);
    tsParser = new Parser();
    tsParser.setLanguage(tsLanguage);

    pyLanguage = await Language.load(`${wasmDir}/tree-sitter-python.wasm`);
    pyParser = new Parser();
    pyParser.setLanguage(pyLanguage);
  });

  it('should produce consistent SHA256 hash for same inputs', () => {
    const id1 = symbolId('src/foo.ts', 'myFunc', 'function');
    const id2 = symbolId('src/foo.ts', 'myFunc', 'function');
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });

  it('should produce different hashes for different file paths', () => {
    const id1 = symbolId('src/foo.ts', 'myFunc', 'function');
    const id2 = symbolId('src/bar.ts', 'myFunc', 'function');
    expect(id1).not.toBe(id2);
  });

  it('should produce different hashes for different names', () => {
    const id1 = symbolId('src/foo.ts', 'funcA', 'function');
    const id2 = symbolId('src/foo.ts', 'funcB', 'function');
    expect(id1).not.toBe(id2);
  });

  it('should produce different hashes for different kinds', () => {
    const id1 = symbolId('src/foo.ts', 'MyClass', 'class');
    const id2 = symbolId('src/foo.ts', 'MyClass', 'interface');
    expect(id1).not.toBe(id2);
  });

  it('should extract symbols from TypeScript file', () => {
    const content = `
      export function hello() {
        return "world";
      }

      export class MyClass {
        method() {}
      }

      export interface MyInterface {
        foo: string;
      }

      export type MyType = string | number;

      const x = 42;
    `;
    const tree = tsParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.ts',
      language: 'typescript',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    expect(symbols.length).toBeGreaterThan(0);

    const func = symbols.find((s) => s.name === 'hello' && s.kind === 'function');
    expect(func).toBeDefined();
    expect(func?.exported).toBe(true);

    const cls = symbols.find((s) => s.name === 'MyClass' && s.kind === 'class');
    expect(cls).toBeDefined();
    expect(cls?.exported).toBe(true);

    const iface = symbols.find((s) => s.name === 'MyInterface' && s.kind === 'interface');
    expect(iface).toBeDefined();

    const type = symbols.find((s) => s.name === 'MyType' && s.kind === 'type');
    expect(type).toBeDefined();
  });

  it('should extract symbols from Python file', () => {
    const content = `
      def hello():
          return "world"

      class MyClass:
          def method(self):
              pass
    `;
    const tree = pyParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.py',
      language: 'python',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    expect(symbols.length).toBeGreaterThan(0);

    const func = symbols.find((s) => s.name === 'hello' && s.kind === 'function');
    expect(func).toBeDefined();

    const cls = symbols.find((s) => s.name === 'MyClass' && s.kind === 'class');
    expect(cls).toBeDefined();

    const method = symbols.find((s) => s.name === 'method' && s.kind === 'function');
    expect(method).toBeDefined();
  });

  it('should extract symbols from JavaScript file', () => {
    const content = `
      export function hello() {
        return "world";
      }

      export class MyClass {
        method() {}
      }
    `;
    const tree = tsParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.js',
      language: 'javascript',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    expect(symbols.length).toBeGreaterThan(0);

    const func = symbols.find((s) => s.name === 'hello' && s.kind === 'function');
    expect(func).toBeDefined();

    const cls = symbols.find((s) => s.name === 'MyClass' && s.kind === 'class');
    expect(cls).toBeDefined();
  });

  it('should track parentID for nested symbols', () => {
    const content = `
      export class MyClass {
        method() {}
      }
    `;
    const tree = tsParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.ts',
      language: 'typescript',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    const cls = symbols.find((s) => s.name === 'MyClass' && s.kind === 'class');
    const method = symbols.find((s) => s.name === 'method' && s.kind === 'function');

    expect(cls).toBeDefined();
    expect(method).toBeDefined();
    expect(method?.parentID).toBe(cls?.id);
  });

  it('should mark exported symbols correctly', () => {
    const content = `
      export function exportedFunc() {}
      function internalFunc() {}
    `;
    const tree = tsParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.ts',
      language: 'typescript',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    const exported = symbols.find((s) => s.name === 'exportedFunc');
    const internal = symbols.find((s) => s.name === 'internalFunc');

    expect(exported?.exported).toBe(true);
    expect(internal?.exported).toBe(false);
  });

  it('should deduplicate symbols with same name, kind, and file', () => {
    const content = `
      export function foo() {}
      function foo() {}
    `;
    const tree = tsParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.ts',
      language: 'typescript',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    const foos = symbols.filter((s) => s.name === 'foo');
    expect(foos.length).toBe(1);
  });

  it('should return empty array for empty file', () => {
    const content = '';
    const tree = tsParser.parse(content);
    const parsedFile: ParsedFile = {
      file: 'test.ts',
      language: 'typescript',
      tree,
      symbols: [],
      parseTimeMs: 0,
    };

    const symbols = extractSymbols(parsedFile);
    expect(symbols).toEqual([]);
  });
});

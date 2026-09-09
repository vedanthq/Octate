/**
 * Tests for language-specific Tree-sitter queries.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import * as webTreeSitter from 'web-tree-sitter';
import { javascriptQueries, pythonQueries, typescriptQueries } from './languages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Parser, Language, Query } = webTreeSitter;

describe('Language Queries', () => {
  let parser: webTreeSitter.Parser;
  let tsLanguage: webTreeSitter.Language;
  let pyLanguage: webTreeSitter.Language;

  beforeAll(async () => {
    await Parser.init();
    parser = new Parser();
    const wasmDir = path.resolve(__dirname, '../../../test-wasm');

    tsLanguage = await Language.load(path.join(wasmDir, 'tree-sitter-typescript.wasm'));
    parser.setLanguage(tsLanguage);

    pyLanguage = await Language.load(path.join(wasmDir, 'tree-sitter-python.wasm'));
  });

  it('should extract TypeScript function declarations', () => {
    const content = `
      export function hello() {
        return "world";
      }
    `;
    const tree = parser.parse(content);
    if (!tree) return;
    const query = new Query(tsLanguage, typescriptQueries.functions);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract TypeScript class declarations', () => {
    const content = `
      export class MyClass {
        method() {}
      }
    `;
    const tree = parser.parse(content);
    if (!tree) return;
    const query = new Query(tsLanguage, typescriptQueries.classes);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract TypeScript interface declarations', () => {
    const content = `
      export interface MyInterface {
        foo: string;
      }
    `;
    const tree = parser.parse(content);
    if (!tree) return;
    const query = new Query(tsLanguage, typescriptQueries.interfaces);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract TypeScript type aliases', () => {
    const content = `
      export type MyType = string | number;
    `;
    const tree = parser.parse(content);
    if (!tree) return;
    const query = new Query(tsLanguage, typescriptQueries.types);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract Python function definitions', () => {
    const content = `
      def hello():
          return "world"
    `;
    const pyParser = new Parser();
    pyParser.setLanguage(pyLanguage);
    const tree = pyParser.parse(content);
    if (!tree) return;
    const query = new Query(pyLanguage, pythonQueries.functions);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract Python class definitions', () => {
    const content = `
      class MyClass:
          def method(self):
              pass
    `;
    const pyParser = new Parser();
    pyParser.setLanguage(pyLanguage);
    const tree = pyParser.parse(content);
    if (!tree) return;
    const query = new Query(pyLanguage, pythonQueries.classes);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract JavaScript function declarations', () => {
    const content = `
      export function hello() {
        return "world";
      }
    `;
    const tree = parser.parse(content);
    if (!tree) return;
    const query = new Query(tsLanguage, javascriptQueries.functions);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });

  it('should extract JavaScript class declarations', () => {
    const content = `
      export class MyClass {
        method() {}
      }
    `;
    const tree = parser.parse(content);
    if (!tree) return;
    const query = new Query(tsLanguage, javascriptQueries.classes);
    const captures = query.captures(tree.rootNode);
    expect(captures.length).toBeGreaterThan(0);
  });
});

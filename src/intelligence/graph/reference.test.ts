import { describe, expect, it } from '@jest/globals';
import type { ParsedFile } from '../../analysis/types.js';
import { createSymbolIndex } from '../index/symbol-index.js';
import { PathResolver } from '../resolver/path-resolver.js';
import {
  createReferenceGraph,
  determineLayer,
  extractImportStatements,
  ReferenceGraph,
} from './reference.js';

describe('ReferenceGraph', () => {
  it('adds edges and computes reciprocal relationships', () => {
    const graph = new ReferenceGraph();
    graph.addEdge({
      from: 'sym-caller',
      to: 'sym-target',
      kind: 'calls',
    });

    const callees = graph.getCallees('sym-caller');
    expect(callees).toHaveLength(1);
    expect(callees[0]?.to).toBe('sym-target');

    const callers = graph.getCallers('sym-target');
    expect(callers).toHaveLength(1);
    expect(callers[0]?.to).toBe('sym-caller');
  });

  it('ranks callers by proximity: same dir > other dir > tests and caps at limit', () => {
    const graph = new ReferenceGraph();
    const targetSymbolId = 'sym-target';

    graph.addNode({
      id: targetSymbolId,
      kind: 'symbol',
      name: 'targetFn',
      path: 'src/services/user.ts',
    });

    // Add 12 callers across different locations
    // 2 in same dir
    graph.addNode({
      id: 'same-dir-1',
      kind: 'symbol',
      name: 'caller1',
      path: 'src/services/auth.ts',
    });
    graph.addNode({
      id: 'same-dir-2',
      kind: 'symbol',
      name: 'caller2',
      path: 'src/services/order.ts',
    });
    graph.addEdge({ from: 'same-dir-1', to: targetSymbolId, kind: 'calls' });
    graph.addEdge({ from: 'same-dir-2', to: targetSymbolId, kind: 'calls' });

    // 8 in other directories
    for (let i = 1; i <= 8; i++) {
      const id = `other-dir-${i}`;
      graph.addNode({ id, kind: 'symbol', name: `other${i}`, path: `src/controllers/ctrl${i}.ts` });
      graph.addEdge({ from: id, to: targetSymbolId, kind: 'calls' });
    }

    // 3 tests
    for (let i = 1; i <= 3; i++) {
      const id = `test-${i}`;
      graph.addNode({ id, kind: 'symbol', name: `test${i}`, path: `src/services/user.test.ts` });
      graph.addEdge({ from: id, to: targetSymbolId, kind: 'calls' });
    }

    const callersDefault = graph.getCallers(targetSymbolId, 10);
    expect(callersDefault).toHaveLength(10);

    // First two must be same-dir callers
    expect(callersDefault[0]?.to).toBe('same-dir-1');
    expect(callersDefault[1]?.to).toBe('same-dir-2');

    // Remaining slots filled by other-dir callers before tests
    const ids = callersDefault.map((c) => c.to);
    expect(ids).toContain('other-dir-1');
    expect(ids).not.toContain('test-1'); // Tests ranked lower than other-dir callers
  });

  it('correctly maps tests to production files via name and import signals', () => {
    const file1: ParsedFile = {
      file: 'src/user.ts',
      language: 'typescript',
      tree: null,
      symbols: [
        {
          id: 'sym-user',
          name: 'getUser',
          kind: 'function',
          language: 'typescript',
          file: 'src/user.ts',
          range: { startLine: 1, endLine: 3, startColumn: 0, endColumn: 1 },
          exported: true,
          references: [],
        },
      ],
      parseTimeMs: 1,
    };

    const fileTest: ParsedFile = {
      file: 'src/user.test.ts',
      language: 'typescript',
      tree: null,
      symbols: [],
      parseTimeMs: 1,
    };

    const fileContents = new Map<string, string>([
      ['src/user.ts', 'export function getUser() {}'],
      ['src/user.test.ts', "import { getUser } from './user';\ntest('gets user', () => {});"],
    ]);

    const symbolIndex = createSymbolIndex([file1, fileTest], fileContents);
    const pathResolver = new PathResolver({
      repoRoot: '/repo',
      knownFiles: new Set(['src/user.ts', 'src/user.test.ts']),
    });

    const graph = createReferenceGraph(
      [file1, fileTest],
      symbolIndex,
      pathResolver,
      undefined,
      fileContents
    );

    const tests = graph.getTestsForFile('src/user.ts');
    expect(tests).toContain('src/user.test.ts');
  });

  it('determines architectural layers correctly', () => {
    expect(determineLayer('src/routes/users.ts')).toBe('route');
    expect(determineLayer('src/controllers/auth.ts')).toBe('route');
    expect(determineLayer('src/services/billing.ts')).toBe('service');
    expect(determineLayer('src/models/user.ts')).toBe('repository');
    expect(determineLayer('src/repositories/account.ts')).toBe('repository');
    expect(determineLayer('src/config/index.ts')).toBe('config');
    expect(determineLayer('src/utils/format.ts')).toBe('util');
    expect(determineLayer('src/services/billing.test.ts')).toBe('test');

    // Custom override
    expect(determineLayer('src/handlers/event.ts', { 'handlers/': 'controller' })).toBe(
      'controller'
    );
  });

  it('extracts import statements from TypeScript and Python', () => {
    const tsCode = `
import { foo, bar as baz } from './utils';
import defaultUser from './user';
import * as lib from 'lib';
`;
    const tsImports = extractImportStatements('src/main.ts', tsCode);
    expect(tsImports).toHaveLength(3);
    expect(tsImports[0]?.specifier).toBe('./utils');
    expect(tsImports[0]?.importedSymbols).toEqual([{ name: 'foo' }, { name: 'bar', alias: 'baz' }]);
    expect(tsImports[1]?.isDefault).toBe(true);
    expect(tsImports[2]?.isNamespace).toBe(true);

    const pyCode = `
from .models import User, Profile as P
from ..utils import helper
import os, sys
`;
    const pyImports = extractImportStatements('app/views.py', pyCode);
    expect(pyImports).toHaveLength(4);
    expect(pyImports[0]?.specifier).toBe('.models');
    expect(pyImports[0]?.importedSymbols).toEqual([
      { name: 'User' },
      { name: 'Profile', alias: 'P' },
    ]);
    expect(pyImports[1]?.specifier).toBe('..utils');
  });
});

import { describe, expect, it } from '@jest/globals';
import type { Symbol as AnalysisSymbol, ParsedFile } from '../../analysis/types.js';
import type { Diagnostic } from '../../model/types.js';
import { ReferenceGraph } from '../graph/reference.js';
import { createSymbolIndex } from '../index/symbol-index.js';
import { CandidateCollector, scoreCandidate } from './candidates.js';

describe('CandidateCollector', () => {
  it('correctly scores candidate types matching priority hierarchy', () => {
    expect(scoreCandidate('changed-symbol')).toBe(100);
    expect(scoreCandidate('caller')).toBe(90);
    expect(scoreCandidate('callee')).toBe(90);
    expect(scoreCandidate('related-type')).toBe(80);
    expect(scoreCandidate('test')).toBe(80);
    expect(scoreCandidate('diagnostic')).toBe(75);
    expect(scoreCandidate('config')).toBe(60);
    expect(scoreCandidate('history')).toBe(40);
  });

  it('collects changed symbols, callers, callees, tests, and diagnostics', async () => {
    const sym1: AnalysisSymbol = {
      id: 'sym-fn-user',
      name: 'updateUser',
      kind: 'function',
      language: 'typescript',
      file: 'src/user.ts',
      range: { startLine: 5, endLine: 15, startColumn: 0, endColumn: 1 },
      exported: true,
      references: [],
    };

    const file1: ParsedFile = {
      file: 'src/user.ts',
      language: 'typescript',
      tree: null,
      symbols: [sym1],
      parseTimeMs: 1,
    };

    const filesContent = new Map<string, string>([
      [
        'src/user.ts',
        'line1\nline2\nline3\nline4\nexport function updateUser() {\n  return 1;\n}\n',
      ],
      [
        'src/caller.ts',
        'import { updateUser } from "./user";\nexport function run() {\n  updateUser();\n}\n',
      ],
      ['src/user.test.ts', 'test("updates user", () => {});\n'],
    ]);

    const symbolIndex = createSymbolIndex([file1], filesContent);
    const refGraph = new ReferenceGraph();

    // Register nodes
    refGraph.addNode({ id: 'src/user.ts', kind: 'file', name: 'user.ts', path: 'src/user.ts' });
    refGraph.addNode({
      id: 'src/caller.ts',
      kind: 'file',
      name: 'caller.ts',
      path: 'src/caller.ts',
    });
    refGraph.addNode({
      id: 'sym-fn-user',
      kind: 'symbol',
      name: 'updateUser',
      path: 'src/user.ts',
      symbol: sym1,
    });
    refGraph.addNode({ id: 'sym-caller-run', kind: 'symbol', name: 'run', path: 'src/caller.ts' });

    // Edge: caller calls updateUser
    refGraph.addEdge({
      from: 'sym-caller-run',
      to: 'sym-fn-user',
      kind: 'calls',
      metadata: { file: 'src/caller.ts', line: 2 },
    });

    // Edge: test tests user.ts
    refGraph.addEdge({
      from: 'src/user.test.ts',
      to: 'src/user.ts',
      kind: 'tests',
    });

    const diagnostics: Diagnostic[] = [
      {
        file: 'src/user.ts',
        startLine: 5,
        startColumn: 1,
        endLine: 5,
        endColumn: 10,
        message: 'Unused variable',
        severity: 'medium',
        source: 'tsc',
      },
    ];

    const collector = new CandidateCollector();
    const candidates = await collector.collect({
      changedFiles: ['src/user.ts'],
      symbolIndex,
      referenceGraph: refGraph,
      diagnostics,
      readFile: async (p) => filesContent.get(p) ?? '',
    });

    // Check candidate types collected
    const types = candidates.map((c) => c.type);
    expect(types).toContain('changed-symbol');
    expect(types).toContain('caller');
    expect(types).toContain('test');
    expect(types).toContain('diagnostic');

    // Verify scores
    const changedSym = candidates.find((c) => c.type === 'changed-symbol');
    expect(changedSym?.score).toBe(100);

    const callerCand = candidates.find((c) => c.type === 'caller');
    expect(callerCand?.score).toBe(90);

    const testCand = candidates.find((c) => c.type === 'test');
    expect(testCand?.score).toBe(80);

    const diagCand = candidates.find((c) => c.type === 'diagnostic');
    expect(diagCand?.score).toBe(75);
  });
});

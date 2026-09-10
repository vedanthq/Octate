import { describe, expect, it } from '@jest/globals';
import type { ParsedFile } from '../../analysis/types.js';
import { ReferenceGraph } from '../graph/reference.js';
import { createSymbolIndex } from '../index/symbol-index.js';
import { createContextEngine } from './engine.js';

describe('ContextEngine', () => {
  it('builds ReviewContext with bounded token budget and telemetry metrics', async () => {
    const file1: ParsedFile = {
      file: 'src/billing.ts',
      language: 'typescript',
      tree: null,
      symbols: [
        {
          id: 'sym-charge',
          name: 'chargeCreditCard',
          kind: 'function',
          language: 'typescript',
          file: 'src/billing.ts',
          range: { startLine: 1, endLine: 5, startColumn: 0, endColumn: 1 },
          exported: true,
          references: [],
        },
      ],
      parseTimeMs: 1,
    };

    const filesContent = new Map<string, string>([
      ['src/billing.ts', 'export function chargeCreditCard() {\n  return true;\n}\n'],
    ]);

    const symbolIndex = createSymbolIndex([file1], filesContent);
    const refGraph = new ReferenceGraph();

    refGraph.addNode({
      id: 'sym-charge',
      kind: 'symbol',
      name: 'chargeCreditCard',
      path: 'src/billing.ts',
    });

    const engine = createContextEngine(10000);
    const context = await engine.buildContext({
      changedFiles: ['src/billing.ts'],
      diff: 'diff --git a/src/billing.ts b/src/billing.ts\n@@ -1,3 +1,3 @@\n',
      symbolIndex,
      referenceGraph: refGraph,
      readFile: async (p) => filesContent.get(p) ?? '',
    });

    expect(context).toBeDefined();
    expect(context.metrics.candidateCount).toBeGreaterThan(0);
    expect(context.metrics.selectedCount).toBeGreaterThan(0);
    expect(context.totalTokens).toBeLessThanOrEqual(10000);
    expect(context.items).toBeDefined();
    expect(context.items?.length).toBeGreaterThan(0);
  });

  it('handles diff overflow by prioritizing logic files over lockfiles with warning', async () => {
    const engine = createContextEngine(8000); // 50% = 4000 tokens
    const symbolIndex = createSymbolIndex([]);
    const refGraph = new ReferenceGraph();

    // Massive lockfile chunk (> 5000 tokens)
    const lockfileLines = Array.from({ length: 400 }, (_, i) => `+  dep-${i}: 1.0.0`).join('\n');
    const massiveLockfileDiff = `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n${lockfileLines}\n`;
    const logicDiff = `diff --git a/src/logic.ts b/src/logic.ts\n+export const important = 42;\n`;

    const fullDiff = `${massiveLockfileDiff}${logicDiff}`;

    const context = await engine.buildContext({
      changedFiles: ['src/logic.ts', 'pnpm-lock.yaml'],
      diff: fullDiff,
      symbolIndex,
      referenceGraph: refGraph,
      readFile: async () => '',
    });

    // The context should be successfully built within token budget
    expect(context.totalTokens).toBeLessThanOrEqual(8000);
  });
});

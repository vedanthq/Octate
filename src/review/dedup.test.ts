/**
 * Unit tests for multi-factor finding deduplication engine.
 */

import { describe, expect, it } from '@jest/globals';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ModelEvidence } from '../model/types.js';
import { createTestFinding } from './__tests__/mocks.js';
import {
  type DeduplicatedFinding,
  mergeFindingCluster,
  normalizeTitle,
  postCriticConsolidate,
  preCriticDeduplicate,
} from './dedup.js';

describe('deduplication', () => {
  describe('normalizeTitle', () => {
    it('normalizes common defect phrases and removes special characters', () => {
      expect(normalizeTitle('Potential Null Pointer in handler()')).toBe(
        'potential null pointer in handler'
      );
      expect(normalizeTitle('SQL injection: unsanitized input')).toBe(
        'sql injection unsanitized input'
      );
      expect(normalizeTitle('Possible unhandled promise rejection!')).toBe(
        'possible unhandled error'
      );
      expect(normalizeTitle('Memory leak in cache')).toBe('resource leak in cache');
    });
  });

  describe('mergeFindingCluster', () => {
    it('escalates to highest severity and maximum confidence', () => {
      const f1 = createTestFinding({
        severity: 'high',
        confidence: 0.7,
        reviewer: 'structural',
        message: 'Short message',
      });
      const f2 = createTestFinding({
        severity: 'critical',
        confidence: 0.95,
        reviewer: 'security',
        message: 'A significantly longer and more detailed explanation of the critical defect',
      });

      const merged = mergeFindingCluster([f1, f2]);

      expect(merged.severity).toBe('critical');
      expect(merged.confidence).toBe(0.95);
      expect(merged.reviewer).toBe('security');
      expect(merged.message).toBe(f2.message);
    });

    it('aggregates contributing reviewers across the cluster', () => {
      const f1 = createTestFinding({ reviewer: 'structural' });
      const f2 = createTestFinding({ reviewer: 'semantic' });

      const merged = mergeFindingCluster([f1, f2]);

      expect(merged.contributingReviewers).toEqual(['structural', 'semantic']);
      expect(merged.metadata?.contributingReviewers).toEqual(['structural', 'semantic']);
    });

    it('merging 7 distinct evidence items produces exactly 5 evidence items', () => {
      const evidences: ModelEvidence[] = Array.from({ length: 7 }, (_, i) => ({
        file: 'src/handler.ts',
        startLine: 10 + i * 5,
        endLine: 12 + i * 5,
        relationship: 'caller',
        explanation: `Evidence item ${i + 1}`,
      }));

      const f1 = createTestFinding({ evidence: evidences.slice(0, 4) });
      const f2 = createTestFinding({ evidence: evidences.slice(4, 7) });

      const merged = mergeFindingCluster([f1, f2]);

      expect(merged.evidence).toHaveLength(5);
      expect(merged.evidence[0]?.startLine).toBe(10);
      expect(merged.evidence[4]?.startLine).toBe(30);
    });

    it('deduplicates identical evidence anchors across findings', () => {
      const duplicateEvidence: ModelEvidence = {
        file: 'src/handler.ts',
        startLine: 10,
        endLine: 15,
        relationship: 'caller',
        explanation: 'Shared caller line',
      };

      const f1 = createTestFinding({ evidence: [duplicateEvidence] });
      const f2 = createTestFinding({ evidence: [duplicateEvidence] });

      const merged = mergeFindingCluster([f1, f2]);

      expect(merged.evidence).toHaveLength(1);
    });

    it('unions relatedFiles and relatedSymbols', () => {
      const f1 = createTestFinding({
        relatedFiles: ['src/a.ts', 'src/b.ts'],
        relatedSymbols: ['symA'],
      });
      const f2 = createTestFinding({
        relatedFiles: ['src/b.ts', 'src/c.ts'],
        relatedSymbols: ['symB'],
      });

      const merged = mergeFindingCluster([f1, f2]);

      expect(merged.relatedFiles).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
      expect(merged.relatedSymbols).toEqual(['symA', 'symB']);
    });
  });

  describe('preCriticDeduplicate', () => {
    it('merges overlapping line ranges in the same file into one finding', () => {
      const f1 = createTestFinding({
        file: 'src/service.ts',
        startLine: 10,
        endLine: 20,
        severity: 'medium',
        confidence: 0.8,
        reviewer: 'structural',
      });
      const f2 = createTestFinding({
        file: 'src/service.ts',
        startLine: 15,
        endLine: 25,
        severity: 'high',
        confidence: 0.9,
        reviewer: 'semantic',
      });

      const result = preCriticDeduplicate([f1, f2]);

      expect(result).toHaveLength(1);
      const first: DeduplicatedFinding | undefined = result[0];
      expect(first).toBeDefined();
      expect(first?.file).toBe('src/service.ts');
      expect(first?.startLine).toBe(10);
      expect(first?.endLine).toBe(25);
      expect(first?.severity).toBe('high');
      expect(first?.confidence).toBe(0.9);
      expect(first?.contributingReviewers).toEqual(['structural', 'semantic']);
    });

    it('keeps disjoint line ranges in the same file as separate findings', () => {
      const f1 = createTestFinding({
        file: 'src/service.ts',
        startLine: 10,
        endLine: 15,
      });
      const f2 = createTestFinding({
        file: 'src/service.ts',
        startLine: 30,
        endLine: 45,
      });

      const result = preCriticDeduplicate([f1, f2]);

      expect(result).toHaveLength(2);
      expect(result[0]?.startLine).toBe(10);
      expect(result[1]?.startLine).toBe(30);
    });

    it('does not merge overlapping line ranges across different files', () => {
      const f1 = createTestFinding({
        file: 'src/foo.ts',
        startLine: 10,
        endLine: 20,
      });
      const f2 = createTestFinding({
        file: 'src/bar.ts',
        startLine: 10,
        endLine: 20,
      });

      const result = preCriticDeduplicate([f1, f2]);

      expect(result).toHaveLength(2);
    });

    it('returns empty array when input is empty', () => {
      expect(preCriticDeduplicate([])).toEqual([]);
    });

    it('handles single finding by wrapping contributingReviewers', () => {
      const f = createTestFinding({ reviewer: 'security' });
      const result = preCriticDeduplicate([f]);

      expect(result).toHaveLength(1);
      expect(result[0]?.contributingReviewers).toEqual(['security']);
    });
  });

  describe('postCriticConsolidate', () => {
    it('merges findings with same enclosing symbol and same category even with disjoint lines', () => {
      const mockSymbolIndex = {
        getFileSymbols: (file: string) => {
          if (file === 'src/handler.ts') {
            return [
              {
                id: 'sym_handleRequest',
                name: 'handleRequest',
                kind: 'function' as const,
                language: 'typescript',
                file: 'src/handler.ts',
                range: { startLine: 10, endLine: 50, startColumn: 0, endColumn: 1 },
                exported: true,
                references: [],
              },
            ];
          }
          return [];
        },
      } as unknown as SymbolIndex;

      const f1 = createTestFinding({
        file: 'src/handler.ts',
        category: 'correctness',
        startLine: 12,
        endLine: 15,
        title: 'Missing return type check',
        confidence: 0.8,
        reviewer: 'structural',
      });
      const f2 = createTestFinding({
        file: 'src/handler.ts',
        category: 'correctness',
        startLine: 35,
        endLine: 40,
        title: 'Unreachable code branch',
        confidence: 0.85,
        reviewer: 'semantic',
      });

      const result = postCriticConsolidate([f1, f2], mockSymbolIndex);

      expect(result).toHaveLength(1);
      expect(result[0]?.confidence).toBe(0.85);
      expect(result[0]?.contributingReviewers).toEqual(['structural', 'semantic']);
    });

    it('does not merge findings in same enclosing symbol if categories differ', () => {
      const mockSymbolIndex = {
        getFileSymbols: () => [
          {
            id: 'sym_func',
            name: 'myFunc',
            kind: 'function' as const,
            language: 'typescript',
            file: 'src/handler.ts',
            range: { startLine: 10, endLine: 50, startColumn: 0, endColumn: 1 },
            exported: true,
            references: [],
          },
        ],
      } as unknown as SymbolIndex;

      const f1 = createTestFinding({
        file: 'src/handler.ts',
        category: 'correctness',
        startLine: 12,
        endLine: 15,
        title: 'Title A',
      });
      const f2 = createTestFinding({
        file: 'src/handler.ts',
        category: 'security',
        startLine: 35,
        endLine: 40,
        title: 'Title B',
      });

      const result = postCriticConsolidate([f1, f2], mockSymbolIndex);

      expect(result).toHaveLength(2);
    });

    it('merges findings in the same file with matching normalized title signature', () => {
      const f1 = createTestFinding({
        file: 'src/db.ts',
        startLine: 10,
        endLine: 12,
        category: 'security',
        title: 'SQL Injection: unsanitized parameter in query',
      });
      const f2 = createTestFinding({
        file: 'src/db.ts',
        startLine: 80,
        endLine: 85,
        category: 'security',
        title: 'SQL injection unsanitized parameter in query',
      });

      const result = postCriticConsolidate([f1, f2]);

      expect(result).toHaveLength(1);
    });
  });
});

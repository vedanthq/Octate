/**
 * Unit tests for Two-Stage Critic Quality Gate.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ModelError, ValidationError } from '../errors/index.js';
import type { ReviewContext } from '../intelligence/types.js';
import type { ModelFinding, ModelRequest } from '../model/types.js';
import { createTestContext, createTestFinding, MockReviewModel } from './__tests__/mocks.js';
import { executeCriticStage, filterDeterministicHardFloor, isActionableFix } from './critic.js';

describe('critic', () => {
  let mockModel: MockReviewModel;
  let testContext: ReviewContext;

  beforeEach(() => {
    mockModel = new MockReviewModel();
    testContext = createTestContext();
  });

  describe('isActionableFix', () => {
    it('rejects empty or too short suggested fixes (< 15 chars)', () => {
      expect(isActionableFix('')).toBe(false);
      expect(isActionableFix('fix this')).toBe(false);
      expect(isActionableFix('TODO')).toBe(false);
      expect(isActionableFix('N/A')).toBe(false);
    });

    it('rejects generic placeholder prefixes', () => {
      expect(isActionableFix('TODO: fix this later please')).toBe(false);
      expect(isActionableFix('fix this - check again')).toBe(false);
      expect(isActionableFix('be careful with this')).toBe(false);
    });

    it('accepts concrete code remediation >= 15 characters', () => {
      expect(isActionableFix('if (!user) { return null; }')).toBe(true);
      expect(isActionableFix('db.query(sql, [userId]) to prevent SQL injection')).toBe(true);
    });
  });

  describe('filterDeterministicHardFloor', () => {
    it('drops findings with confidence below threshold (< 0.6)', async () => {
      const lowConf = createTestFinding({ confidence: 0.4 });
      const valid = createTestFinding({ confidence: 0.8 });

      const result = await filterDeterministicHardFloor({
        findings: [lowConf, valid],
        repoRoot: '/repo',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.confidence).toBe(0.8);
    });

    it('drops findings with empty evidence', async () => {
      const emptyEv = createTestFinding({ evidence: [] });
      const valid = createTestFinding();

      const result = await filterDeterministicHardFloor({
        findings: [emptyEv, valid],
        repoRoot: '/repo',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.evidence).toHaveLength(1);
    });

    it('drops findings with phantom line numbers beyond file length', async () => {
      const phantom = createTestFinding({
        file: 'src/handler.ts',
        startLine: 100,
        endLine: 105,
      });
      const valid = createTestFinding({
        file: 'src/handler.ts',
        startLine: 10,
        endLine: 15,
      });

      const result = await filterDeterministicHardFloor({
        findings: [phantom, valid],
        repoRoot: '/repo',
        getFileLineCount: (file: string) => {
          if (file === 'src/handler.ts') return Promise.resolve(50);
          return Promise.resolve(100);
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.startLine).toBe(10);
    });

    it('drops findings with trivial suggestedFix: "fix this"', async () => {
      const trivial = createTestFinding({ suggestedFix: 'fix this' });
      const valid = createTestFinding({
        suggestedFix: 'if (!user) { return null; }',
      });

      const result = await filterDeterministicHardFloor({
        findings: [trivial, valid],
        repoRoot: '/repo',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.suggestedFix).toBe('if (!user) { return null; }');
    });

    it('drops findings located in test or mock files', async () => {
      const mockFinding = createTestFinding({
        file: 'src/__tests__/service.test.ts',
      });
      const valid = createTestFinding({
        file: 'src/service.ts',
      });

      const result = await filterDeterministicHardFloor({
        findings: [mockFinding, valid],
        repoRoot: '/repo',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.file).toBe('src/service.ts');
    });
  });

  describe('executeCriticStage', () => {
    it('skips Critic LLM call when zero findings pass Stage 3A', async () => {
      const generateSpy = jest.spyOn(mockModel, 'generate');
      const lowConf = createTestFinding({ confidence: 0.3 });

      const result = await executeCriticStage({
        findings: [lowConf],
        repoRoot: '/repo',
        diff: 'diff --git a/src/handler.ts b/src/handler.ts',
        reviewContext: testContext,
        diagnostics: [],
        model: mockModel,
      });

      expect(result.criticInvoked).toBe(false);
      expect(result.findings).toHaveLength(0);
      expect(result.usage.totalTokens).toBe(0);
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it('successfully invokes Critic model when valid candidate findings exist', async () => {
      const finding = createTestFinding();
      const curatedFinding: ModelFinding = {
        ...finding,
        title: 'Curated null dereference',
        reviewer: 'critic',
      };

      mockModel.setHandler('critic', async (_req: ModelRequest) => ({
        findings: [curatedFinding],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        model: 'critic-model',
        latencyMs: 10,
        finishReason: 'stop',
      }));

      const result = await executeCriticStage({
        findings: [finding],
        repoRoot: '/repo',
        diff: 'diff --git a/src/handler.ts b/src/handler.ts',
        reviewContext: testContext,
        diagnostics: [],
        model: mockModel,
      });

      expect(result.criticInvoked).toBe(true);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.title).toBe('Curated null dereference');
      expect(result.usage.totalTokens).toBe(150);
      expect(mockModel.calls).toHaveLength(1);
    });

    it('retries once on invalid model response and succeeds', async () => {
      let callCount = 0;
      const validFinding = createTestFinding({ reviewer: 'critic' });

      mockModel.setHandler('critic', (_req: ModelRequest) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new ValidationError('Malformed JSON array from model'));
        }
        return Promise.resolve({
          findings: [validFinding],
          usage: {
            promptTokens: 80,
            completionTokens: 40,
            totalTokens: 120,
          },
          model: 'critic-model',
          latencyMs: 15,
          finishReason: 'stop',
        });
      });

      const result = await executeCriticStage({
        findings: [createTestFinding()],
        repoRoot: '/repo',
        diff: 'diff --git a/src/handler.ts b/src/handler.ts',
        reviewContext: testContext,
        diagnostics: [],
        model: mockModel,
      });

      expect(callCount).toBe(2);
      expect(result.criticInvoked).toBe(true);
      expect(result.findings).toHaveLength(1);
      expect(result.usage.totalTokens).toBe(120);
    });

    it('throws ModelError with exit code 4 when Critic call fails after retry', async () => {
      let callCount = 0;
      mockModel.setHandler('critic', (_req: ModelRequest) => {
        callCount++;
        return Promise.reject(new ValidationError(`Model failure on attempt ${callCount}`));
      });

      let caughtError: unknown;
      try {
        await executeCriticStage({
          findings: [createTestFinding()],
          repoRoot: '/repo',
          diff: 'diff --git a/src/handler.ts b/src/handler.ts',
          reviewContext: testContext,
          diagnostics: [],
          model: mockModel,
        });
      } catch (error) {
        caughtError = error;
      }

      expect(callCount).toBe(2);
      expect(caughtError).toBeInstanceOf(ModelError);
      const modelError = caughtError as ModelError;
      expect(modelError.exitCode).toBe(4);
      expect(modelError.message).toContain('Critic quality gate failed to validate findings');
    });

    it('propagates cancellation abort signal without converting to ModelError', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executeCriticStage({
          findings: [createTestFinding()],
          repoRoot: '/repo',
          diff: 'diff --git a/src/handler.ts b/src/handler.ts',
          reviewContext: testContext,
          diagnostics: [],
          model: mockModel,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });
  });
});

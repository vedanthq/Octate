/**
 * Tests for model/types.ts and model/abstraction.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  ModelRequest,
  ModelResponse,
  ModelUsage,
  ModelResponseFindingsSchema,
  ModelResponseSchema,
  ReviewModel,
  isReviewModel,
} from './index.js';
import { z } from 'zod';

describe('model:types', () => {
  describe('ModelUsage', () => {
    it('defines correct structure', () => {
      const usage: ModelUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };

      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });
  });

  describe('ModelRequest', () => {
    it('defines correct structure with all required fields', () => {
      const request: ModelRequest = {
        systemPolicy: 'You are a code reviewer',
        reviewTask: 'Review this PR for security issues',
        projectRules: ['No hardcoded secrets', 'Use type safety'],
        repoMetadata: { languages: ['typescript'], size: 10000 },
        diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;',
        context: [
          { source: 'file.ts', content: 'const x = 1;', relevance: 0.9 },
        ],
        diagnostics: [
          { file: 'file.ts', line: 1, message: 'Unused variable', severity: 'warning' },
        ],
        outputSchema: z.object({ findings: z.array(z.object({})) }),
      };

      expect(request.systemPolicy).toBe('You are a code reviewer');
      expect(request.reviewTask).toBe('Review this PR for security issues');
      expect(request.projectRules).toHaveLength(2);
      expect(request.repoMetadata.languages).toContain('typescript');
      expect(request.diff).toContain('const x = 2');
      expect(request.context).toHaveLength(1);
      expect(request.diagnostics).toHaveLength(1);
      expect(request.outputSchema).toBeInstanceOf(z.ZodObject);
    });
  });

  describe('ModelResponse', () => {
    it('defines correct structure with all required fields', () => {
      const response: ModelResponse = {
        findings: [
          {
            type: 'security',
            severity: 'high',
            file: 'src/auth.ts',
            line: 42,
            endLine: 45,
            message: 'Hardcoded API key detected',
            suggestion: 'Use environment variable',
            confidence: 0.95,
            evidence: ['src/auth.ts:42'],
          },
        ],
        usage: {
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700,
        },
        model: 'nvidia/nemotron-3-ultra',
        latencyMs: 1500,
        rawResponse: '{"findings":[...]}',
        finishReason: 'stop',
      };

      expect(response.findings).toHaveLength(1);
      expect(response.findings[0]?.severity).toBe('high');
      expect(response.usage.totalTokens).toBe(700);
      expect(response.model).toBe('nvidia/nemotron-3-ultra');
      expect(response.latencyMs).toBe(1500);
      expect(response.finishReason).toBe('stop');
    });

    it('allows optional fields', () => {
      const response: ModelResponse = {
        findings: [],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
        finishReason: 'stop',
      };

      expect(response.rawResponse).toBeUndefined();
      expect(response.findings).toHaveLength(0);
    });
  });

  describe('ModelResponseFindingsSchema', () => {
    it('validates correct finding', () => {
      const finding = {
        type: 'security',
        severity: 'high' as const,
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        confidence: 0.9,
      };

      const result = ModelResponseFindingsSchema.safeParse([finding]);
      expect(result.success).toBe(true);
    });

    it('rejects invalid severity', () => {
      const finding = {
        type: 'security',
        severity: 'invalid' as any,
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        confidence: 0.9,
      };

      const result = ModelResponseFindingsSchema.safeParse([finding]);
      expect(result.success).toBe(false);
    });

    it('rejects confidence out of range', () => {
      const finding = {
        type: 'security',
        severity: 'high' as const,
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        confidence: 1.5,
      };

      const result = ModelResponseFindingsSchema.safeParse([finding]);
      expect(result.success).toBe(false);
    });
  });

  describe('ModelResponseSchema', () => {
    it('validates complete response', () => {
      const response = {
        findings: [
          {
            type: 'security',
            severity: 'high' as const,
            file: 'src/test.ts',
            line: 10,
            message: 'Test finding',
            confidence: 0.9,
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        model: 'test-model',
        latencyMs: 100,
        finishReason: 'stop' as const,
      };

      const result = ModelResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('rejects invalid finishReason', () => {
      const response = {
        findings: [],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
        finishReason: 'invalid' as any,
      };

      const result = ModelResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});

describe('model:abstraction', () => {
  describe('ReviewModel interface', () => {
    it('defines required methods and properties', () => {
      // Just verify the interface structure exists
      const model: ReviewModel = {
        modelId: 'test-model',
        maxContextTokens: 8192,
        async generate() {
          return {
            findings: [],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: 'test-model',
            latencyMs: 0,
            finishReason: 'stop',
          };
        },
      };

      expect(model.modelId).toBe('test-model');
      expect(model.maxContextTokens).toBe(8192);
      expect(typeof model.generate).toBe('function');
    });
  });

  describe('isReviewModel', () => {
    it('returns true for valid ReviewModel', () => {
      const model = {
        modelId: 'test',
        maxContextTokens: 8192,
        generate: async () => ({
          findings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model: 'test',
          latencyMs: 0,
          finishReason: 'stop' as const,
        }),
      };

      expect(isReviewModel(model)).toBe(true);
    });

    it('returns false for missing generate', () => {
      const model = {
        modelId: 'test',
        maxContextTokens: 8192,
      };

      expect(isReviewModel(model)).toBe(false);
    });

    it('returns false for non-function generate', () => {
      const model = {
        modelId: 'test',
        maxContextTokens: 8192,
        generate: 'not a function',
      };

      expect(isReviewModel(model)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isReviewModel(null)).toBe(false);
    });

    it('returns false for primitive', () => {
      expect(isReviewModel('string')).toBe(false);
    });
  });
});
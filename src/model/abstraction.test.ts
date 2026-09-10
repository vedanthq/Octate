/**
 * Tests for model types and abstraction.
 */

import { describe, expect, it } from '@jest/globals';
import {
  createModelProvider,
  defaultReviewModel,
  isReviewModel,
  LocalNvidiaProvider,
} from './abstraction.js';
import type { ModelFinding, ModelRequest, ModelResponse, ProviderType } from './types.js';

describe('ReviewModel interface', () => {
  it('throws when generate is called on base interface', async () => {
    const mockRequest: ModelRequest = {
      systemPolicy: 'test',
      reviewTask: 'test',
      projectRules: [],
      repoMetadata: {
        root: '/test',
        languages: { typescript: 100 },
        fileCount: 1,
        totalLines: 100,
      },
      diff: '',
      context: [],
      diagnostics: [],
      outputSchema: '{}',
    };

    await expect(defaultReviewModel.generate(mockRequest)).rejects.toThrow(
      'must be implemented by provider'
    );
  });
});

describe('isReviewModel', () => {
  it('returns true for valid implementation', () => {
    const validImpl = {
      generate(_request: ModelRequest): Promise<ModelResponse> {
        return Promise.resolve({
          findings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model: 'test',
          latencyMs: 0,
          finishReason: 'stop' as const,
        });
      },
    };

    expect(isReviewModel(validImpl)).toBe(true);
  });

  it('returns true for LocalNvidiaProvider instance', () => {
    const provider = new LocalNvidiaProvider();
    expect(isReviewModel(provider)).toBe(true);
  });

  it('returns false for invalid implementation', () => {
    expect(isReviewModel(null)).toBe(false);
    expect(isReviewModel({})).toBe(false);
    expect(isReviewModel({ generate: 'not a function' })).toBe(false);
  });
});

describe('createModelProvider', () => {
  it('creates LocalNvidiaProvider for nvidia type', () => {
    const provider = createModelProvider('nvidia', {
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
    });
    expect(provider).toBeInstanceOf(LocalNvidiaProvider);
    expect(isReviewModel(provider)).toBe(true);
  });

  it('creates LocalNvidiaProvider for local-nvidia type', () => {
    const provider = createModelProvider('local-nvidia', {
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
    });
    expect(provider).toBeInstanceOf(LocalNvidiaProvider);
    expect(isReviewModel(provider)).toBe(true);
  });

  it('throws for hosted (deferred)', () => {
    expect(() => {
      createModelProvider('hosted', { model: 'test' });
    }).toThrow('Hosted provider is deferred to future milestone');
  });

  it('throws for unknown provider type', () => {
    expect(() => {
      createModelProvider('unknown' as ProviderType, { model: 'test' });
    }).toThrow('Unknown provider type: unknown');
  });
});

describe('ModelRequest type', () => {
  it('has all required trusted fields', () => {
    const request: ModelRequest = {
      systemPolicy: 'You are a code reviewer',
      reviewTask: 'Review this diff',
      projectRules: ['Rule 1', 'Rule 2'],
      repoMetadata: {
        root: '/repo',
        languages: { typescript: 1000 },
        fileCount: 50,
        totalLines: 5000,
      },
      diff: 'diff content',
      context: [],
      diagnostics: [],
      outputSchema: 'schema',
    };

    expect(request.systemPolicy).toBeDefined();
    expect(request.reviewTask).toBeDefined();
    expect(request.projectRules).toBeDefined();
    expect(request.repoMetadata).toBeDefined();
    expect(request.diff).toBeDefined();
    expect(request.context).toBeDefined();
    expect(request.diagnostics).toBeDefined();
    expect(request.outputSchema).toBeDefined();
  });
});

describe('ModelResponse type', () => {
  it('has all required fields', () => {
    const response: ModelResponse = {
      findings: [],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      latencyMs: 1500,
      finishReason: 'stop',
    };

    expect(response.findings).toBeDefined();
    expect(response.usage).toBeDefined();
    expect(response.model).toBeDefined();
    expect(response.latencyMs).toBeDefined();
    expect(response.finishReason).toBeDefined();
  });
});

describe('ModelFinding type', () => {
  it('has all required fields', () => {
    const finding: ModelFinding = {
      severity: 'high',
      category: 'security',
      title: 'Test finding',
      message: 'Description',
      file: 'src/test.ts',
      startLine: 10,
      endLine: 20,
      confidence: 0.95,
      evidence: [],
      relatedFiles: [],
      relatedSymbols: [],
      impact: 'High impact',
      suggestedFix: 'Fix it',
      reviewer: 'security',
    };

    expect(finding.severity).toBe('high');
    expect(finding.category).toBe('security');
    expect(finding.confidence).toBeGreaterThanOrEqual(0);
    expect(finding.confidence).toBeLessThanOrEqual(1);
  });
});

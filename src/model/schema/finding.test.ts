import { describe, expect, it } from '@jest/globals';
import { ModelFindingSchema, ModelResponseSchema, validateModelResponse } from './finding.js';

describe('ModelFindingSchema', () => {
  const validFinding = {
    severity: 'high',
    category: 'security',
    title: 'SQL Injection in user query',
    message: 'User input concatenated directly into SQL statement',
    file: 'src/db/users.ts',
    startLine: 10,
    endLine: 15,
    confidence: 0.95,
    evidence: [
      {
        file: 'src/db/users.ts',
        startLine: 12,
        endLine: 12,
        relationship: 'taint-sink',
        explanation: 'Direct query interpolation',
      },
    ],
    relatedFiles: ['src/api/handler.ts'],
    relatedSymbols: ['queryUsers'],
    impact: 'Remote code execution or arbitrary data exfiltration',
    suggestedFix: 'Use parameterized queries instead',
    reviewer: 'security',
  };

  it('accepts valid finding with all fields', () => {
    const result = ModelFindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(validFinding.title);
      expect(result.data.severity).toBe('high');
      expect(result.data.category).toBe('security');
    }
  });

  it('accepts all 5 valid severities', () => {
    const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
    for (const severity of severities) {
      const res = ModelFindingSchema.safeParse({ ...validFinding, severity });
      expect(res.success).toBe(true);
    }
  });

  it('rejects invalid severity', () => {
    const res = ModelFindingSchema.safeParse({
      ...validFinding,
      severity: 'ultra-critical',
    });
    expect(res.success).toBe(false);
  });

  it('accepts all 8 valid categories', () => {
    const categories = [
      'correctness',
      'security',
      'performance',
      'architecture',
      'reliability',
      'maintainability',
      'compatibility',
      'testing',
    ] as const;
    for (const category of categories) {
      const res = ModelFindingSchema.safeParse({ ...validFinding, category });
      expect(res.success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    const res = ModelFindingSchema.safeParse({
      ...validFinding,
      category: 'style',
    });
    expect(res.success).toBe(false);
  });

  it('strips unrecognized extra fields', () => {
    const withExtra = {
      ...validFinding,
      maliciousField: 'ignore_me',
    };
    const res = ModelFindingSchema.safeParse(withExtra);
    expect(res.success).toBe(true);
    if (res.success) {
      expect((res.data as Record<string, unknown>).maliciousField).toBeUndefined();
    }
  });

  it('rejects non-positive line numbers', () => {
    const res = ModelFindingSchema.safeParse({
      ...validFinding,
      startLine: 0,
    });
    expect(res.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const res1 = ModelFindingSchema.safeParse({
      ...validFinding,
      confidence: 1.5,
    });
    expect(res1.success).toBe(false);

    const res2 = ModelFindingSchema.safeParse({
      ...validFinding,
      confidence: -0.1,
    });
    expect(res2.success).toBe(false);
  });
});

describe('ModelResponseSchema', () => {
  it('validates complete model response structure', () => {
    const sample = {
      findings: [],
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      latencyMs: 1200,
      finishReason: 'stop',
    };
    const res = ModelResponseSchema.safeParse(sample);
    expect(res.success).toBe(true);
  });
});

describe('validateModelResponse', () => {
  it('validates object with findings array', () => {
    const res = validateModelResponse({
      findings: [
        {
          severity: 'info',
          category: 'maintainability',
          title: 'Add doc comment',
          message: 'Function lacks TSDoc',
          file: 'src/index.ts',
          startLine: 1,
          endLine: 2,
        },
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.findings.length).toBe(1);
      expect(res.data.findings[0]?.title).toBe('Add doc comment');
      expect(res.data.findings[0]?.confidence).toBe(1);
    }
  });

  it('accepts raw array and wraps it into findings', () => {
    const res = validateModelResponse([
      {
        severity: 'low',
        category: 'performance',
        title: 'Cache result',
        message: 'Repeated computation in loop',
        file: 'src/calc.ts',
        startLine: 5,
        endLine: 6,
      },
    ]);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.findings.length).toBe(1);
      expect(res.data.findings[0]?.title).toBe('Cache result');
    }
  });

  it('returns failure with ZodError when schema fails', () => {
    const res = validateModelResponse({
      findings: [
        {
          title: 'Missing severity and file',
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.length).toBeGreaterThan(0);
    }
  });
});

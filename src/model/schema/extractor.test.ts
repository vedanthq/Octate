import { describe, expect, it } from '@jest/globals';
import { extractJsonFromText, safeJsonParse } from './extractor.js';

describe('extractJsonFromText', () => {
  it('extracts JSON from standard code fences', () => {
    const raw = '```json\n{"foo": 1}\n```';
    expect(extractJsonFromText(raw)).toBe('{"foo": 1}');
  });

  it('extracts JSON from generic code fences', () => {
    const raw = '```\n{"foo": 1}\n```';
    expect(extractJsonFromText(raw)).toBe('{"foo": 1}');
  });

  it('extracts JSON surrounded by conversational preamble and postscript', () => {
    const raw = 'Here is the review analysis you requested:\n{"findings": []}\nHope this helps!';
    expect(extractJsonFromText(raw)).toBe('{"findings": []}');
  });

  it('strips trailing commas from arrays and objects', () => {
    const raw = '{"a": [1, 2,], "b": {"c": 3,},}';
    expect(extractJsonFromText(raw)).toBe('{"a": [1, 2], "b": {"c": 3}}');
  });

  it('handles empty and whitespace input', () => {
    expect(extractJsonFromText('')).toBe('');
    expect(extractJsonFromText('   \n\t  ')).toBe('');
  });

  it('extracts root JSON arrays', () => {
    const raw = 'Findings:\n[{"id": 1}, {"id": 2},]\nDone.';
    expect(extractJsonFromText(raw)).toBe('[{"id": 1}, {"id": 2}]');
  });
});

describe('safeJsonParse', () => {
  it('parses fenced JSON successfully', () => {
    const raw = '```json\n{"findings": []}\n```';
    const result = safeJsonParse<{ findings: unknown[] }>(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ findings: [] });
    }
  });

  it('parses JSON with trailing commas', () => {
    const raw = 'Here is findings: {"items": ["alpha", "beta",],}';
    const result = safeJsonParse<{ items: string[] }>(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ items: ['alpha', 'beta'] });
    }
  });

  it('returns failure on invalid JSON', () => {
    const raw = '```json\n{ not valid json : 123 }\n```';
    const result = safeJsonParse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('returns failure when no JSON is present', () => {
    const raw = 'There is no JSON in this response.';
    const result = safeJsonParse(raw);
    expect(result.success).toBe(false);
  });
});

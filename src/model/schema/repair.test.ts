import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { formatZodIssuesForRepairPrompt } from './repair.js';

describe('formatZodIssuesForRepairPrompt', () => {
  it('formats single issue with field path', () => {
    const schema = z.object({
      title: z.string({ message: 'Title is required' }),
    });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const prompt = formatZodIssuesForRepairPrompt(parsed.error);
      expect(prompt).toContain(
        'Your previous JSON response did not match the required schema. Please fix these issues and return valid JSON:'
      );
      expect(prompt).toContain("- Field 'title':");
    }
  });

  it('formats nested issue paths', () => {
    const schema = z.object({
      findings: z.array(
        z.object({
          severity: z.enum(['high', 'low']),
        })
      ),
    });
    const parsed = schema.safeParse({
      findings: [{ severity: 'invalid' }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const prompt = formatZodIssuesForRepairPrompt(parsed.error);
      expect(prompt).toContain("- Field 'findings.0.severity':");
    }
  });

  it('handles root-level issues', () => {
    const schema = z.string();
    const parsed = schema.safeParse(123);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const prompt = formatZodIssuesForRepairPrompt(parsed.error);
      expect(prompt).toContain("- Field 'root':");
    }
  });
});

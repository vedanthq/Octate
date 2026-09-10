import { z } from 'zod';
import type { ModelFinding } from '../types.js';

/**
 * Zod schema for individual evidence items tied to a finding.
 */
export const ModelEvidenceSchema = z
  .object({
    file: z.string().min(1, 'Evidence file path cannot be empty'),
    startLine: z.number().int().min(1, 'startLine must be >= 1'),
    endLine: z.number().int().min(1, 'endLine must be >= 1'),
    relationship: z.string().default(''),
    explanation: z.string().default(''),
  })
  .strip();

/**
 * Zod schema for a model finding.
 * Enforces all 5 severities, 8 categories, and strips unknown fields.
 */
export const ModelFindingSchema = z
  .object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    category: z.enum([
      'correctness',
      'security',
      'performance',
      'architecture',
      'reliability',
      'maintainability',
      'compatibility',
      'testing',
    ]),
    title: z.string().min(1, 'Title is required'),
    message: z.string().min(1, 'Message is required'),
    file: z.string().min(1, 'File path is required'),
    startLine: z.number().int().min(1, 'startLine must be >= 1'),
    endLine: z.number().int().min(1, 'endLine must be >= 1'),
    confidence: z.number().min(0).max(1).default(1),
    evidence: z.array(ModelEvidenceSchema).default([]),
    relatedFiles: z.array(z.string()).default([]),
    relatedSymbols: z.array(z.string()).default([]),
    impact: z.string().default(''),
    suggestedFix: z.string().default(''),
    reviewer: z.string().default('unknown'),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strip();

/**
 * Schema for token usage telemetry.
 */
export const ModelUsageSchema = z
  .object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strip();

/**
 * Schema for findings payload returned by the model prompt.
 */
export const FindingsPayloadSchema = z
  .object({
    findings: z.array(ModelFindingSchema),
  })
  .strip();

/**
 * Schema for the complete model response object.
 */
export const ModelResponseSchema = z
  .object({
    findings: z.array(ModelFindingSchema),
    usage: ModelUsageSchema,
    model: z.string().min(1),
    latencyMs: z.number().nonnegative(),
    rawResponse: z.string().optional(),
    finishReason: z.enum(['stop', 'length', 'content_filter', 'error']),
  })
  .strip();

export type FindingsPayload = z.infer<typeof FindingsPayloadSchema>;

/**
 * Compiled validator for AOT-optimized payload validation.
 */
const compiledFindingsValidator = z.compile(FindingsPayloadSchema);

/**
 * Validates raw model output or parsed JSON against FindingsPayloadSchema.
 * Automatically wraps array root responses into `{ findings: [...] }`.
 *
 * @param data - Raw parsed data
 * @returns Result object containing validated findings payload or ZodError
 */
export function validateModelResponse(
  data: unknown
): { success: true; data: { findings: ModelFinding[] } } | { success: false; error: z.ZodError } {
  let target = data;
  if (Array.isArray(target)) {
    target = { findings: target };
  }

  const result = compiledFindingsValidator.safeParse(target);
  if (result.success) {
    return {
      success: true,
      data: result.data as { findings: ModelFinding[] },
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

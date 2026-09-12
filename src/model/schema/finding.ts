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
 * Canonical JSON schema description passed to LLMs in prompt templates.
 * Conforms to standard JSON Schema format.
 */
export const FINDINGS_OUTPUT_SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low', 'info'],
              description: 'Defect severity level',
            },
            category: {
              type: 'string',
              enum: [
                'correctness',
                'security',
                'performance',
                'architecture',
                'reliability',
                'maintainability',
                'compatibility',
                'testing',
              ],
              description: 'Category of the defect',
            },
            title: {
              type: 'string',
              description: 'Concise summary of the defect (under 80 characters)',
            },
            message: {
              type: 'string',
              description: 'Detailed explanation of why this is an issue and how to resolve it',
            },
            file: {
              type: 'string',
              description: 'Repository-relative path of the affected file',
            },
            startLine: {
              type: 'integer',
              minimum: 1,
              description: 'Starting line number of the defect (1-indexed)',
            },
            endLine: {
              type: 'integer',
              minimum: 1,
              description: 'Ending line number of the defect (1-indexed)',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence score from 0.0 to 1.0',
            },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  file: { type: 'string' },
                  startLine: { type: 'integer', minimum: 1 },
                  endLine: { type: 'integer', minimum: 1 },
                  relationship: { type: 'string' },
                  explanation: { type: 'string' },
                },
                required: ['file', 'startLine', 'endLine'],
              },
              description: 'Inspectable evidence anchors verifying this finding',
            },
            relatedFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths to related files',
            },
            relatedSymbols: {
              type: 'array',
              items: { type: 'string' },
              description: 'Names of relevant symbols or functions',
            },
            impact: {
              type: 'string',
              description: 'Concrete real-world operational or security impact',
            },
            suggestedFix: {
              type: 'string',
              description: 'Concrete replacement code or actionable remediation steps',
            },
            reviewer: {
              type: 'string',
              enum: ['structural', 'semantic', 'security'],
              description: 'Reviewer role that originated this finding',
            },
          },
          required: [
            'severity',
            'category',
            'title',
            'message',
            'file',
            'startLine',
            'endLine',
          ],
        },
      },
    },
    required: ['findings'],
  },
  null,
  2
);

/**
 * Validates raw model output or parsed JSON against FindingsPayloadSchema.
 * Automatically wraps array root responses into `{ findings: [...] }`
 * and single finding objects into `{ findings: [finding] }`.
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
  } else if (
    target &&
    typeof target === 'object' &&
    !('findings' in target) &&
    'file' in target &&
    'message' in target
  ) {
    target = { findings: [target] };
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

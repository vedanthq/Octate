/**
 * ModelRequest and ModelResponse type definitions.
 * Structured fields enforce prompt injection protection (D-15, D-34).
 */

import { z } from 'zod';

/**
 * Token usage information from model response.
 */
export interface ModelUsage {
  /** Number of prompt tokens */
  promptTokens: number;
  /** Number of completion tokens */
  completionTokens: number;
  /** Total tokens (prompt + completion) */
  totalTokens: number;
}

/**
 * Request structure for model generation.
 * Separates trusted (system) from untrusted (user-provided) content.
 */
export interface ModelRequest {
  /** Trusted system policy - never overridden by user input */
  systemPolicy: string;
  /** The review task description - trusted */
  reviewTask: string;
  /** Project-specific rules - trusted */
  projectRules: string[];
  /** Repository metadata (size, languages, etc.) - trusted */
  repoMetadata: Record<string, unknown>;
  /** Git diff content - untrusted (from repo) */
  diff: string;
  /** Additional context snippets - untrusted (from repo) */
  context: Array<{
    source: string;
    content: string;
    relevance: number;
  }>;
  /** Diagnostic information (lint, type errors) - trusted */
  diagnostics: Array<{
    file: string;
    line: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  /** Output schema for structured response - trusted */
  outputSchema: z.ZodSchema;
}

/**
 * Response structure from model generation.
 */
export interface ModelResponse {
  /** Array of findings from the model */
  findings: Array<{
    /** Finding type/category */
    type: string;
    /** Severity level */
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    /** File path */
    file: string;
    /** Line number (1-indexed) */
    line: number;
    /** End line number */
    endLine?: number;
    /** Finding message */
    message: string;
    /** Suggested fix (optional) */
    suggestion?: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Evidence references */
    evidence?: string[];
  }>;
  /** Token usage information */
  usage: ModelUsage;
  /** Model identifier */
  model: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Raw response from provider (optional, for debugging) */
  rawResponse?: string;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
}

/**
 * Zod schema for ModelResponse findings array (for validation).
 */
export const ModelResponseFindingsSchema = z.array(
  z.object({
    type: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    file: z.string(),
    line: z.number().int().positive(),
    endLine: z.number().int().positive().optional(),
    message: z.string(),
    suggestion: z.string().optional(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()).optional(),
  })
);

/**
 * Zod schema for ModelResponse (for validation).
 */
export const ModelResponseSchema = z.object({
  findings: ModelResponseFindingsSchema,
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
  rawResponse: z.string().optional(),
  finishReason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'error']),
});

/**
 * Interface for model providers.
 * Implementations: LocalNvidiaProvider, HostedProvider (Phase 4)
 */
export interface ReviewModel {
  /**
   * Generates a response for the given request.
   * The AbortSignal from the request should be respected for cancellation.
   */
  generate(request: ModelRequest): Promise<ModelResponse>;

  /**
   * Returns the model identifier.
   */
  readonly modelId: string;

  /**
   * Returns the maximum context window size in tokens.
   */
  readonly maxContextTokens: number;
}

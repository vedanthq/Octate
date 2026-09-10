/**
 * Model Request/Response type definitions for the ReviewModel abstraction.
 * Enforces structured fields for prompt injection protection (trusted vs untrusted).
 */

/**
 * Usage metadata for model calls.
 */
export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Represents a single finding from the model.
 */
export interface ModelFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category:
    | 'correctness'
    | 'security'
    | 'performance'
    | 'architecture'
    | 'reliability'
    | 'maintainability'
    | 'compatibility'
    | 'testing';
  title: string;
  message: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  evidence: ModelEvidence[];
  relatedFiles: string[];
  relatedSymbols: string[];
  impact: string;
  suggestedFix: string;
  reviewer: string;
  metadata?: Record<string, unknown>;
}

/**
 * Evidence supporting a finding.
 */
export interface ModelEvidence {
  file: string;
  startLine: number;
  endLine: number;
  relationship: string;
  explanation: string;
}

/**
 * Request structure for model generation.
 * Structured fields enforce trusted/untrusted separation for prompt injection protection.
 */
export interface ModelRequest {
  /** Trusted: System policy instructions */
  systemPolicy: string;
  /** Trusted: Review task description */
  reviewTask: string;
  /** Trusted: Project-specific rules from octate.yaml */
  projectRules: string[];
  /** Trusted: Repository metadata (language stats, size, etc.) */
  repoMetadata: RepositoryMetadata;
  /** Trusted/Untrusted boundary: Git diff of changes */
  diff: string;
  /** Untrusted: Relevant source code context (ranked by Context Engine) */
  context: ContextItem[];
  /** Trusted: Static analysis diagnostics */
  diagnostics: Diagnostic[];
  /** Trusted: Output schema for validation */
  outputSchema: string;
}

/**
 * Repository metadata for context.
 */
export interface RepositoryMetadata {
  root: string;
  languages: Record<string, number>;
  fileCount: number;
  totalLines: number;
  gitRemote?: string;
}

/**
 * Context item from the Context Engine.
 */
export interface ContextItem {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  relevanceScore: number;
  type:
    | 'changed-symbol'
    | 'caller'
    | 'callee'
    | 'related-type'
    | 'test'
    | 'config'
    | 'history'
    | 'diagnostic';
}

/**
 * Static analysis diagnostic.
 */
export interface Diagnostic {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  source: string;
  rule?: string | undefined;
}

/**
 * Response structure from model generation.
 */
export interface ModelResponse {
  findings: ModelFinding[];
  usage: ModelUsage;
  model: string;
  latencyMs: number;
  rawResponse?: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

/**
 * AbortSignal-like interface for cancellation.
 * Allows using either native AbortSignal or compatible implementations.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason: unknown;
  addEventListener(type: 'abort', listener: (event: Event) => void): void;
  removeEventListener(type: 'abort', listener: (event: Event) => void): void;
}

/**
 * Review model abstraction interface.
 * Core depends on this abstraction, not NVIDIA specifics.
 */
export interface ReviewModel {
  /**
   * Generates a response for the given request.
   * @param request - Structured model request with trusted/untrusted separation
   * @returns Promise resolving to structured response
   */
  generate(request: ModelRequest): Promise<ModelResponse>;
}

/**
 * Configuration for model providers.
 */
export interface ModelProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Provider type for factory pattern.
 */
export type ProviderType = 'local-nvidia' | 'hosted';

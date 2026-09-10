/**
 * Test doubles and mock fixtures for Review Engine unit and integration tests.
 */

import type { ReviewContext } from '../../intelligence/types.js';
import type { ModelFinding, ModelRequest, ModelResponse, ReviewModel } from '../../model/types.js';

/**
 * In-memory configurable mock ReviewModel for testing DAG and Critic interactions.
 */
export class MockReviewModel implements ReviewModel {
  public calls: ModelRequest[] = [];
  private handlers: Map<string, (req: ModelRequest) => Promise<ModelResponse>> = new Map();

  /**
   * Registers a handler for requests matching the given role or task substring (case-insensitive).
   */
  public setRoleHandler(
    roleSubstring: string,
    handler: (req: ModelRequest) => Promise<ModelResponse>
  ): void {
    this.handlers.set(roleSubstring.toLowerCase(), handler);
  }

  /**
   * Alias for setRoleHandler for convenience.
   */
  public setHandler(
    taskKeyword: string,
    handler: (req: ModelRequest) => Promise<ModelResponse>
  ): void {
    this.setRoleHandler(taskKeyword, handler);
  }

  /**
   * Clears recorded calls and registered handlers.
   */
  public reset(): void {
    this.calls = [];
    this.handlers.clear();
  }

  /**
   * Generates a mock response matching the request task against registered handlers,
   * or returns a default empty response.
   */
  public async generate(request: ModelRequest): Promise<ModelResponse> {
    await Promise.resolve();
    this.calls.push(request);
    const task = request.reviewTask.toLowerCase();

    for (const [key, handler] of this.handlers.entries()) {
      if (task.includes(key)) {
        return handler(request);
      }
    }

    return {
      findings: [],
      usage: {
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    };
  }
}

/**
 * Creates a valid test finding with grounded evidence defaults.
 */
export function createTestFinding(overrides?: Partial<ModelFinding>): ModelFinding {
  return {
    severity: 'medium',
    category: 'correctness',
    title: 'Potential null dereference in request handler',
    message: 'Variable user might be null when accessed without check',
    file: 'src/handler.ts',
    startLine: 10,
    endLine: 15,
    confidence: 0.85,
    evidence: [
      {
        file: 'src/handler.ts',
        startLine: 10,
        endLine: 12,
        relationship: 'caller',
        explanation: 'Object accessed here before null guard',
      },
    ],
    relatedFiles: [],
    relatedSymbols: [],
    impact: 'May trigger unhandled TypeError at runtime',
    suggestedFix: 'if (!user) { return null; } before accessing user.profile',
    reviewer: 'structural',
    ...overrides,
  };
}

/**
 * Creates a valid test review context.
 */
export function createTestContext(overrides?: Partial<ReviewContext>): ReviewContext {
  return {
    trustedHeader: 'System: Octate Review Context v1',
    diagnosticsBlock: '',
    contextSnippets: [],
    totalTokens: 100,
    metrics: {
      candidateCount: 1,
      selectedCount: 1,
      candidateTokens: 100,
      selectedTokens: 100,
      selectionRatio: 1.0,
    },
    items: [],
    ...overrides,
  };
}

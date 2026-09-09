/**
 * ReviewModel abstraction interface.
 * Core depends on this interface, not provider implementations.
 * Phase 4 will implement LocalNvidiaProvider and HostedProvider.
 */

import type {
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ProviderType,
  ReviewModel as ReviewModelInterface,
} from './types.js';

/**
 * ReviewModel interface for AI code review.
 *
 * This is the ONLY interface the core review engine depends on.
 * Provider implementations (LocalNvidiaProvider, HostedProvider) implement this.
 */
export const defaultReviewModel: ReviewModelInterface = {
  /**
   * Generates a model response for code review.
   *
   * @param request - Structured request with trusted/untrusted separation
   * @returns Promise resolving to validated model response
   */
  async generate(request: ModelRequest): Promise<ModelResponse> {
    throw new Error('ReviewModel.generate() must be implemented by provider');
  },
};

/**
 * Factory function to create provider instances.
 * Will be implemented in Phase 4.
 */
export function createModelProvider(
  type: ProviderType,
  config: ModelProviderConfig
): ReviewModelInterface {
  throw new Error(`Provider ${type} not yet implemented (Phase 4)`);
}

/**
 * Validates that an object implements the ReviewModel interface.
 */
export function isReviewModel(obj: unknown): obj is ReviewModelInterface {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>).generate === 'function'
  );
}

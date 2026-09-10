/**
 * ReviewModel abstraction interface.
 * Core depends on this interface, not provider implementations.
 */

import { LocalNvidiaProvider } from './providers/nvidia.js';
import type {
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ProviderType,
  ReviewModel as ReviewModelInterface,
} from './types.js';

export { LocalNvidiaProvider };

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
   * @param _request - Structured request with trusted/untrusted separation
   * @returns Promise resolving to validated model response
   */
  generate(_request: ModelRequest): Promise<ModelResponse> {
    return Promise.reject(new Error('ReviewModel.generate() must be implemented by provider'));
  },
};

/**
 * Factory function to create provider instances.
 */
export function createModelProvider(
  type: ProviderType,
  config: ModelProviderConfig = { model: 'nvidia/nemotron-3-ultra-550b-a55b' }
): ReviewModelInterface {
  if (type === 'nvidia' || type === 'local-nvidia') {
    return new LocalNvidiaProvider({
      apiKey: config.apiKey,
      endpointUrl: config.baseUrl,
      modelId: config.model,
      timeoutMs: config.timeout,
      maxRetries: config.maxRetries,
    });
  }

  if (type === 'hosted') {
    throw new Error('Hosted provider is deferred to future milestone');
  }

  throw new Error(`Unknown provider type: ${type}`);
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

/**
 * ReviewModel interface definition.
 * Interface only; providers implement in Phase 4.
 */

import type { ReviewModel } from './types.js';

export type { ReviewModel } from './types.js';

/**
 * Type guard for ReviewModel.
 */
export function isReviewModel(obj: unknown): obj is ReviewModel {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'generate' in obj &&
    typeof (obj as any).generate === 'function' &&
    'modelId' in obj &&
    typeof (obj as any).modelId === 'string' &&
    'maxContextTokens' in obj &&
    typeof (obj as any).maxContextTokens === 'number'
  );
}

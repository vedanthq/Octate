/**
 * JSON ReviewRenderer implementation for automated CI/CD and machine parsing.
 */

import type { ReviewResult } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

/**
 * Renders ReviewResult as a 2-space indented valid JSON document.
 * Suitable for piping into jq, storing in artifact stores, or machine analysis.
 */
export class JsonRenderer implements ReviewRenderer {
  private readonly options: RendererOptions;

  constructor(options: RendererOptions = {}) {
    this.options = options;
  }

  /**
   * Serializes the review result as formatted JSON and writes it to the
   * configured destination (stdout, stream, or file).
   *
   * @param result Authoritative review result.
   */
  public async render(result: ReviewResult): Promise<void> {
    const jsonOutput = JSON.stringify(result, null, 2);
    await writeRenderedOutput(jsonOutput, this.options);
  }
}

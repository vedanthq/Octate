/**
 * Quiet ReviewRenderer implementation for minimalist terminal output and fast scanning.
 */

import type { ReviewResult } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

/**
 * Minimalist renderer emitting one line per finding and a summary count.
 * Complies with decision D-15: If 0 findings exist, remains completely silent
 * (writing 0 bytes to stdout).
 */
export class QuietRenderer implements ReviewRenderer {
  private readonly options: RendererOptions;

  constructor(options: RendererOptions = {}) {
    this.options = options;
  }

  /**
   * Renders findings in a compact single-line format:
   * `${file}:${line}: [${SEVERITY}] ${title}`
   *
   * @param result Authoritative review result.
   */
  public async render(result: ReviewResult): Promise<void> {
    // D-15: Total silence on clean repository
    if (result.findings.length === 0) {
      return;
    }

    const lines: string[] = [];
    for (const finding of result.findings) {
      const line = finding.startLine ?? finding.line ?? 1;
      lines.push(`${finding.file}:${line}: [${finding.severity.toUpperCase()}] ${finding.title}`);
    }

    // Summary line
    lines.push(
      `\nTotal: ${result.summary.totalFindings} findings in ${result.summary.filesAnalyzed} files`
    );

    await writeRenderedOutput(lines.join('\n'), this.options);
  }
}

/**
 * Rich human-readable ANSI colored terminal ReviewRenderer implementation.
 */

import pc from 'picocolors';
import type { ReviewResult, ReviewSeverity } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

/**
 * Formats a stylized ANSI badge based on the finding's severity level.
 *
 * @param severity Finding severity level.
 * @returns Colorized badge string.
 */
export function formatBadge(severity: ReviewSeverity): string {
  switch (severity) {
    case 'critical':
      return pc.bgRed(pc.white(pc.bold(' CRITICAL ')));
    case 'high':
      return pc.bgYellow(pc.black(pc.bold(' HIGH ')));
    case 'medium':
      return pc.yellow(pc.bold('[MEDIUM]'));
    case 'low':
      return pc.cyan(pc.bold('[LOW]'));
    case 'info':
      return pc.dim('[INFO]');
  }
}

/**
 * Console renderer generating human-readable, colorized output with
 * header banners, finding details, suggested fixes, and summary boxes.
 */
export class ConsoleRenderer implements ReviewRenderer {
  private readonly options: RendererOptions;

  constructor(options: RendererOptions = {}) {
    this.options = options;
  }

  /**
   * Renders the review result into colorized terminal output.
   *
   * @param result Authoritative review result.
   */
  public async render(result: ReviewResult): Promise<void> {
    const lines: string[] = [];

    lines.push(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    lines.push(pc.bold(' Octate Code Review'));
    lines.push(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    lines.push('');
    lines.push(`Scope: ${result.metadata.scopeType}`);
    lines.push(`Files analyzed: ${result.summary.filesAnalyzed}`);
    lines.push(`Total findings: ${result.summary.totalFindings}`);
    lines.push('');

    if (result.findings.length === 0) {
      lines.push(pc.green('✓ No issues found'));
    } else {
      for (const finding of result.findings) {
        const line = finding.startLine ?? finding.line ?? 1;
        lines.push(`  ${formatBadge(finding.severity)} ${pc.bold(finding.file)}:${line}`);
        lines.push(`      ${finding.title}`);
        lines.push(`      ${pc.dim(finding.message)}`);
        if (finding.suggestedFix) {
          lines.push(`      ${pc.green('💡 Fix:')} ${finding.suggestedFix}`);
        }
        lines.push('');
      }
    }

    lines.push(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    await writeRenderedOutput(lines.join('\n'), this.options);
  }
}

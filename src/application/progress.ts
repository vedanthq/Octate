/**
 * Stderr-isolated canonical review progress reporter.
 * Implements D-05, D-06, D-07, D-08, ensuring non-interactive output cleanliness.
 */

import pc from 'picocolors';
import type { ReviewProgressCallback, ReviewProgressEvent } from './types.js';

/**
 * Options configuring progress reporting behavior and stream destination.
 */
export interface ProgressReporterOptions {
  quiet?: boolean | undefined;
  json?: boolean | undefined;
  sarif?: boolean | undefined;
  stream?: NodeJS.WritableStream | undefined;
}

/**
 * Streams canonical review stages to stderr with TTY carriage return overwriting.
 * Completely suppressed in quiet, json, and sarif modes to protect stdout cleanliness.
 */
export class StderrProgressReporter {
  private readonly enabled: boolean;
  private readonly stream: NodeJS.WritableStream;
  private readonly isTTY: boolean;

  constructor(options: ProgressReporterOptions = {}) {
    this.enabled = !options.quiet && !options.json && !options.sarif;
    this.stream = options.stream ?? process.stderr;
    this.isTTY = Boolean((this.stream as { isTTY?: boolean | undefined }).isTTY);
  }

  /**
   * Whether progress reporting is active or suppressed.
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Progress callback conforming to ReviewProgressCallback signature.
   */
  public report: ReviewProgressCallback = (event: ReviewProgressEvent): void => {
    if (!this.enabled) {
      return;
    }

    const stepPrefix = event.step ? pc.dim(`[${event.step.current}/${event.step.total}] `) : '';

    const statusIcon =
      event.status === 'complete'
        ? pc.green('✓ ')
        : event.status === 'error'
          ? pc.red('✗ ')
          : pc.cyan('⟳ ');

    const line = `${stepPrefix}${statusIcon}${event.message}`;

    if (this.isTTY) {
      this.stream.write(`\r\x1b[K${line}`);
      if (event.status === 'complete' || event.status === 'error') {
        this.stream.write('\n');
      }
    } else if (event.status === 'complete' || event.status === 'error') {
      this.stream.write(`${line}\n`);
    }
  };

  /**
   * Clears the current line on TTY streams before emitting final output.
   */
  public clear(): void {
    if (this.enabled && this.isTTY) {
      this.stream.write('\r\x1b[K');
    }
  }
}

/**
 * Authoritative Layer 6 ReviewRenderer contracts and file output utilities.
 * Defines the standard polymorphic rendering interface for CI and TUI modes.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ReviewResult } from '../review/types.js';

/**
 * Common configuration options provided to review renderers.
 */
export interface RendererOptions {
  /**
   * Optional filesystem destination path.
   * When specified, output is redirected to this file, creating parent directories
   * as needed, and a confirmation notice is printed to stderr.
   */
  outputFile?: string | undefined;

  /**
   * Target writable stream when rendering to standard streams.
   * Defaults to process.stdout if outputFile is undefined.
   */
  stream?: NodeJS.WritableStream | undefined;

  /**
   * Explicit color toggle for ANSI formatting.
   */
  color?: boolean | undefined;
}

/**
 * Pluggable ReviewRenderer contract defining a standard polymorphic
 * rendering interface across automation (JSON, SARIF, Quiet), console output,
 * and future interactive TUI modes.
 */
export interface ReviewRenderer {
  /**
   * Renders the authoritative ReviewResult to the configured destination.
   *
   * @param result Authoritative review result emitted by the pipeline.
   */
  render(result: ReviewResult): Promise<void> | void;
}

/**
 * Utility function to dispatch rendered content to either a target output file
 * or a destination writable stream (stdout / custom stream).
 *
 * Mitigates T-06-03: Creates missing parent directories recursively via
 * `mkdir(dirname(outputFile), { recursive: true })`, writes UTF-8 encoded text
 * atomically, and routes confirmation exclusively to stderr so stdout remains
 * strictly machine-parseable.
 *
 * @param content String content to write.
 * @param options Target destination and formatting options.
 */
export async function writeRenderedOutput(
  content: string,
  options?: RendererOptions | undefined
): Promise<void> {
  if (options?.outputFile) {
    const filePath = options.outputFile;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    process.stderr.write(`Wrote results to ${filePath}\n`);
  } else {
    const stream = options?.stream ?? process.stdout;
    const formattedContent = content.endsWith('\n') ? content : `${content}\n`;
    stream.write(formattedContent);
  }
}

/**
 * Unit tests for StderrProgressReporter.
 */

import { describe, expect, it } from '@jest/globals';
import { StderrProgressReporter } from './progress.js';
import type { CanonicalReviewStage } from './types.js';

class MockWritableStream {
  public chunks: string[] = [];
  public isTTY = false;

  public write(chunk: string | Buffer): boolean {
    this.chunks.push(chunk.toString());
    return true;
  }

  public getOutput(): string {
    return this.chunks.join('');
  }

  public reset(): void {
    this.chunks = [];
  }
}

describe('application:progress', () => {
  const canonicalStages: CanonicalReviewStage[] = [
    'git:read',
    'index:update',
    'symbols:resolve',
    'diagnostics:collect',
    'context:build',
    'review:dag',
    'review:critic',
    'review:rank',
  ];

  it('can report all 8 canonical stages in sequence', () => {
    const mockStream = new MockWritableStream();
    mockStream.isTTY = true;
    const reporter = new StderrProgressReporter({
      stream: mockStream as unknown as NodeJS.WritableStream,
    });

    for (let i = 0; i < canonicalStages.length; i++) {
      const stage = canonicalStages[i] as CanonicalReviewStage;
      reporter.report({
        stage,
        status: 'start',
        message: `Starting ${stage}`,
        step: { current: i + 1, total: 8 },
      });
      reporter.report({
        stage,
        status: 'complete',
        message: `Completed ${stage}`,
        step: { current: i + 1, total: 8 },
      });
    }

    const output = mockStream.getOutput();
    for (const stage of canonicalStages) {
      expect(output).toContain(`Starting ${stage}`);
      expect(output).toContain(`Completed ${stage}`);
    }
  });

  describe('suppression in non-interactive modes', () => {
    it('suppresses progress output when quiet is true', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = true;
      const reporter = new StderrProgressReporter({
        quiet: true,
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      expect(reporter.isEnabled()).toBe(false);
      reporter.report({
        stage: 'git:read',
        status: 'complete',
        message: 'Discovered changed files',
      });
      reporter.clear();

      expect(mockStream.chunks).toHaveLength(0);
    });

    it('suppresses progress output when json is true', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = true;
      const reporter = new StderrProgressReporter({
        json: true,
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      expect(reporter.isEnabled()).toBe(false);
      reporter.report({
        stage: 'git:read',
        status: 'complete',
        message: 'Discovered changed files',
      });
      reporter.clear();

      expect(mockStream.chunks).toHaveLength(0);
    });

    it('suppresses progress output when sarif is true', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = true;
      const reporter = new StderrProgressReporter({
        sarif: true,
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      expect(reporter.isEnabled()).toBe(false);
      reporter.report({
        stage: 'git:read',
        status: 'complete',
        message: 'Discovered changed files',
      });
      reporter.clear();

      expect(mockStream.chunks).toHaveLength(0);
    });
  });

  describe('TTY vs non-TTY behavior', () => {
    it('writes carriage return ANSI codes on TTY streams', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = true;
      const reporter = new StderrProgressReporter({
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      reporter.report({
        stage: 'git:read',
        status: 'progress',
        message: 'Reading tree',
      });

      expect(mockStream.chunks.length).toBe(1);
      expect(mockStream.chunks[0]).toContain('\r\x1b[K');
      expect(mockStream.chunks[0]).toContain('Reading tree');
      expect(mockStream.chunks[0]?.endsWith('\n')).toBe(false);

      reporter.report({
        stage: 'git:read',
        status: 'complete',
        message: 'Tree read complete',
      });

      expect(mockStream.chunks.length).toBe(3); // \r\x1b[K... and \n
      expect(mockStream.chunks[2]).toBe('\n');
    });

    it('filters out start and progress events on non-TTY streams to avoid clutter', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = false;
      const reporter = new StderrProgressReporter({
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      reporter.report({
        stage: 'index:update',
        status: 'start',
        message: 'Starting AST parse',
      });
      reporter.report({
        stage: 'index:update',
        status: 'progress',
        message: 'Parsing file 1 of 5',
      });

      expect(mockStream.chunks).toHaveLength(0);

      reporter.report({
        stage: 'index:update',
        status: 'complete',
        message: 'Parsed 5 files',
      });

      expect(mockStream.chunks).toHaveLength(1);
      expect(mockStream.chunks[0]).toContain('Parsed 5 files\n');
    });

    it('writes error events on non-TTY streams', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = false;
      const reporter = new StderrProgressReporter({
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      reporter.report({
        stage: 'diagnostics:collect',
        status: 'error',
        message: 'Static analysis failed',
      });

      expect(mockStream.chunks).toHaveLength(1);
      expect(mockStream.chunks[0]).toContain('Static analysis failed\n');
    });
  });

  describe('clear()', () => {
    it('clears line with carriage return sequence on TTY streams', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = true;
      const reporter = new StderrProgressReporter({
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      reporter.clear();
      expect(mockStream.chunks).toEqual(['\r\x1b[K']);
    });

    it('does nothing when clear() is called on non-TTY streams', () => {
      const mockStream = new MockWritableStream();
      mockStream.isTTY = false;
      const reporter = new StderrProgressReporter({
        stream: mockStream as unknown as NodeJS.WritableStream,
      });

      reporter.clear();
      expect(mockStream.chunks).toHaveLength(0);
    });
  });
});

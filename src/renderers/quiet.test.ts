import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMockFinding, createMockReviewResult } from '../application/__tests__/mocks.js';
import { QuietRenderer } from './quiet.js';

class MemoryWritable extends Writable {
  public content = '';

  public override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.content += chunk.toString();
    callback();
  }
}

describe('renderers:quiet', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'octate-quiet-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('emits zero bytes to stream when findings are empty (D-15)', async () => {
    const stream = new MemoryWritable();
    const renderer = new QuietRenderer({ stream });
    const mockResult = createMockReviewResult([]);

    await renderer.render(mockResult);

    expect(stream.content).toBe('');
    expect(stream.content.length).toBe(0);
  });

  it('formats one line per finding with severity and title', async () => {
    const stream = new MemoryWritable();
    const renderer = new QuietRenderer({ stream });
    const mockResult = createMockReviewResult([
      createMockFinding('critical', {
        file: 'src/auth/jwt.ts',
        startLine: 15,
        title: 'Unsigned JWT accepted',
      }),
      createMockFinding('low', {
        file: 'src/logging.ts',
        startLine: 45,
        title: 'Console log statement found',
      }),
    ]);

    await renderer.render(mockResult);

    const lines = stream.content.trim().split('\n');
    expect(lines[0]).toBe('src/auth/jwt.ts:15: [CRITICAL] Unsigned JWT accepted');
    expect(lines[1]).toBe('src/logging.ts:45: [LOW] Console log statement found');
    expect(lines[lines.length - 1]).toBe('Total: 2 findings in 1 files');
  });

  it('uses line alias if startLine is not present', async () => {
    const stream = new MemoryWritable();
    const renderer = new QuietRenderer({ stream });
    const mockFinding = createMockFinding('medium', {
      file: 'src/data.ts',
      line: 77,
      title: 'Missing index on query',
    });
    delete (mockFinding as { startLine?: number }).startLine;
    const mockResult = createMockReviewResult([mockFinding]);

    await renderer.render(mockResult);

    expect(stream.content).toContain('src/data.ts:77: [MEDIUM] Missing index on query');
  });

  it('writes quiet output to an outputFile and prints notice to stderr', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const outputFile = join(tempDir, 'output', 'quiet.txt');
    const renderer = new QuietRenderer({ outputFile });
    const mockResult = createMockReviewResult([
      createMockFinding('high', {
        file: 'src/index.ts',
        startLine: 5,
        title: 'Unhandled promise rejection',
      }),
    ]);

    await renderer.render(mockResult);

    const written = await fs.readFile(outputFile, 'utf-8');
    expect(written).toContain('src/index.ts:5: [HIGH] Unhandled promise rejection');
    expect(stderrSpy).toHaveBeenCalledWith(`Wrote results to ${outputFile}\n`);
  });
});

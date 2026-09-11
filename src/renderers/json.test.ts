import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMockFinding, createMockReviewResult } from '../application/__tests__/mocks.js';
import { JsonRenderer } from './json.js';

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

describe('renderers:json', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'octate-json-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('renders valid 2-space indented JSON to stream', async () => {
    const stream = new MemoryWritable();
    const renderer = new JsonRenderer({ stream });
    const mockResult = createMockReviewResult([
      createMockFinding('high', {
        title: 'Buffer overflow risk',
        file: 'src/buffer.ts',
        startLine: 42,
      }),
    ]);

    await renderer.render(mockResult);

    expect(stream.content).toContain('\n  "summary": {');
    const parsed = JSON.parse(stream.content);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('metadata');
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].title).toBe('Buffer overflow risk');
    expect(parsed.summary.totalFindings).toBe(1);
    expect(parsed.metadata.version).toBe('0.1.0');
  });

  it('writes output to an outputFile creating nested directories', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const targetFile = join(tempDir, 'nested', 'deep', 'report.json');
    const renderer = new JsonRenderer({ outputFile: targetFile });
    const mockResult = createMockReviewResult([createMockFinding('critical')]);

    await renderer.render(mockResult);

    const fileContent = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(fileContent);
    expect(parsed.summary.totalFindings).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(`Wrote results to ${targetFile}\n`);
  });

  it('writes trailing newline when outputting to standard stream', async () => {
    const stream = new MemoryWritable();
    const renderer = new JsonRenderer({ stream });
    const mockResult = createMockReviewResult([]);

    await renderer.render(mockResult);

    expect(stream.content.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(stream.content);
    expect(parsed.findings).toEqual([]);
  });

  it('writes to process.stdout by default if no stream or file specified', async () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const renderer = new JsonRenderer();
    const mockResult = createMockReviewResult([]);

    await renderer.render(mockResult);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    const parsed = JSON.parse(output);
    expect(parsed.summary.totalFindings).toBe(0);
  });
});

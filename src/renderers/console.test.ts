import { Writable } from 'node:stream';
import { describe, expect, it } from '@jest/globals';
import { createMockFinding, createMockReviewResult } from '../application/__tests__/mocks.js';
import { ConsoleRenderer, formatBadge } from './console.js';
import { createRenderer, JsonRenderer, QuietRenderer, SarifRenderer } from './index.js';

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

describe('renderers:console', () => {
  describe('formatBadge', () => {
    it('generates badges for all severity levels', () => {
      expect(formatBadge('critical')).toContain('CRITICAL');
      expect(formatBadge('high')).toContain('HIGH');
      expect(formatBadge('medium')).toContain('[MEDIUM]');
      expect(formatBadge('low')).toContain('[LOW]');
      expect(formatBadge('info')).toContain('[INFO]');
    });
  });

  it('renders clean success banner when 0 findings are present', async () => {
    const stream = new MemoryWritable();
    const renderer = new ConsoleRenderer({ stream });
    const mockResult = createMockReviewResult([]);

    await renderer.render(mockResult);

    expect(stream.content).toContain('Octate Code Review');
    expect(stream.content).toContain('✓ No issues found');
    expect(stream.content).toContain('Files analyzed: 1');
    expect(stream.content).toContain('Total findings: 0');
  });

  it('renders findings with badges, title, message, and suggested fix', async () => {
    const stream = new MemoryWritable();
    const renderer = new ConsoleRenderer({ stream });
    const infoFinding = createMockFinding('info', {
      file: 'src/config.ts',
      startLine: 3,
      title: 'Missing trailing comma',
      message: 'Formatting issue',
    });
    delete (infoFinding as { suggestedFix?: string }).suggestedFix;

    const mockResult = createMockReviewResult([
      createMockFinding('critical', {
        file: 'src/api/auth.ts',
        startLine: 18,
        title: 'Authentication bypass via missing check',
        message: 'Endpoint does not verify JWT signature',
        suggestedFix: 'Call verifyToken(token) before proceeding',
      }),
      infoFinding,
    ]);

    await renderer.render(mockResult);

    expect(stream.content).toContain('Octate Code Review');
    expect(stream.content).toContain('src/api/auth.ts:18');
    expect(stream.content).toContain('Authentication bypass via missing check');
    expect(stream.content).toContain('Endpoint does not verify JWT signature');
    expect(stream.content).toContain('💡 Fix:');
    expect(stream.content).toContain('Call verifyToken(token) before proceeding');

    expect(stream.content).toContain('src/config.ts:3');
    expect(stream.content).toContain('Missing trailing comma');
  });

  describe('createRenderer factory', () => {
    it('creates JsonRenderer for "json"', () => {
      const renderer = createRenderer('json');
      expect(renderer).toBeInstanceOf(JsonRenderer);
    });

    it('creates SarifRenderer for "sarif"', () => {
      const renderer = createRenderer('sarif');
      expect(renderer).toBeInstanceOf(SarifRenderer);
    });

    it('creates QuietRenderer for "quiet"', () => {
      const renderer = createRenderer('quiet');
      expect(renderer).toBeInstanceOf(QuietRenderer);
    });

    it('creates ConsoleRenderer for "console"', () => {
      const renderer = createRenderer('console');
      expect(renderer).toBeInstanceOf(ConsoleRenderer);
    });

    it('throws error for unsupported format', () => {
      expect(() => createRenderer('xml' as unknown as 'json')).toThrow(
        'Unsupported review renderer format: xml'
      );
    });
  });
});

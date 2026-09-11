import { jest } from '@jest/globals';
import { createMockFinding, createMockReviewResult } from '../../application/__tests__/mocks.js';
import { createRenderer } from '../index.js';
import { InteractiveTuiRenderer } from './renderer.js';

describe('renderers:tui:renderer', () => {
  let mockStdout: string[];
  let mockStderr: string[];
  let mockStream: NodeJS.WriteStream;
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    mockStdout = [];
    mockStderr = [];
    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    mockStream = {
      write: jest.fn((chunk: string | Uint8Array) => {
        mockStdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
        return true;
      }),
    } as unknown as NodeJS.WriteStream;

    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      mockStderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  it('implements ReviewRenderer interface and is registered in createRenderer factory', () => {
    const renderer = createRenderer('tui', { stream: mockStream });
    expect(renderer).toBeInstanceOf(InteractiveTuiRenderer);
    expect(typeof renderer.render).toBe('function');
  });

  it('starts lifecycle on start() and enters alternate buffer', () => {
    const renderer = new InteractiveTuiRenderer({ stream: mockStream });
    renderer.start();

    // Verify alternate screen and hide cursor were written to stream
    const written = mockStdout.join('');
    expect(written).toContain('\x1b[?1049h');
    expect(written).toContain('\x1b[?25l');

    // Clean up
    renderer.exit();
    const afterExit = mockStdout.join('');
    expect(afterExit).toContain('\x1b[?1049l');
    expect(afterExit).toContain('\x1b[?25h');
  });

  it('dispatches progress and result events without error', () => {
    const renderer = new InteractiveTuiRenderer({ stream: mockStream });
    renderer.start();

    expect(() => {
      renderer.dispatchProgress({
        stage: 'git:read',
        status: 'progress',
        message: 'Reading git HEAD...',
      });
    }).not.toThrow();

    expect(() => {
      renderer.dispatchResult(createMockReviewResult([]));
    }).not.toThrow();

    renderer.exit();
  });

  it('sets exit code to 0 and writes clean summary on 0 blocking findings', async () => {
    const renderer = new InteractiveTuiRenderer({
      stream: mockStream,
      failOn: 'high',
    });
    renderer.start();

    const renderPromise = renderer.render(createMockReviewResult([]));

    // Simulate quit
    renderer.exit();
    await renderPromise;

    expect(process.exitCode).toBe(0);
    const stderr = mockStderr.join('');
    expect(stderr).toContain('clean (exit 0)');
  });

  it('sets exit code to 1 and writes failure summary when unsuppressed blocking findings exist', async () => {
    const critFinding = createMockFinding('critical', {
      id: 'crit-1',
      compositeScore: 95,
    });
    const result = createMockReviewResult([critFinding]);

    const renderer = new InteractiveTuiRenderer({
      stream: mockStream,
      failOn: 'high',
    });
    renderer.start();

    const renderPromise = renderer.render(result);

    // Simulate quit
    renderer.exit();
    await renderPromise;

    expect(process.exitCode).toBe(1);
    const stderr = mockStderr.join('');
    expect(stderr).toContain('1 blocking findings (exit 1)');
  });
});

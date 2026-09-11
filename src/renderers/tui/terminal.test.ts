import { jest } from '@jest/globals';
import {
  ANSI_ENTER_ALT_SCREEN,
  ANSI_EXIT_ALT_SCREEN,
  ANSI_HIDE_CURSOR,
  ANSI_SHOW_CURSOR,
  shouldUseTui,
  TerminalLifecycleManager,
} from './terminal.js';

describe('renderers:tui:terminal', () => {
  describe('shouldUseTui', () => {
    it('returns true when stdout is TTY and no disabling options are set', () => {
      const result = shouldUseTui({
        isTTY: true,
        ci: false,
        term: 'xterm-256color',
      });
      expect(result).toBe(true);
    });

    it('returns false when not a TTY', () => {
      expect(shouldUseTui({ isTTY: false, ci: false, term: 'xterm' })).toBe(false);
    });

    it('returns false in CI environments', () => {
      expect(shouldUseTui({ isTTY: true, ci: true, term: 'xterm' })).toBe(false);
    });

    it('returns false when TERM is dumb', () => {
      expect(shouldUseTui({ isTTY: true, ci: false, term: 'dumb' })).toBe(false);
    });

    it('returns false when plain flag is active', () => {
      expect(shouldUseTui({ isTTY: true, plain: true })).toBe(false);
    });

    it('returns false when noTui flag is active', () => {
      expect(shouldUseTui({ isTTY: true, noTui: true })).toBe(false);
    });

    it('returns false when automation or file output options are active', () => {
      expect(shouldUseTui({ isTTY: true, json: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, sarif: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, quiet: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, outputFile: 'report.json' })).toBe(false);
    });
  });

  describe('TerminalLifecycleManager', () => {
    let mockOutput: string[];
    let mockStream: NodeJS.WriteStream;

    beforeEach(() => {
      mockOutput = [];
      mockStream = {
        write: jest.fn((chunk: string | Uint8Array) => {
          mockOutput.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
          return true;
        }),
      } as unknown as NodeJS.WriteStream;
    });

    it('writes alternate screen and hide cursor on enter', () => {
      const manager = new TerminalLifecycleManager(mockStream);
      manager.enter();

      expect(manager.isActive()).toBe(true);
      expect(mockOutput.join('')).toBe(`${ANSI_ENTER_ALT_SCREEN}${ANSI_HIDE_CURSOR}`);
    });

    it('writes exit screen and show cursor on exit', () => {
      const manager = new TerminalLifecycleManager(mockStream);
      manager.enter();
      mockOutput.length = 0;

      manager.exit();
      expect(manager.isActive()).toBe(false);
      expect(mockOutput.join('')).toBe(`${ANSI_EXIT_ALT_SCREEN}${ANSI_SHOW_CURSOR}`);
    });

    it('is idempotent on multiple enter() and exit() calls', () => {
      const manager = new TerminalLifecycleManager(mockStream);
      manager.enter();
      manager.enter();
      expect(mockStream.write).toHaveBeenCalledTimes(1);

      manager.exit();
      manager.exit();
      expect(mockStream.write).toHaveBeenCalledTimes(2);
    });
  });
});

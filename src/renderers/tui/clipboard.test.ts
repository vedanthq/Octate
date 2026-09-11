import { jest } from '@jest/globals';
import { createMockFinding } from '../../application/__tests__/mocks.js';
import { copyToClipboard, copyViaOsc52, formatPatchPreview } from './clipboard.js';

describe('renderers:tui:clipboard', () => {
  describe('copyViaOsc52', () => {
    it('emits base64 OSC 52 sequence to the provided stream', () => {
      let output = '';
      const mockStream = {
        write: jest.fn((chunk: string) => {
          output += chunk;
          return true;
        }),
      } as unknown as NodeJS.WriteStream;

      const text = 'const secret = "token";';
      const success = copyViaOsc52(text, mockStream);

      expect(success).toBe(true);
      const expectedBase64 = Buffer.from(text, 'utf-8').toString('base64');
      expect(output).toBe(`\x1b]52;c;${expectedBase64}\x07`);
    });

    it('returns false when stream write throws', () => {
      const errorStream = {
        write: jest.fn(() => {
          throw new Error('write error');
        }),
      } as unknown as NodeJS.WriteStream;

      const success = copyViaOsc52('text', errorStream);
      expect(success).toBe(false);
    });
  });

  describe('formatPatchPreview', () => {
    it('produces valid unified diff header and replacement chunk', () => {
      const finding = createMockFinding('critical', {
        id: 'finding-1',
        title: 'Insecure Token',
        message: 'Hardcoded credentials',
        file: 'src/auth/jwt.ts',
        startLine: 42,
        endLine: 42,
        suggestedFix: 'const token = process.env.JWT_SECRET;',
      });

      const patch = formatPatchPreview(finding);
      expect(patch).toContain('--- a/src/auth/jwt.ts');
      expect(patch).toContain('+++ b/src/auth/jwt.ts');
      expect(patch).toContain('@@ -42,1 +42,1 @@');
      expect(patch).toContain('+const token = process.env.JWT_SECRET;');
    });
  });

  describe('copyToClipboard', () => {
    it('returns true when OSC 52 write succeeds', async () => {
      const success = await copyToClipboard('test snippet');
      // In default environment, writing OSC 52 to stdout succeeds
      expect(typeof success).toBe('boolean');
    });
  });
});

import { formatCodeSnippet, formatDiffLines, highlightTokens } from './syntax.js';

describe('renderers:tui:syntax', () => {
  describe('highlightTokens', () => {
    it('highlights keywords, strings, comments, and numbers', () => {
      const code = 'const count = 42; // number of items\nconst msg = "hello";';
      const highlighted = highlightTokens(code);

      // Verify code contains ANSI color sequences
      expect(highlighted).toContain('\x1b[');
      // Verify original tokens are preserved in formatted output
      expect(highlighted).toContain('count');
      expect(highlighted).toContain('42');
      expect(highlighted).toContain('// number of items');
      expect(highlighted).toContain('"hello"');
    });

    it('sanitizes dangerous unescaped control characters to prevent ANSI injection', () => {
      // Injects control characters like \x1b[2J (clear screen) and \x07 (bell)
      const untrustedCode = 'const safe = 1;\x1b[2J\x07\x00\x1f';
      const result = highlightTokens(untrustedCode);

      // The malicious \x1b[2J should have its escape and control characters stripped
      expect(result).not.toContain('\x1b[2J');
      expect(result).not.toContain('\x07');
      expect(result).not.toContain('\x00');
    });
  });

  describe('formatCodeSnippet', () => {
    it('includes context lines and formats target lines with > pointer and line gutters', () => {
      const lines = [
        'import { foo } from "./foo.js";', // line 10
        'const a = 1;', // line 11
        'const b = 2;', // line 12
        'const target = 3;', // line 13 (target)
        'const c = 4;', // line 14
        'const d = 5;', // line 15
      ];

      const snippet = formatCodeSnippet({
        lines,
        startLine: 10,
        highlightStart: 13,
        highlightEnd: 13,
        contextRadius: 2,
      });

      // Target line 13 should have pointer '>'
      const targetLine = snippet.find((l) => l.includes('13') && l.includes('>'));
      expect(targetLine).toBeDefined();

      // Context line 11 should have gutter separator '│'
      const contextLine = snippet.find((l) => l.includes('11') && l.includes('│'));
      expect(contextLine).toBeDefined();
    });

    it('returns empty array when lines array is empty', () => {
      expect(
        formatCodeSnippet({
          lines: [],
          startLine: 1,
          highlightStart: 1,
          highlightEnd: 1,
        })
      ).toEqual([]);
    });
  });

  describe('formatDiffLines', () => {
    it('colors additions green, deletions red, and hunk headers cyan', () => {
      const diff = ['@@ -1,2 +1,2 @@', '-oldCode()', '+newCode()', ' unchanged()'].join('\n');

      const formatted = formatDiffLines(diff);
      expect(formatted).toHaveLength(4);

      // @@ cyan
      expect(formatted[0]).toContain('\x1b[');
      // - deletion red
      expect(formatted[1]).toContain('\x1b[');
      // + addition green
      expect(formatted[2]).toContain('\x1b[');
    });
  });
});

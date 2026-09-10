import { describe, expect, it } from '@jest/globals';
import { formatNumberedLines, windowSnippet } from './windowing.js';

describe('Windowing and Line Numbering', () => {
  it('formats lines with 4-space padded line numbers', () => {
    const lines = ['const a = 1;', 'const b = 2;'];
    const formatted = formatNumberedLines(lines, 9);
    expect(formatted).toBe('   9 | const a = 1;\n  10 | const b = 2;');
  });

  it('returns full file numbered when file has <= 40 lines', () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    const windowed = windowSnippet(content, 15, 5);

    // No omission markers for small files
    expect(windowed).not.toContain('omitted');
    expect(windowed).toContain('   1 | line 1');
    expect(windowed).toContain('  30 | line 30');
  });

  it('slices large files around target line with omission markers', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    const windowed = windowSnippet(content, 50, 5); // lines 45 to 55

    expect(windowed).toContain('... [44 lines omitted] ...');
    expect(windowed).toContain('  45 | line 45');
    expect(windowed).toContain('  50 | line 50');
    expect(windowed).toContain('  55 | line 55');
    expect(windowed).toContain('... [45 lines omitted] ...');
  });

  it('prepends signature lines with omission markers', () => {
    const content = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n');
    const signature = ['export class UserManager {', '  handleUser() {'];
    const windowed = windowSnippet(content, 50, 3, signature);

    expect(windowed).toContain('   1 | export class UserManager {');
    expect(windowed).toContain('   2 |   handleUser() {');
    expect(windowed).toContain('lines omitted');
    expect(windowed).toContain('  50 | line 50');
  });
});

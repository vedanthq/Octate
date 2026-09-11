import pc from 'picocolors';

const colors = pc.createColors(true);

const KEYWORDS_LIST = [
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'import',
  'export',
  'from',
  'class',
  'interface',
  'type',
  'extends',
  'implements',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'switch',
  'case',
  'break',
  'default',
  'typeof',
  'instanceof',
  'yield',
  'super',
  'this',
];

const TOKEN_REGEX = new RegExp(
  `(?<comment>\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|(?<string>"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(?<keyword>\\b(?:${KEYWORDS_LIST.join('|')})\\b)|(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
  'g'
);

/**
 * Sanitizes unsafe control characters (ANSI injection protection T-07-02)
 * and highlights code tokens using picocolors.
 */
export function highlightTokens(code: string): string {
  // Strip control characters including escape sequence \x1b
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI and control character sanitization (T-07-02)
  const sanitized = code.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized.replace(TOKEN_REGEX, (...args: unknown[]) => {
    const groups = args[args.length - 1] as Record<string, string | undefined> | undefined;
    if (!groups) {
      return (args[0] as string) ?? '';
    }

    if (groups.comment) {
      return colors.dim(colors.italic(groups.comment));
    }
    if (groups.string) {
      return colors.green(groups.string);
    }
    if (groups.keyword) {
      return colors.blue(colors.bold(groups.keyword));
    }
    if (groups.number) {
      return colors.yellow(groups.number);
    }

    return (args[0] as string) ?? '';
  });
}

export interface CodeSnippetOptions {
  lines: string[];
  startLine: number; // 1-indexed start line of code chunk
  highlightStart: number;
  highlightEnd: number;
  contextRadius?: number | undefined; // default 4
}

export function formatCodeSnippet(options: CodeSnippetOptions): string[] {
  const { lines, startLine, highlightStart, highlightEnd, contextRadius = 4 } = options;
  if (lines.length === 0) {
    return [];
  }

  const targetIndex = highlightStart - startLine;
  const minIdx = Math.max(0, targetIndex - contextRadius);
  const maxIdx = Math.min(lines.length - 1, highlightEnd - startLine + contextRadius);

  const maxLineNum = startLine + maxIdx;
  const gutterWidth = String(maxLineNum).length;

  const result: string[] = [];

  for (let i = minIdx; i <= maxIdx; i++) {
    const lineNum = startLine + i;
    const isTarget = lineNum >= highlightStart && lineNum <= highlightEnd;
    const numPadded = String(lineNum).padStart(gutterWidth, ' ');
    const lineContent = lines[i] ?? '';
    const coloredContent = highlightTokens(lineContent);

    if (isTarget) {
      result.push(
        `${colors.red(numPadded)} ${colors.bold(colors.red('>'))} ${colors.bold(coloredContent)}`
      );
    } else {
      result.push(`${colors.dim(numPadded)} ${colors.dim('│')} ${coloredContent}`);
    }
  }

  return result;
}

export function formatDiffLines(diffText: string): string[] {
  return diffText.split('\n').map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return colors.green(line);
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return colors.red(line);
    }
    if (line.startsWith('@@')) {
      return colors.cyan(line);
    }
    return colors.dim(line);
  });
}

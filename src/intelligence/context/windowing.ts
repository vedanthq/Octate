/**
 * Call-site windowing and snippet slicing with line numbering and omission markers.
 * Enforces ±10 lines around target line, prepends signature, and prefixes all lines with line numbers.
 */

/**
 * Prefixes each line with a 4-character right-aligned line number: " 102 | const x = 1;"
 */
export function formatNumberedLines(lines: string[], startLine: number): string {
  return lines
    .map((line, idx) => {
      const lineNum = startLine + idx;
      return `${String(lineNum).padStart(4, ' ')} | ${line}`;
    })
    .join('\n');
}

/**
 * Windows a file snippet around targetLine with contextRadius (default 10).
 * If total file is <= 40 lines, returns entire file numbered.
 * Otherwise extracts signature + ±10 lines with explicit omission markers.
 */
export function windowSnippet(
  fileContent: string,
  targetLine: number,
  contextRadius = 10,
  signatureLines?: string[]
): string {
  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  if (totalLines <= 40) {
    return formatNumberedLines(lines, 1);
  }

  const clampedTarget = Math.max(1, Math.min(totalLines, targetLine));
  const sliceStart = Math.max(1, clampedTarget - contextRadius);
  const sliceEnd = Math.min(totalLines, clampedTarget + contextRadius);

  const parts: string[] = [];

  // Signature lines handling
  if (signatureLines && signatureLines.length > 0) {
    parts.push(formatNumberedLines(signatureLines, 1));
    if (sliceStart > signatureLines.length + 1) {
      const omitted = sliceStart - signatureLines.length - 1;
      parts.push(`   ... [${omitted} lines omitted] ...`);
    }
  } else if (sliceStart > 1) {
    const omitted = sliceStart - 1;
    parts.push(`   ... [${omitted} lines omitted] ...`);
  }

  // Target window lines
  const windowLines = lines.slice(sliceStart - 1, sliceEnd);
  parts.push(formatNumberedLines(windowLines, sliceStart));

  // Trailing omitted lines
  if (sliceEnd < totalLines) {
    const omitted = totalLines - sliceEnd;
    parts.push(`   ... [${omitted} lines omitted] ...`);
  }

  return parts.join('\n');
}

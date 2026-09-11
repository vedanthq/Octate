/**
 * Parses unified git diff text and extracts the diff hunk lines for a specific file.
 */
export function extractFileDiffHunk(diffText: string, filePath: string): string {
  if (!diffText.trim() || !filePath.trim()) {
    return '';
  }

  const normalizedTarget = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
  const lines = diffText.split(/\r?\n/);

  let currentFile: string | null = null;
  const hunksForFile: string[] = [];
  let capturing = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check for git diff header: diff --git a/... b/...
    const diffGitMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (diffGitMatch) {
      const pathB = diffGitMatch[2] ?? '';
      currentFile = pathB.replace(/\\/g, '/').replace(/^\.?\//, '');
      capturing =
        currentFile === normalizedTarget ||
        currentFile.endsWith(`/${normalizedTarget}`) ||
        normalizedTarget.endsWith(`/${currentFile}`);
      continue;
    }

    // Check for standard diff header: +++ b/... or +++ ...
    const plusMatch = line.match(/^\+\+\+ (?:b\/)?(.+?)$/);
    if (plusMatch) {
      const path = (plusMatch[1] ?? '').trim();
      currentFile = path.replace(/\\/g, '/').replace(/^\.?\//, '');
      capturing =
        currentFile === normalizedTarget ||
        currentFile.endsWith(`/${normalizedTarget}`) ||
        normalizedTarget.endsWith(`/${currentFile}`);
      continue;
    }

    if (capturing) {
      // If line is diff content (hunk header, addition, deletion, context, or no newline warning)
      if (
        line.startsWith('@@') ||
        line.startsWith('+') ||
        line.startsWith('-') ||
        line.startsWith(' ') ||
        line.startsWith('\\')
      ) {
        hunksForFile.push(line);
      }
    }
  }

  return hunksForFile.join('\n').trim();
}

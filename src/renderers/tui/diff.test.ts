import { extractFileDiffHunk } from './diff.js';

describe('renderers:tui:diff', () => {
  const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,4 +10,4 @@ export function login() {
-  const token = 'insecure';
+  const token = generateSecureToken();
   return token;
 }
diff --git a/src/utils.ts b/src/utils.ts
index 3333333..4444444 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,2 +1,2 @@
-const x = 1;
+const x = 2;
`;

  it('extracts diff hunk matching filePath from multi-file git diff', () => {
    const hunk = extractFileDiffHunk(sampleDiff, 'src/auth.ts');
    expect(hunk).toContain('@@ -10,4 +10,4 @@');
    expect(hunk).toContain("-  const token = 'insecure';");
    expect(hunk).toContain('+  const token = generateSecureToken();');
    expect(hunk).not.toContain('src/utils.ts');
    expect(hunk).not.toContain('const x = 2;');
  });

  it('extracts hunk when target path has leading slashes or relative prefixes', () => {
    const hunk = extractFileDiffHunk(sampleDiff, './src/utils.ts');
    expect(hunk).toContain('@@ -1,2 +1,2 @@');
    expect(hunk).toContain('+const x = 2;');
    expect(hunk).not.toContain('login');
  });

  it('returns empty string when filePath is not present in diff', () => {
    const hunk = extractFileDiffHunk(sampleDiff, 'src/nonexistent.ts');
    expect(hunk).toBe('');
  });

  it('returns empty string on empty input', () => {
    expect(extractFileDiffHunk('', 'src/auth.ts')).toBe('');
    expect(extractFileDiffHunk(sampleDiff, '')).toBe('');
  });
});

import { describe, expect, it } from '@jest/globals';
import type { ParsedFile, Symbol as AnalysisSymbol } from '../analysis/types.js';
import { SymbolIndex } from '../intelligence/index/symbol-index.js';
import { createTestFinding } from './__tests__/mocks.js';
import {
  isDeliberateIntentOrMock,
  parseDiffRanges,
  shouldTriggerSecurityReviewer,
  shouldTriggerSemanticReviewer,
} from './heuristics.js';

function createMockSymbolIndex(
  file: string,
  symbols: Array<Partial<AnalysisSymbol>>
): SymbolIndex {
  const index = new SymbolIndex();
  const parsedSymbols: AnalysisSymbol[] = symbols.map((s, idx) => ({
    id: s.id ?? `sym-${idx}`,
    name: s.name ?? 'testSymbol',
    kind: s.kind ?? 'function',
    file: s.file ?? file,
    range: s.range ?? { startLine: 10, startColumn: 0, endLine: 20, endColumn: 1 },
    exported: s.exported ?? true,
    language: s.language ?? 'typescript',
    references: s.references ?? [],
  }));

  const parsedFile: ParsedFile = {
    file,
    language: 'typescript',
    tree: null,
    symbols: parsedSymbols,
    parseTimeMs: 1,
  };

  index.addFile(parsedFile);
  return index;
}

describe('heuristics', () => {
  describe('parseDiffRanges', () => {
    it('extracts correct intervals from unified diff hunk', () => {
      const diff = `
--- a/src/service.ts
+++ b/src/service.ts
@@ -10,5 +10,12 @@ export function run() {
+  const x = 1;
+  const y = 2;
`;
      const ranges = parseDiffRanges(diff);
      expect(ranges.has('src/service.ts')).toBe(true);
      const intervals = ranges.get('src/service.ts');
      expect(intervals).toEqual([{ start: 10, end: 21 }]);
    });

    it('extracts multiple hunks and multiple files', () => {
      const diff = `
--- a/src/first.ts
+++ b/src/first.ts
@@ -5,2 +5,4 @@
+line1
@@ -20,1 +20,1 @@
-old
+new
--- a/src/second.ts
+++ b/src/second.ts
@@ -100 +100 @@
-test
+test2
`;
      const ranges = parseDiffRanges(diff);
      expect(ranges.get('src/first.ts')).toEqual([
        { start: 5, end: 8 },
        { start: 20, end: 20 },
      ]);
      expect(ranges.get('src/second.ts')).toEqual([{ start: 100, end: 100 }]);
    });

    it('ignores deleted files pointing to /dev/null', () => {
      const diff = `
--- a/src/deleted.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-removed line
`;
      const ranges = parseDiffRanges(diff);
      expect(ranges.size).toBe(0);
    });

    it('returns empty map for empty diff string', () => {
      expect(parseDiffRanges('').size).toBe(0);
      expect(parseDiffRanges('   ').size).toBe(0);
    });
  });

  describe('shouldTriggerSemanticReviewer', () => {
    it('returns true when diff line range intersects function symbol AST range', () => {
      const index = createMockSymbolIndex('src/handler.ts', [
        {
          name: 'handleRequest',
          kind: 'function',
          range: { startLine: 15, startColumn: 0, endLine: 35, endColumn: 1 },
        },
      ]);

      const diff = `
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -20,5 +20,5 @@
+  const updated = true;
`;

      const result = shouldTriggerSemanticReviewer({
        diff,
        changedFiles: ['src/handler.ts'],
        symbolIndex: index,
      });

      expect(result).toBe(true);
    });

    it('returns true when diff intersects method symbol AST range', () => {
      const index = createMockSymbolIndex('src/controller.ts', [
        {
          name: 'processPayment',
          kind: 'method',
          range: { startLine: 50, startColumn: 2, endLine: 75, endColumn: 3 },
        },
      ]);

      const diff = `
--- a/src/controller.ts
+++ b/src/controller.ts
@@ -60,2 +60,4 @@
+  validatePayment();
`;

      const result = shouldTriggerSemanticReviewer({
        diff,
        changedFiles: ['src/controller.ts'],
        symbolIndex: index,
      });

      expect(result).toBe(true);
    });

    it('falls back to true when control flow keywords are added outside indexed functions', () => {
      const index = createMockSymbolIndex('src/script.ts', []);

      const diff = `
--- a/src/script.ts
+++ b/src/script.ts
@@ -100,2 +100,4 @@
+  if (condition) {
+    return value;
+  }
`;

      const result = shouldTriggerSemanticReviewer({
        diff,
        changedFiles: ['src/script.ts'],
        symbolIndex: index,
      });

      expect(result).toBe(true);
    });

    it('returns false when only comments or whitespace are modified without control flow', () => {
      const index = createMockSymbolIndex('src/helper.ts', [
        {
          name: 'helperFn',
          kind: 'function',
          range: { startLine: 10, startColumn: 0, endLine: 20, endColumn: 1 },
        },
      ]);

      const diff = `
--- a/src/helper.ts
+++ b/src/helper.ts
@@ -80,2 +80,2 @@
-// old comment
+// new updated comment
`;

      const result = shouldTriggerSemanticReviewer({
        diff,
        changedFiles: ['src/helper.ts'],
        symbolIndex: index,
      });

      expect(result).toBe(false);
    });

    it('returns false for markdown or CSS files even if containing control flow words', () => {
      const index = new SymbolIndex();
      const diff = `
--- a/README.md
+++ b/README.md
@@ -1,5 +1,6 @@
+# Documentation
+if you want to install, run the command below:
+return value documentation
`;

      const result = shouldTriggerSemanticReviewer({
        diff,
        changedFiles: ['README.md', 'styles.css'],
        symbolIndex: index,
      });

      expect(result).toBe(false);
    });

    it('returns false on empty diff or no files', () => {
      const index = new SymbolIndex();
      expect(
        shouldTriggerSemanticReviewer({
          diff: '',
          changedFiles: ['src/app.ts'],
          symbolIndex: index,
        })
      ).toBe(false);

      expect(
        shouldTriggerSemanticReviewer({
          diff: '+ console.log(1);',
          changedFiles: [],
          symbolIndex: index,
        })
      ).toBe(false);
    });
  });

  describe('shouldTriggerSecurityReviewer', () => {
    it('returns true when package.json or dependency files change', () => {
      const index = new SymbolIndex();
      const result = shouldTriggerSecurityReviewer({
        diff: 'some dependency changes',
        changedFiles: ['package.json'],
        symbolIndex: index,
      });
      expect(result).toBe(true);
    });

    it('returns true when .env files change', () => {
      const index = new SymbolIndex();
      const result = shouldTriggerSecurityReviewer({
        diff: 'FOO=bar',
        changedFiles: ['.env.production'],
        symbolIndex: index,
      });
      expect(result).toBe(true);
    });

    it('returns true when security-sensitive patterns appear in diff', () => {
      const index = new SymbolIndex();
      const securityKeywords = [
        'jwt.verify(token)',
        'crypto.randomBytes(32)',
        'eval(userInput)',
        'req.body.password',
        'fetch("https://api.internal")',
        'child_process.exec(cmd)',
        'dangerouslySetInnerHTML={{ __html: raw }}',
        'if (user.isAdmin)',
      ];

      for (const keyword of securityKeywords) {
        const diff = `+ ${keyword}`;
        const triggered = shouldTriggerSecurityReviewer({
          diff,
          changedFiles: ['src/app.ts'],
          symbolIndex: index,
        });
        expect(triggered).toBe(true);
      }
    });

    it('returns true when referenced symbol name touches security pattern', () => {
      const index = createMockSymbolIndex('src/auth.ts', [
        {
          name: 'validateAuthSession',
          kind: 'function',
          range: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 },
        },
      ]);

      const result = shouldTriggerSecurityReviewer({
        diff: '+ const x = 1;',
        changedFiles: ['src/auth.ts'],
        symbolIndex: index,
      });

      expect(result).toBe(true);
    });

    it('returns false for benign code changes without security keywords or dep changes', () => {
      const index = createMockSymbolIndex('src/math.ts', [
        {
          name: 'addNumbers',
          kind: 'function',
          range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 0 },
        },
      ]);

      const diff = `
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,3 @@
-const sum = a + b;
+const sum = a + b + c;
`;

      const result = shouldTriggerSecurityReviewer({
        diff,
        changedFiles: ['src/math.ts'],
        symbolIndex: index,
      });

      expect(result).toBe(false);
    });
  });

  describe('isDeliberateIntentOrMock', () => {
    it('returns true for test and mock paths', () => {
      const mockPaths = [
        'src/__tests__/unit.test.ts',
        'tests/mocks/authService.ts',
        'test/fixtures/users.json',
        'src/dummy_credentials.ts',
        'tests/spec/app.spec.ts',
        'python/test_runner.py',
      ];

      for (const file of mockPaths) {
        const finding = createTestFinding({ file });
        expect(isDeliberateIntentOrMock({ finding })).toBe(true);
      }
    });

    it('returns true when finding text contains intentionality comments', () => {
      const intentComments = [
        'Marked with @deprecated for backward compatibility',
        'Suppressed via @ts-ignore for testing',
        'Using eslint-disable for legacy shim',
        'Annotated with octate:ignore by author',
        'Line ends with # noqa',
      ];

      for (const message of intentComments) {
        const finding = createTestFinding({
          file: 'src/production.ts',
          message,
        });
        expect(isDeliberateIntentOrMock({ finding })).toBe(true);
      }
    });

    it('returns true when diff hunk contains suppression comments', () => {
      const finding = createTestFinding({ file: 'src/production.ts' });
      const diff = `
--- a/src/production.ts
+++ b/src/production.ts
@@ -10,3 +10,4 @@
+// @ts-ignore deliberately bypassing strict check
+legacyCall();
`;
      expect(isDeliberateIntentOrMock({ finding, diff })).toBe(true);
    });

    it('returns false for production finding with no intent comments or mock paths', () => {
      const finding = createTestFinding({
        file: 'src/controllers/order.ts',
        title: 'Unchecked promise rejection',
        message: 'Calling processOrder without try-catch may reject unhandled',
        suggestedFix: 'Wrap call in try-catch block and handle error',
      });

      expect(isDeliberateIntentOrMock({ finding })).toBe(false);
    });
  });
});

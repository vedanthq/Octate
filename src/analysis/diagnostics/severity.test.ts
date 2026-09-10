/**
 * Tests for severity mapping and diagnostic normalization.
 */

import { describe, expect, it } from '@jest/globals';
import { mapSeverity, normalizeDiagnostic } from './severity.js';

describe('Severity Mapping', () => {
  describe('mapSeverity', () => {
    it('should map tsc error to critical', () => {
      expect(mapSeverity('error', 'tsc')).toBe('critical');
    });

    it('should map tsc warning to medium', () => {
      expect(mapSeverity('warning', 'tsc')).toBe('medium');
    });

    it('should map tsc suggestion to low', () => {
      expect(mapSeverity('suggestion', 'tsc')).toBe('low');
    });

    it('should map biome error to critical', () => {
      expect(mapSeverity('error', 'biome')).toBe('critical');
    });

    it('should map biome warning to high', () => {
      expect(mapSeverity('warning', 'biome')).toBe('high');
    });

    it('should map biome info to low', () => {
      expect(mapSeverity('info', 'biome')).toBe('low');
    });

    it('should map ruff ERROR to critical', () => {
      expect(mapSeverity('ERROR', 'ruff')).toBe('critical');
    });

    it('should map ruff WARNING to medium', () => {
      expect(mapSeverity('WARNING', 'ruff')).toBe('medium');
    });

    it('should map mypy error to high', () => {
      expect(mapSeverity('error', 'mypy')).toBe('high');
    });

    it('should map mypy warning to low', () => {
      expect(mapSeverity('warning', 'mypy')).toBe('low');
    });

    it('should map bandit HIGH to critical', () => {
      expect(mapSeverity('HIGH', 'bandit')).toBe('critical');
    });

    it('should map bandit MEDIUM to high', () => {
      expect(mapSeverity('MEDIUM', 'bandit')).toBe('high');
    });

    it('should map bandit LOW to medium', () => {
      expect(mapSeverity('LOW', 'bandit')).toBe('medium');
    });
  });

  describe('normalizeDiagnostic', () => {
    it('should normalize tsc JSON output', () => {
      const raw = {
        fileName: 'test.ts',
        start: { line: 10, character: 5 },
        end: { line: 10, character: 20 },
        category: 'error',
        messageText: "Type 'string' is not assignable to type 'number'",
        code: 2322,
      };
      const result = normalizeDiagnostic(raw, 'tsc');
      expect(result).not.toBeNull();
      expect(result?.file).toBe('test.ts');
      expect(result?.startLine).toBe(10);
      expect(result?.startColumn).toBe(5);
      expect(result?.severity).toBe('critical');
      expect(result?.source).toBe('tsc');
      expect(result?.rule).toBe('2322');
    });

    it('should normalize biome JSON output', () => {
      const raw = {
        filePath: 'test.ts',
        location: {
          start: { line: 5, column: 10 },
          end: { line: 5, column: 25 },
        },
        severity: 'error',
        message: 'Unexpected console statement',
        rule: { id: 'no-console' },
      };
      const result = normalizeDiagnostic(raw, 'biome');
      expect(result).not.toBeNull();
      expect(result?.file).toBe('test.ts');
      expect(result?.startLine).toBe(5);
      expect(result?.severity).toBe('critical');
      expect(result?.source).toBe('biome');
      expect(result?.rule).toBe('no-console');
    });

    it('should normalize ruff JSON output', () => {
      const raw = {
        filename: 'test.py',
        location: { row: 3, column: 1 },
        endLocation: { row: 3, column: 15 },
        code: 'F841',
        message: 'Local variable assigned but never used',
      };
      const result = normalizeDiagnostic(raw, 'ruff');
      expect(result).not.toBeNull();
      expect(result?.file).toBe('test.py');
      expect(result?.startLine).toBe(3);
      expect(result?.severity).toBe('high');
      expect(result?.source).toBe('ruff');
      expect(result?.rule).toBe('F841');
    });

    it('should normalize mypy JSON output', () => {
      const raw = {
        file: 'test.py',
        line: 10,
        column: 5,
        endLine: 10,
        endColumn: 20,
        severity: 'error',
        message: 'Incompatible types in assignment',
        code: 'assignment',
      };
      const result = normalizeDiagnostic(raw, 'mypy');
      expect(result).not.toBeNull();
      expect(result?.file).toBe('test.py');
      expect(result?.startLine).toBe(10);
      expect(result?.severity).toBe('high');
      expect(result?.source).toBe('mypy');
    });

    it('should normalize pyright JSON output', () => {
      const raw = {
        file: 'test.py',
        range: {
          start: { line: 9, character: 4 }, // 0-indexed
          end: { line: 9, character: 19 },
        },
        severity: 'error',
        message: 'Type mismatch',
        rule: 'reportGeneralTypeIssues',
      };
      const result = normalizeDiagnostic(raw, 'pyright');
      expect(result).not.toBeNull();
      expect(result?.file).toBe('test.py');
      expect(result?.startLine).toBe(10); // 0-indexed + 1
      expect(result?.severity).toBe('high');
      expect(result?.source).toBe('pyright');
    });

    it('should normalize bandit JSON output', () => {
      const raw = {
        filename: 'test.py',
        // biome-ignore lint/style/useNamingConvention: bandit JSON uses snake_case
        line_number: 42,
        severity: 'HIGH',
        // biome-ignore lint/style/useNamingConvention: bandit JSON uses snake_case
        issue_text: 'Potential SQL injection',
        // biome-ignore lint/style/useNamingConvention: bandit JSON uses snake_case
        test_id: 'B608',
      };
      const result = normalizeDiagnostic(raw, 'bandit');
      expect(result).not.toBeNull();
      expect(result?.file).toBe('test.py');
      expect(result?.startLine).toBe(42);
      expect(result?.severity).toBe('critical');
      expect(result?.source).toBe('bandit');
      expect(result?.rule).toBe('B608');
    });

    it('should return null for non-actionable diagnostics', () => {
      const raw = {
        messageText: 'Found 5 errors',
        category: 'error',
      };
      const result = normalizeDiagnostic(raw, 'tsc');
      expect(result).toBeNull();
    });

    it('should handle missing fields gracefully', () => {
      const raw = {
        messageText: 'Some error',
      };
      const result = normalizeDiagnostic(raw, 'tsc');
      expect(result).toBeNull();
    });
  });
});

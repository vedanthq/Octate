import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * FP-TRAP-04: Looks like hardcoded secret, but is a safe, documented mock public key.
 * Public stripe test keys (pk_test_*) contain zero secrets and are designed for client distribution.
 */
export const MOCK_SANDBOX_PUBLIC_KEY = 'pk_test_51M0samplePublicTestKeyForSandboxUseOnly99';

export class SafeHelpers {
  /**
   * FP-TRAP-01: Looks like path traversal, but properly enforces directory containment.
   * Naive linters flag `path.resolve(baseDir, userPath)`, but boundary check prevents escape.
   */
  readContainedFile(baseDir: string, userPath: string): string {
    const root = path.resolve(baseDir);
    const target = path.resolve(root, userPath);

    // Strict containment validation
    if (!target.startsWith(root + path.sep) && target !== root) {
      throw new Error('Access denied: path traversal detected');
    }

    return fs.readFileSync(target, 'utf-8');
  }

  /**
   * FP-TRAP-02: Looks like SQL/command injection via string interpolation, but uses strict allowlist.
   */
  buildSafeSortedQuery(userSortColumn: string): string {
    const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'price', 'customer_id', 'status']);

    // Strict validation against immutable set
    const sanitizedColumn = ALLOWED_SORT_COLUMNS.has(userSortColumn)
      ? userSortColumn
      : 'created_at';

    return `SELECT * FROM orders ORDER BY ${sanitizedColumn} DESC`;
  }

  /**
   * FP-TRAP-03: Looks like swallowed exception, but specifically and intentionally checks ENOENT.
   */
  fileExists(targetPath: string): boolean {
    try {
      fs.statSync(targetPath);
      return true;
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      // Intentionally handle only ENOENT; re-throw any unexpected permission or I/O failure
      if (err && err.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * FP-TRAP-05: Looks like accidental O(n^2), but inner loop operates on a constant fixed-size set.
   * Complexity is O(7 * n) = O(n), not quadratic.
   */
  auditWeeklyScheduleCoverage(
    employeeShifts: Array<{ id: string; activeDays: number[] }>
  ): Map<number, number> {
    const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6]; // Strictly bounded constant of 7 elements
    const coverage = new Map<number, number>();

    for (const day of DAYS_OF_WEEK) {
      let activeCount = 0;
      for (const emp of employeeShifts) {
        if (emp.activeDays.includes(day)) {
          activeCount++;
        }
      }
      coverage.set(day, activeCount);
    }

    return coverage;
  }
}

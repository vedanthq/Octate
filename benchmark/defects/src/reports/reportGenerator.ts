import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export interface ReportUser {
  id: string;
  name: string;
  tags: string[];
}

export class ReportGenerator {
  /**
   * PERF-01: Accidental O(n^2) complexity
   * Nested array search using `includes` inside `filter` on every item instead of using a Set.
   */
  findCommonTags(groupA: ReportUser[], groupB: ReportUser[]): string[] {
    const common: string[] = [];

    // Bug PERF-01: Quadratic complexity due to nested linear scan across unindexed arrays
    for (const userA of groupA) {
      for (const tagA of userA.tags) {
        for (const userB of groupB) {
          if (userB.tags.includes(tagA) && !common.includes(tagA)) {
            common.push(tagA);
          }
        }
      }
    }

    return common;
  }

  /**
   * PERF-02: Repeated expensive computation
   * Re-compiles RegExp and re-computes static cryptographic HMAC inside high-frequency loop.
   */
  validateLogRecords(rawEntries: string[], secretSalt: string): boolean[] {
    return rawEntries.map((entry) => {
      // Bug PERF-02: Expensive RegExp compilation repeated on every entry instead of hoisting
      const logPattern = new RegExp('^\\[(INFO|WARN|ERROR)\\]\\s+\\d{4}-\\d{2}-\\d{2}:\\s+(.*)$');

      // Bug PERF-02: Redundant repeated HMAC computation of identical static secret on every item
      const hmac = crypto.createHmac('sha256', secretSalt).update('STATIC_LOG_HEADER').digest('hex');

      return logPattern.test(entry) && entry.includes(hmac.slice(0, 4));
    });
  }

  /**
   * PERF-03: Unnecessary filesystem work in loop
   * Repeatedly reads identical static template file from disk inside loop for every record.
   */
  generateUserStatements(users: ReportUser[], templatePath: string): string[] {
    const statements: string[] = [];

    for (const user of users) {
      // Bug PERF-03: Disk I/O performed synchronously on every single loop iteration
      const template = fs.readFileSync(templatePath, 'utf-8');
      statements.push(template.replace('{{USER}}', user.name));
    }

    return statements;
  }
}

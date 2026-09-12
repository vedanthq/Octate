import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export interface ReportUser {
  id: string;
  name: string;
  tags: string[];
}

export class ReportGenerator {
  /**
   * PERF-01 (RESOLVED): Accidental O(n^2) complexity
   * Pre-indexes lookup tags into a Set for linear O(N + M) complexity.
   */
  findCommonTags(groupA: ReportUser[], groupB: ReportUser[]): string[] {
    const groupBTags = new Set<string>();
    for (const userB of groupB) {
      for (const tag of userB.tags) {
        groupBTags.add(tag);
      }
    }

    const common = new Set<string>();
    for (const userA of groupA) {
      for (const tag of userA.tags) {
        if (groupBTags.has(tag)) {
          common.add(tag);
        }
      }
    }

    return Array.from(common);
  }

  /**
   * PERF-02 (RESOLVED): Repeated expensive computation
   * Hoists static RegExp and cryptographic HMAC prefix computation outside the map loop.
   */
  validateLogRecords(rawEntries: string[], secretSalt: string): boolean[] {
    const logPattern = /^\[(INFO|WARN|ERROR)\]\s+\d{4}-\d{2}-\d{2}:\s+(.*)$/;
    const expectedHmacPrefix = crypto
      .createHmac('sha256', secretSalt)
      .update('STATIC_LOG_HEADER')
      .digest('hex')
      .slice(0, 4);

    return rawEntries.map((entry) => logPattern.test(entry) && entry.includes(expectedHmacPrefix));
  }

  /**
   * PERF-03 (RESOLVED): Unnecessary filesystem work in loop
   * Hoists static template file read outside the loop to eliminate redundant disk I/O.
   */
  generateUserStatements(users: ReportUser[], templatePath: string): string[] {
    const template = fs.readFileSync(templatePath, 'utf-8');
    return users.map((user) => template.replace('{{USER}}', user.name));
  }
}

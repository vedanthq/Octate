import { execFileSync } from 'node:child_process';

export class SystemTools {
  /**
   * SEC-01 (RESOLVED): Command injection vulnerability
   * Uses argument array via execFileSync and strict regex validation to eliminate shell execution risks.
   */
  createBackupArchive(targetDirectory: string, outputArchiveName: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(outputArchiveName)) {
      throw new Error(
        'Invalid archive name: must contain only alphanumeric characters, underscores, or dashes'
      );
    }
    const outputFile = `/tmp/${outputArchiveName}.tar.gz`;
    return execFileSync('tar', ['-czf', outputFile, '-C', targetDirectory, '.'], {
      encoding: 'utf-8',
    });
  }
}

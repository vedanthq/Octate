import { execSync } from 'node:child_process';

export class SystemTools {
  /**
   * SEC-01: Command injection vulnerability
   * Executes system shell commands using unescaped string interpolation of external input.
   */
  createBackupArchive(targetDirectory: string, outputArchiveName: string): string {
    // Bug SEC-01: outputArchiveName can inject malicious shell commands (e.g. "archive; cat /etc/passwd")
    const command = `tar -czf /tmp/${outputArchiveName}.tar.gz -C ${targetDirectory} .`;
    return execSync(command, { encoding: 'utf-8' });
  }
}

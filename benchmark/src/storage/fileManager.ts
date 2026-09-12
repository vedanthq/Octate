import * as fs from 'node:fs';
import * as path from 'node:path';

export class FileManager {
  private uploadDir: string;

  constructor(baseUploadDir: string) {
    this.uploadDir = path.resolve(baseUploadDir);
  }

  /**
   * SEC-02: Path traversal vulnerability
   * Directly joins user-controlled filename with upload directory without containment validation.
   */
  readUploadedDocument(userFilename: string): Buffer {
    // Bug SEC-02: User input can contain "../../../etc/passwd" to escape upload directory
    const targetPath = path.join(this.uploadDir, userFilename);
    return fs.readFileSync(targetPath);
  }

  /**
   * REL-01: Swallowed exception
   * Catches errors during file deletion and completely swallows them without logging or handling.
   */
  cleanupTemporaryFile(filePath: string): void {
    try {
      // Bug REL-01: File deletion failure is swallowed silently
      fs.unlinkSync(filePath);
    } catch (_err) {
      // Completely swallowed exception - hides critical I/O, lock, or permission errors
    }
  }

  /**
   * REL-03: Resource leak (unclosed file descriptor)
   * Opens file descriptor but does not ensure closure inside a `finally` block on error.
   */
  inspectFileHeader(filePath: string): Buffer {
    // Bug REL-03: File descriptor leaked if readSync throws before closeSync
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(128);
    fs.readSync(fd, buffer, 0, 128, 0);
    fs.closeSync(fd);
    return buffer;
  }
}

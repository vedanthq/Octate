import * as fs from 'node:fs';
import * as path from 'node:path';

export class FileManager {
  private uploadDir: string;

  constructor(baseUploadDir: string) {
    this.uploadDir = path.resolve(baseUploadDir);
  }

  /**
   * SEC-02 (RESOLVED): Path traversal vulnerability
   * Enforces directory containment check and basename normalization to prevent escaping uploadDir.
   */
  readUploadedDocument(userFilename: string): Buffer {
    const safeName = path.basename(userFilename);
    const targetPath = path.resolve(this.uploadDir, safeName);
    if (!targetPath.startsWith(this.uploadDir + path.sep) && targetPath !== this.uploadDir) {
      throw new Error('Access denied: path traversal detected');
    }
    return fs.readFileSync(targetPath);
  }

  /**
   * REL-01 (RESOLVED): Swallowed exception
   * Inspects error code and alerts on unexpected filesystem or permission errors.
   */
  cleanupTemporaryFile(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        process.stderr.write(`[WARN] Failed to delete temporary file ${filePath}: ${err?.message}\n`);
      }
    }
  }

  /**
   * REL-03 (RESOLVED): Resource leak (unclosed file descriptor)
   * Guaranteed file descriptor closure using a try-finally block.
   */
  inspectFileHeader(filePath: string): Buffer {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(128);
      fs.readSync(fd, buffer, 0, 128, 0);
      return buffer;
    } finally {
      fs.closeSync(fd);
    }
  }
}

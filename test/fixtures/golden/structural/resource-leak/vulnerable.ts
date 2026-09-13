import fs from "node:fs";

/**
 * File streaming utility.
 */
export function checkFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function streamFileData(filePath: string, onData: (chunk: Buffer) => void): void {
  // Vulnerable: Stream without close/error cleanup leaks file descriptor
  const stream = fs.createReadStream(filePath);
  stream.on("data", (chunk) => {
    onData(chunk as Buffer);
  });
}

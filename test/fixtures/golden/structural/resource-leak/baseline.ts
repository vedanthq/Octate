import fs from "node:fs";

/**
 * File streaming utility.
 */
export function checkFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

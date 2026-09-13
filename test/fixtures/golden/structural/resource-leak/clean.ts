import fs from "node:fs";

/**
 * File streaming utility.
 */
export function checkFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export async function streamFileData(
  filePath: string,
  onData: (chunk: Buffer) => void
): Promise<void> {
  const stream = fs.createReadStream(filePath);
  try {
    for await (const chunk of stream) {
      onData(chunk as Buffer);
    }
  } finally {
    stream.destroy();
  }
}

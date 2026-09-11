import fs from 'node:fs';

/**
 * File streaming utility with explicit lifecycle cleanup.
 */
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

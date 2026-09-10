import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROMPT_FALLBACKS } from './fallbacks.js';

/**
 * In-memory cache for loaded prompt templates.
 */
const promptCache = new Map<string, string>();

let activeReader: (path: string, encoding: 'utf-8') => Promise<string> = readFile;

/**
 * Sets a custom file reader for loading prompt templates.
 * Primarily used for testing without mutating ESM module namespaces.
 */
export function setPromptFileReader(
  reader: (path: string, encoding: 'utf-8') => Promise<string>
): void {
  activeReader = reader;
}

/**
 * Resets the file reader to node:fs/promises.readFile.
 */
export function resetPromptFileReader(): void {
  activeReader = readFile;
}

/**
 * Loads a versioned prompt template by name (e.g. 'reviewer.structural.v1').
 * First checks in-memory cache, then reads from markdown file on disk.
 * If file read fails or file is not found, falls back to embedded PROMPT_FALLBACKS.
 *
 * @param name - Template identifier (without .md extension)
 * @returns Promise resolving to the raw template markdown string
 * @throws Error if template is unknown and no fallback exists
 */
export async function loadPromptTemplate(name: string): Promise<string> {
  const cached = promptCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  let content: string | undefined;

  try {
    const filePath = resolve(import.meta.dirname, `${name}.md`);
    content = await activeReader(filePath, 'utf-8');
  } catch {
    // If reading from disk fails (e.g. bundled build or missing file), try fallbacks
    if (Object.hasOwn(PROMPT_FALLBACKS, name)) {
      content = PROMPT_FALLBACKS[name];
    }
  }

  if (content === undefined) {
    if (Object.hasOwn(PROMPT_FALLBACKS, name)) {
      content = PROMPT_FALLBACKS[name];
    }
  }

  if (content === undefined) {
    throw new Error(`Unknown prompt template: ${name}`);
  }

  promptCache.set(name, content);
  return content;
}

/**
 * Clears the in-memory prompt template cache.
 * Useful for tests.
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

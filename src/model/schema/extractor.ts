/**
 * Robust JSON extraction and parsing utilities for LLM outputs.
 * Handles markdown code fences, preambles/conversational chatter, and trailing commas.
 */

/**
 * Extracts a candidate JSON string from raw model output.
 * - Extracts content from markdown code fences if present (` ```json ... ``` `).
 * - Finds the outermost object `{...}` or array `[...]` boundary if commentary surrounds it.
 * - Cleans trailing commas before closing braces/brackets.
 *
 * @param rawText - The raw response string from the model
 * @returns Cleaned JSON candidate string
 */
export function extractJsonFromText(rawText: string): string {
  if (!rawText) {
    return '';
  }

  let text = rawText.trim();

  // 1. Check for markdown code fences
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const fenceMatch = fenceRegex.exec(text);
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim();
  }

  // 2. Find outermost JSON boundaries ({...} or [...])
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startIndex = -1;
  let endIndex = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      startIndex = firstBrace;
      endIndex = lastBrace + 1;
    }
  } else if (firstBracket !== -1) {
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      startIndex = firstBracket;
      endIndex = lastBracket + 1;
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    text = text.slice(startIndex, endIndex).trim();
  }

  // 3. Remove trailing commas before closing brackets or braces
  // Matches comma followed by whitespace and then } or ]
  text = text.replace(/,(\s*[}\]])/g, '$1');

  return text;
}

/**
 * Safely parses a potentially malformed or conversational JSON string.
 *
 * @param rawText - Raw text containing JSON
 * @returns Result object with parsed data on success, or Error on failure
 */
export function safeJsonParse<T = unknown>(
  rawText: string
): { success: true; data: T } | { success: false; error: Error } {
  try {
    const extracted = extractJsonFromText(rawText);
    if (!extracted) {
      return {
        success: false,
        error: new Error('No JSON structure found in text'),
      };
    }
    try {
      const data = JSON.parse(extracted) as T;
      return { success: true, data };
    } catch (parseErr) {
      try {
        // Fallback: convert single quotes around keys/strings to double quotes
        const singleQuoteFixed = extracted.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
        const data = JSON.parse(singleQuoteFixed) as T;
        return { success: true, data };
      } catch {
        // Fall through to original parse error
      }
      throw parseErr;
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

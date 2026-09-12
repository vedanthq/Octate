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
  let firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  // If there's a spurious duplicate leading brace (e.g. "{\n{" or "{\n  {\"findings\""),
  // skip past the initial spurious '{' to the actual JSON root.
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    while (firstBrace !== -1) {
      const rest = text.slice(firstBrace + 1).trimStart();
      if (rest.startsWith('{')) {
        firstBrace = text.indexOf('{', firstBrace + 1);
      } else {
        break;
      }
    }
  }

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
 * Attempts to repair truncated JSON arrays/objects from LLMs when output tokens are exhausted.
 */
export function tryRepairTruncatedJson(str: string): string | null {
  if (!str || typeof str !== 'string') return null;

  // Find the last complete object boundary '}'
  const lastBrace = str.lastIndexOf('}');
  if (lastBrace === -1) return null;

  // Truncate cleanly after the last complete object
  let sliced = str.slice(0, lastBrace + 1).trim();
  sliced = sliced.replace(/,(\s*)$/, '$1');

  // Track unclosed braces and brackets
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < sliced.length; i++) {
    const char = sliced[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        stack.push('}');
      } else if (char === '[') {
        stack.push(']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  if (stack.length === 0) {
    return null;
  }

  // Close remaining unclosed delimiters in reverse order
  const closing = stack.reverse().join('');
  let candidate = `${sliced}\n${closing}`;
  candidate = candidate.replace(/,(\s*[}\]])/g, '$1');

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
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
        // Fallback 1: convert single quotes around keys/strings to double quotes
        const singleQuoteFixed = extracted.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
        const data = JSON.parse(singleQuoteFixed) as T;
        return { success: true, data };
      } catch {
        // Fall through
      }

      try {
        // Fallback 2: repair truncated JSON
        const repaired = tryRepairTruncatedJson(extracted);
        if (repaired) {
          const data = JSON.parse(repaired) as T;
          return { success: true, data };
        }
      } catch {
        // Fall through
      }

      try {
        // Fallback 3: repair truncated JSON with single quotes converted
        const singleQuoteFixed = extracted.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
        const repaired = tryRepairTruncatedJson(singleQuoteFixed);
        if (repaired) {
          const data = JSON.parse(repaired) as T;
          return { success: true, data };
        }
      } catch {
        // Fall through
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

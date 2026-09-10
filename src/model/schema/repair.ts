import type { z } from 'zod';

/**
 * Formats a ZodError into an actionable diagnostic instruction for the model's repair prompt turn.
 *
 * @param error - Zod validation error from previous turn
 * @returns Human/model-readable repair instructions
 */
export function formatZodIssuesForRepairPrompt(error: z.ZodError): string {
  const issuesList = error.issues
    .map((issue) => {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `- Field '${fieldPath}': ${issue.message}`;
    })
    .join('\n');

  return `Your previous JSON response did not match the required schema. Please fix these issues and return valid JSON:\n${issuesList}`;
}

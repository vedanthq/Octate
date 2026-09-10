import path from 'node:path';
import type { ModelEvidence, ModelFinding } from '../types.js';

export interface GroundingContext {
  repoRoot: string;
  getFileLineCount?: (file: string) => Promise<number | null>;
  validFiles?: Set<string>;
}

/**
 * Grounds a single finding:
 * - Checks for path traversal (rejects paths containing `..` or leading `/`)
 * - Normalizes file path to relative path
 * - Validates file existence against validFiles if provided
 * - Validates and clamps startLine and endLine against actual file lines if getFileLineCount is provided
 * - Drops phantom findings where startLine > totalLines
 * - Also grounds evidence line ranges if getFileLineCount is provided
 */
export async function groundFinding(
  finding: ModelFinding,
  ctx: GroundingContext
): Promise<ModelFinding | null> {
  // Reject path traversal and absolute paths
  if (
    finding.file.includes('..') ||
    finding.file.startsWith('/') ||
    path.isAbsolute(finding.file)
  ) {
    return null;
  }

  // Normalize path (e.g. ./src/foo.ts -> src/foo.ts)
  const normalizedFile = path.normalize(finding.file).replace(/^[/\\]+/, '');
  if (!normalizedFile || normalizedFile.includes('..')) {
    return null;
  }

  // Check validFiles whitelist if present
  if (ctx.validFiles && !ctx.validFiles.has(normalizedFile)) {
    return null;
  }

  const startLine = finding.startLine;
  let endLine = finding.endLine;

  if (ctx.getFileLineCount) {
    const totalLines = await ctx.getFileLineCount(normalizedFile);
    if (totalLines !== null && totalLines !== undefined) {
      if (startLine > totalLines) {
        // Phantom finding beyond end of file
        return null;
      }
      endLine = Math.min(endLine, totalLines);
      if (endLine < startLine) {
        endLine = startLine;
      }
    }
  }

  // Ground evidence items
  const groundedEvidence: ModelEvidence[] = [];
  for (const ev of finding.evidence) {
    if (ev.file.includes('..') || ev.file.startsWith('/') || path.isAbsolute(ev.file)) {
      continue;
    }
    const evFile = path.normalize(ev.file).replace(/^[/\\]+/, '');
    if (ctx.validFiles && !ctx.validFiles.has(evFile)) {
      continue;
    }

    const evStart = ev.startLine;
    let evEnd = ev.endLine;

    if (ctx.getFileLineCount) {
      const evTotal = await ctx.getFileLineCount(evFile);
      if (evTotal !== null && evTotal !== undefined) {
        if (evStart > evTotal) {
          continue;
        }
        evEnd = Math.min(evEnd, evTotal);
        if (evEnd < evStart) {
          evEnd = evStart;
        }
      }
    }

    groundedEvidence.push({
      ...ev,
      file: evFile,
      startLine: evStart,
      endLine: evEnd,
    });
  }

  return {
    ...finding,
    file: normalizedFile,
    startLine,
    endLine,
    evidence: groundedEvidence,
  };
}

/**
 * Grounds an array of findings concurrently, dropping invalid or phantom findings.
 */
export async function groundFindings(
  findings: ModelFinding[],
  ctx: GroundingContext
): Promise<ModelFinding[]> {
  const results = await Promise.all(findings.map((f) => groundFinding(f, ctx)));
  return results.filter((f): f is ModelFinding => f !== null);
}

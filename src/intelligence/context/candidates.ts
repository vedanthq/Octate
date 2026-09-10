/**
 * Candidate item generation and priority scoring for Context Engine.
 * Assigns deterministic priority scores:
 * - changed-symbol: 100
 * - caller / callee: 90
 * - related-type / test: 80
 * - diagnostic: 75
 * - config: 60
 * - history: 40
 */

import path from 'node:path';
import type { Diagnostic } from '../../model/types.js';
import type { ReferenceGraph } from '../graph/reference.js';
import type { SymbolIndex } from '../index/symbol-index.js';
import type { CandidateItem, CandidateType } from '../types.js';
import { windowSnippet } from './windowing.js';

export function scoreCandidate(type: CandidateType): number {
  switch (type) {
    case 'changed-symbol':
      return 100;
    case 'caller':
    case 'callee':
      return 90;
    case 'related-type':
    case 'test':
      return 80;
    case 'diagnostic':
      return 75;
    case 'config':
      return 60;
    case 'history':
      return 40;
  }
}

export interface CandidateCollectParams {
  changedFiles: string[];
  diff?: string | undefined;
  symbolIndex: SymbolIndex;
  referenceGraph: ReferenceGraph;
  diagnostics?: Diagnostic[] | undefined;
  readFile: (filePath: string) => Promise<string>;
}

export class CandidateCollector {
  /**
   * Collects all candidate items relevant to changed files and diff.
   */
  public async collect(params: CandidateCollectParams): Promise<CandidateItem[]> {
    const { changedFiles, diff, symbolIndex, referenceGraph, diagnostics, readFile } = params;

    const candidatesById = new Map<string, CandidateItem>();
    const diffRangesByFile = diff ? this.parseDiffRanges(diff) : new Map();

    const changedSymbolIds = new Set<string>();

    // 1. Changed symbols (score 100)
    for (const file of changedFiles) {
      const normFile = path.normalize(file);
      let content = '';
      try {
        content = await readFile(normFile);
      } catch {
        continue;
      }

      const fileSymbols = symbolIndex.getFileSymbols(normFile);
      const changedRanges = diffRangesByFile.get(normFile);

      for (const sym of fileSymbols) {
        // If diff ranges exist, verify symbol overlaps diff; otherwise include all symbols in changed file
        const isModified =
          !changedRanges ||
          changedRanges.some(
            (r: { start: number; end: number }) =>
              sym.range.startLine <= r.end && sym.range.endLine >= r.start
          );

        if (isModified) {
          changedSymbolIds.add(sym.id);
          const snippet = windowSnippet(content, sym.range.startLine, 10);
          candidatesById.set(sym.id, {
            id: sym.id,
            file: normFile,
            startLine: sym.range.startLine,
            endLine: sym.range.endLine,
            content: snippet,
            score: scoreCandidate('changed-symbol'),
            type: 'changed-symbol',
            reason: `Changed symbol ${sym.name} in ${normFile}`,
          });
        }
      }
    }

    // 2. Callers and Callees (score 90, 1-hop, capped to 10)
    for (const symId of changedSymbolIds) {
      const symEntry = symbolIndex.getSymbol(symId);
      const symName = symEntry?.symbol.name ?? symId;

      // 1-hop Callers
      const callers = referenceGraph.getCallers(symId, 10);
      for (const callerEdge of callers) {
        const callerNode = referenceGraph.getNode(callerEdge.to);
        const callerFile =
          callerEdge.metadata?.file ?? callerNode?.path ?? callerNode?.symbol?.file;
        if (!callerFile) continue;

        const normCallerFile = path.normalize(callerFile);
        let callerContent = '';
        try {
          callerContent = await readFile(normCallerFile);
        } catch {
          continue;
        }

        const callerLine = callerEdge.metadata?.line ?? callerNode?.symbol?.range.startLine ?? 1;
        const snippet = windowSnippet(callerContent, callerLine, 10);
        const candidateId = `caller:${callerEdge.to}:${symId}`;

        if (!candidatesById.has(candidateId)) {
          candidatesById.set(candidateId, {
            id: candidateId,
            file: normCallerFile,
            startLine: Math.max(1, callerLine - 10),
            endLine: callerLine + 10,
            content: snippet,
            score: scoreCandidate('caller'),
            type: 'caller',
            reason: `Direct caller of ${symName}`,
          });
        }
      }

      // 1-hop Callees
      const callees = referenceGraph.getCallees(symId);
      for (const calleeEdge of callees) {
        const calleeNode = referenceGraph.getNode(calleeEdge.to);
        const calleeFile =
          calleeEdge.metadata?.file ?? calleeNode?.path ?? calleeNode?.symbol?.file;
        if (!calleeFile) continue;

        const normCalleeFile = path.normalize(calleeFile);
        let calleeContent = '';
        try {
          calleeContent = await readFile(normCalleeFile);
        } catch {
          continue;
        }

        const calleeLine = calleeEdge.metadata?.line ?? calleeNode?.symbol?.range.startLine ?? 1;
        const snippet = windowSnippet(calleeContent, calleeLine, 10);
        const candidateId = `callee:${symId}:${calleeEdge.to}`;

        if (!candidatesById.has(candidateId)) {
          candidatesById.set(candidateId, {
            id: candidateId,
            file: normCalleeFile,
            startLine: Math.max(1, calleeLine - 10),
            endLine: calleeLine + 10,
            content: snippet,
            score: scoreCandidate('callee'),
            type: 'callee',
            reason: `Direct callee called by ${symName}`,
          });
        }
      }

      // 3. Implementations and related types (score 80)
      const impls = referenceGraph.getImplementations(symId);
      for (const implEdge of impls) {
        const implNode = referenceGraph.getNode(implEdge.to);
        const implFile = implEdge.metadata?.file ?? implNode?.path ?? implNode?.symbol?.file;
        if (!implFile) continue;

        const normImplFile = path.normalize(implFile);
        let implContent = '';
        try {
          implContent = await readFile(normImplFile);
        } catch {
          continue;
        }

        const implLine = implEdge.metadata?.line ?? implNode?.symbol?.range.startLine ?? 1;
        const snippet = windowSnippet(implContent, implLine, 10);
        const candidateId = `impl:${implEdge.to}:${symId}`;

        if (!candidatesById.has(candidateId)) {
          candidatesById.set(candidateId, {
            id: candidateId,
            file: normImplFile,
            startLine: Math.max(1, implLine - 10),
            endLine: implLine + 10,
            content: snippet,
            score: scoreCandidate('related-type'),
            type: 'related-type',
            reason: `Implementation of ${symName}`,
          });
        }
      }
    }

    // 4. Tests associated with changed files (score 80)
    for (const file of changedFiles) {
      const normFile = path.normalize(file);
      const testFiles = referenceGraph.getTestsForFile(normFile);

      for (const testFile of testFiles) {
        const normTestFile = path.normalize(testFile);
        let testContent = '';
        try {
          testContent = await readFile(normTestFile);
        } catch {
          continue;
        }

        const snippet = windowSnippet(testContent, 20, 20);
        const candidateId = `test:${normTestFile}:${normFile}`;

        if (!candidatesById.has(candidateId)) {
          candidatesById.set(candidateId, {
            id: candidateId,
            file: normTestFile,
            startLine: 1,
            endLine: 40,
            content: snippet,
            score: scoreCandidate('test'),
            type: 'test',
            reason: `Associated test file for ${normFile}`,
          });
        }
      }
    }

    // 5. Diagnostics (score 75)
    if (diagnostics && diagnostics.length > 0) {
      for (let i = 0; i < diagnostics.length; i++) {
        const d = diagnostics[i];
        if (!d) continue;

        const ruleOrIdx = d.rule ?? String(i);
        const candidateId = `diagnostic:${d.file}:${d.startLine}:${ruleOrIdx}`;
        const formatted = `[${d.source.toUpperCase()}] ${d.severity.toUpperCase()} ${d.file}:${d.startLine}:${d.startColumn} - ${d.message}${d.rule ? ` (${d.rule})` : ''}`;

        if (!candidatesById.has(candidateId)) {
          candidatesById.set(candidateId, {
            id: candidateId,
            file: d.file,
            startLine: d.startLine,
            endLine: d.endLine,
            content: formatted,
            score: scoreCandidate('diagnostic'),
            type: 'diagnostic',
            reason: `Static analysis warning from ${d.source}`,
          });
        }
      }
    }

    return Array.from(candidatesById.values());
  }

  /**
   * Parses unified git diff to extract modified line intervals per file.
   */
  private parseDiffRanges(diff: string): Map<string, Array<{ start: number; end: number }>> {
    const rangesByFile = new Map<string, Array<{ start: number; end: number }>>();
    const lines = diff.split('\n');
    let currentFile = '';

    for (const line of lines) {
      if (line.startsWith('diff --git a/')) {
        const parts = line.split(' b/');
        if (parts.length >= 2 && parts[1]) {
          currentFile = path.normalize(parts[1].trim());
        }
      } else if (line.startsWith('+++ b/')) {
        const filePath = line.slice(6).trim();
        if (filePath) {
          currentFile = path.normalize(filePath);
        }
      } else if (line.startsWith('@@ ') && currentFile) {
        const match = line.match(/@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (match) {
          const start = parseInt(match[1] ?? '1', 10);
          const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
          const end = start + Math.max(1, count) - 1;

          const ranges = rangesByFile.get(currentFile) ?? [];
          ranges.push({ start, end });
          rangesByFile.set(currentFile, ranges);
        }
      }
    }

    return rangesByFile;
  }
}

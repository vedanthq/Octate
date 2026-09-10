/**
 * Multi-Factor Finding Deduplication Engine & Evidence Merging.
 *
 * Implements two-phase deduplication:
 * 1. Pre-Critic Syntactic Clustering (D-12): Merges overlapping line intervals in the same file to reduce prompt token footprint.
 * 2. Post-Critic Consolidation (D-09): Multi-factor duplicate matching across line overlap, enclosing AST symbol, and root-cause signatures.
 * 3. Attribute Conflict Resolution (D-10, D-11): Escalates to highest severity, selects maximum confidence, unions/caps evidence at 5 items, and records contributing reviewers.
 */

import path from 'node:path';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ModelEvidence, ModelFinding } from '../model/types.js';
import type { ReviewSeverity } from './types.js';

const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const ORDER_TO_SEVERITY: Record<number, ReviewSeverity> = {
  5: 'critical',
  4: 'high',
  3: 'medium',
  2: 'low',
  1: 'info',
};

/**
 * Finding enriched with contributing reviewers metadata.
 */
export interface DeduplicatedFinding extends ModelFinding {
  contributingReviewers?: string[];
}

/**
 * Normalizes title string by stripping punctuation, canonicalizing defect terms,
 * and collapsing whitespace.
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  let norm = title.toLowerCase();

  // Canonicalize common defect phrases
  norm = norm
    .replace(
      /\b(null\s*pointer|null\s*dereference|nil\s*pointer|null\s*check|null\s*reference)\b/g,
      'null pointer'
    )
    .replace(/\b(sql\s*injection|sqli)\b/g, 'sql injection')
    .replace(
      /\b(unhandled\s*error|unhandled\s*exception|unhandled\s*promise\s*rejection|missing\s*error\s*handling)\b/g,
      'unhandled error'
    )
    .replace(
      /\b(resource\s*leak|memory\s*leak|unclosed\s*connection|unclosed\s*file|handle\s*leak)\b/g,
      'resource leak'
    )
    .replace(/\b(cross\s*site\s*scripting|xss)\b/g, 'xss')
    .replace(/\b(remote\s*code\s*execution|rce)\b/g, 'rce')
    .replace(/\b(path\s*traversal|directory\s*traversal)\b/g, 'path traversal');

  // Strip non-alphanumeric characters
  norm = norm.replace(/[^a-z0-9\s]/g, ' ');

  // Collapse whitespace
  norm = norm.replace(/\s+/g, ' ').trim();

  return norm;
}

/**
 * Finds the innermost AST symbol in the given file that encloses the given line.
 */
function getEnclosingSymbol(
  filePath: string,
  line: number,
  symbolIndex?: SymbolIndex
): string | null {
  if (!symbolIndex) return null;
  const symbols = symbolIndex.getFileSymbols(path.normalize(filePath));
  let innermost: { id: string; span: number } | null = null;

  for (const sym of symbols) {
    if (sym.range && sym.range.startLine <= line && sym.range.endLine >= line) {
      const span = sym.range.endLine - sym.range.startLine;
      if (!innermost || span < innermost.span) {
        innermost = { id: sym.id || sym.name, span };
      }
    }
  }

  return innermost ? innermost.id : null;
}

/**
 * Merges a cluster of duplicate findings into a single consolidated finding.
 *
 * Implements attribute conflict resolution:
 * - Severity: Escalates to highest severity in cluster (critical > high > medium > low > info)
 * - Confidence: Takes maximum confidence across cluster
 * - Contributing Reviewers: Aggregates unique reviewers from cluster
 * - Representative Content: Picks title, message, and suggestedFix from highest confidence finding
 * - Evidence: Unions unique file:startLine:endLine evidence anchors, strictly capped at 5 items (D-11)
 * - Related Files & Symbols: Unions unique entries
 */
export function mergeFindingCluster(cluster: ModelFinding[]): DeduplicatedFinding {
  if (cluster.length === 0) {
    throw new Error('Cannot merge empty finding cluster');
  }

  const firstFinding = cluster[0];
  if (!firstFinding) {
    throw new Error('Invalid cluster state: first finding undefined');
  }

  if (cluster.length === 1) {
    const single = firstFinding;
    const reviewers = new Set<string>();
    if (single.reviewer) reviewers.add(single.reviewer);
    const candidateReviewers = (single as DeduplicatedFinding).contributingReviewers;
    if (Array.isArray(candidateReviewers)) {
      for (const r of candidateReviewers) {
        if (r) reviewers.add(r);
      }
    }
    if (Array.isArray(single.metadata?.contributingReviewers)) {
      for (const r of single.metadata.contributingReviewers as string[]) {
        if (r) reviewers.add(r);
      }
    }
    const contributingReviewers = Array.from(reviewers);

    // Ensure evidence is deduplicated and capped at 5 items
    const seenEvidence = new Set<string>();
    const uniqueEvidence: ModelEvidence[] = [];
    for (const ev of single.evidence || []) {
      const key = `${path.normalize(ev.file)}:${ev.startLine}:${ev.endLine}`;
      if (!seenEvidence.has(key)) {
        seenEvidence.add(key);
        uniqueEvidence.push({
          ...ev,
          file: path.normalize(ev.file),
        });
      }
    }

    const res: DeduplicatedFinding = {
      ...single,
      file: path.normalize(single.file),
      evidence: uniqueEvidence.slice(0, 5),
      contributingReviewers,
      metadata: {
        ...(single.metadata ?? {}),
        contributingReviewers,
      },
    };
    return res;
  }

  // 1. Escalate severity to highest in cluster
  let maxSeverityRank = 1;
  for (const f of cluster) {
    const rank = SEVERITY_ORDER[f.severity] ?? 1;
    if (rank > maxSeverityRank) {
      maxSeverityRank = rank;
    }
  }
  const highestSeverity = ORDER_TO_SEVERITY[maxSeverityRank] ?? 'info';

  // 2. Maximum confidence
  const maxConfidence = Math.max(...cluster.map((f) => f.confidence));

  // 3. Select representative finding (highest confidence, tie-break by longest message)
  const sorted = [...cluster].sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    const lenB = (b.message || '').length;
    const lenA = (a.message || '').length;
    return lenB - lenA;
  });
  const representative = sorted[0] ?? firstFinding;

  // 4. Contributing reviewers
  const reviewersSet = new Set<string>();
  for (const f of cluster) {
    if (f.reviewer) reviewersSet.add(f.reviewer);
    const cr = (f as DeduplicatedFinding).contributingReviewers;
    if (Array.isArray(cr)) {
      for (const r of cr) {
        if (r) reviewersSet.add(r);
      }
    }
    if (Array.isArray(f.metadata?.contributingReviewers)) {
      for (const r of f.metadata.contributingReviewers as string[]) {
        if (r) reviewersSet.add(r);
      }
    }
  }
  const contributingReviewers = Array.from(reviewersSet);

  // 5. Evidence union and deduplication, capped strictly at 5 items (D-11)
  const seenEvidence = new Set<string>();
  const mergedEvidence: ModelEvidence[] = [];

  for (const f of cluster) {
    for (const ev of f.evidence || []) {
      const key = `${path.normalize(ev.file)}:${ev.startLine}:${ev.endLine}`;
      if (!seenEvidence.has(key)) {
        seenEvidence.add(key);
        mergedEvidence.push({
          ...ev,
          file: path.normalize(ev.file),
        });
      }
    }
  }
  const cappedEvidence = mergedEvidence.slice(0, 5);

  // 6. Union unique relatedFiles and relatedSymbols
  const relatedFiles = Array.from(
    new Set(cluster.flatMap((f) => f.relatedFiles || []).map((f) => path.normalize(f)))
  );
  const relatedSymbols = Array.from(new Set(cluster.flatMap((f) => f.relatedSymbols || [])));

  // 7. Bounding startLine and endLine across overlapping cluster
  const startLine = Math.min(...cluster.map((f) => f.startLine));
  const endLine = Math.max(...cluster.map((f) => f.endLine));

  const mergedFinding: DeduplicatedFinding = {
    ...representative,
    file: path.normalize(representative.file),
    severity: highestSeverity,
    confidence: maxConfidence,
    startLine,
    endLine,
    evidence: cappedEvidence,
    relatedFiles,
    relatedSymbols,
    contributingReviewers,
    metadata: {
      ...(representative.metadata ?? {}),
      contributingReviewers,
    },
  };

  return mergedFinding;
}

/**
 * Disjoint-Set Union (Union-Find) helper for connected component clustering.
 */
class DisjointSet {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    let root = i;
    while (root !== (this.parent[root] ?? root)) {
      root = this.parent[root] ?? root;
    }
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr] ?? root;
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  }
}

/**
 * Clusters findings within a single file using a pairwise matcher function.
 */
function clusterFileFindings(
  findings: ModelFinding[],
  matcher: (a: ModelFinding, b: ModelFinding) => boolean
): DeduplicatedFinding[] {
  if (findings.length <= 1) {
    return findings.map((f) => mergeFindingCluster([f]));
  }

  const dsu = new DisjointSet(findings.length);

  for (let i = 0; i < findings.length; i++) {
    const findingA = findings[i];
    if (!findingA) continue;
    for (let j = i + 1; j < findings.length; j++) {
      const findingB = findings[j];
      if (!findingB) continue;
      if (matcher(findingA, findingB)) {
        dsu.union(i, j);
      }
    }
  }

  const clustersMap = new Map<number, ModelFinding[]>();
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    if (!finding) continue;
    const root = dsu.find(i);
    let group = clustersMap.get(root);
    if (!group) {
      group = [];
      clustersMap.set(root, group);
    }
    group.push(finding);
  }

  return Array.from(clustersMap.values()).map((cluster) => mergeFindingCluster(cluster));
}

/**
 * Partitions findings by normalized file path and applies clustering to each partition.
 */
function partitionAndCluster(
  findings: ModelFinding[],
  matcher: (a: ModelFinding, b: ModelFinding) => boolean
): DeduplicatedFinding[] {
  const byFile = new Map<string, ModelFinding[]>();

  for (const finding of findings) {
    const norm = path.normalize(finding.file);
    let list = byFile.get(norm);
    if (!list) {
      list = [];
      byFile.set(norm, list);
    }
    list.push(finding);
  }

  const result: DeduplicatedFinding[] = [];
  for (const fileFindings of byFile.values()) {
    result.push(...clusterFileFindings(fileFindings, matcher));
  }

  return result;
}

/**
 * Performs initial syntactic clustering on DAG output before invoking Critic (D-12).
 * Collapses exact duplicates and overlapping line intervals in the same file to minimize prompt tokens.
 *
 * @param findings - Candidate findings produced by Reviewer DAG
 * @param _symbolIndex - Optional symbol index (unused in syntactic stage)
 * @returns Deduplicated findings
 */
export function preCriticDeduplicate(
  findings: ModelFinding[],
  _symbolIndex?: SymbolIndex
): DeduplicatedFinding[] {
  if (findings.length <= 1) {
    return findings.map((f) => mergeFindingCluster([f]));
  }

  return partitionAndCluster(findings, (a, b) => {
    // Condition 1: Same file and overlapping line interval
    return Math.max(a.startLine, b.startLine) <= Math.min(a.endLine, b.endLine);
  });
}

/**
 * Performs final multi-factor consolidation pass on Critic output (D-09, D-12).
 * Matches findings sharing:
 * 1. Overlapping line intervals in same file
 * 2. Identical enclosing AST symbol and category
 * 3. Identical normalized title root-cause signature
 *
 * @param findings - Curated findings from Critic stage
 * @param symbolIndex - Optional symbol index for AST symbol resolution
 * @returns Final consolidated findings
 */
export function postCriticConsolidate(
  findings: ModelFinding[],
  symbolIndex?: SymbolIndex
): DeduplicatedFinding[] {
  if (findings.length <= 1) {
    return findings.map((f) => mergeFindingCluster([f]));
  }

  return partitionAndCluster(findings, (a, b) => {
    // Condition 1: Line interval overlap
    if (Math.max(a.startLine, b.startLine) <= Math.min(a.endLine, b.endLine)) {
      return true;
    }

    // Condition 2: Same enclosing AST symbol and category
    if (a.category === b.category && symbolIndex) {
      const symA = getEnclosingSymbol(a.file, a.startLine, symbolIndex);
      const symB = getEnclosingSymbol(b.file, b.startLine, symbolIndex);
      if (symA && symB && symA === symB) {
        return true;
      }
    }

    // Condition 3: Normalized root-cause title signature match
    if (normalizeTitle(a.title) === normalizeTitle(b.title)) {
      return true;
    }

    return false;
  });
}

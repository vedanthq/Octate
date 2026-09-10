/**
 * Intelligence layer domain types.
 */

import type { Symbol as AnalysisSymbol } from '../analysis/types.js';

export interface ImportStatement {
  sourceFile: string;
  specifier: string;
  importedSymbols: Array<{ name: string; alias?: string | undefined }>;
  line: number;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ResolvedImport {
  specifier: string;
  resolvedPath: string | null;
  isExternal: boolean;
  isWorkspace: boolean;
  packageName?: string | undefined;
}

export type EdgeKind =
  | 'calls'
  | 'called_by'
  | 'imports'
  | 'imported_by'
  | 'implements'
  | 'implemented_by'
  | 'tests'
  | 'tested_by'
  | 'routes_to';

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  metadata?:
    | {
        file?: string | undefined;
        line?: number | undefined;
        weight?: number | undefined;
      }
    | undefined;
}

export interface GraphNode {
  id: string;
  kind: 'file' | 'symbol' | 'package';
  name: string;
  path?: string | undefined;
  symbol?: AnalysisSymbol | undefined;
}

export interface SymbolIndexEntry {
  symbol: AnalysisSymbol;
  signature?: string | undefined;
  docstring?: string | undefined;
  implementsInterfaces?: string[] | undefined;
  extendsClasses?: string[] | undefined;
}

export type CandidateType =
  | 'changed-symbol'
  | 'caller'
  | 'callee'
  | 'related-type'
  | 'test'
  | 'config'
  | 'history'
  | 'diagnostic';

export interface CandidateItem {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  type: CandidateType;
  reason: string;
}

export interface ReviewContextMetrics {
  candidateCount: number;
  selectedCount: number;
  candidateTokens: number;
  selectedTokens: number;
  selectionRatio: number;
}

export interface ReviewContext {
  trustedHeader: string;
  diagnosticsBlock: string;
  contextSnippets: string[];
  totalTokens: number;
  metrics: ReviewContextMetrics;
}

export interface SerializedGraph {
  version: string;
  commitSha: string;
  configVersion: string;
  timestamp: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

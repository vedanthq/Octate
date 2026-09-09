/**
 * Shared types for analysis layer.
 */

export interface ParsedFile {
  file: string;
  language: 'typescript' | 'javascript' | 'python';
  tree: unknown;
  symbols: Symbol[];
  parseTimeMs: number;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'constant'
  | 'variable'
  | 'module'
  | 'export'
  | 'import';

export interface Symbol {
  id: string;
  name: string;
  kind: SymbolKind;
  language: string;
  file: string;
  range: {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };
  parentID?: string;
  exported: boolean;
  references: string[];
}

export interface ParseOptions {
  includeTests?: boolean;
  signal?: AbortSignal;
}

export interface ParseResult {
  files: ParsedFile[];
  errors: Array<{ file: string; error: Error }>;
  totalTimeMs: number;
}

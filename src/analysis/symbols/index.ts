/**
 * Symbol extraction with stable SHA256 IDs.
 */

import { createHash } from 'node:crypto';
import * as webTreeSitter from 'web-tree-sitter';
import { createLogger } from '../../logging/index.js';
import type { ParsedFile, SymbolKind, Symbol as SymbolType } from '../types.js';
import { queries } from './queries.js';

const { Query } = webTreeSitter;

const log = createLogger('symbols');

export function symbolId(filePath: string, name: string, kind: SymbolKind): string {
  return createHash('sha256').update(`${filePath}${name}${kind}`).digest('hex');
}

function nodeToRange(node: webTreeSitter.Node): {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
} {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
  };
}

function getNodeText(node: webTreeSitter.Node, _source: string): string {
  // Use node.text directly as startIndex/endIndex may not align with tree.rootNode.text
  return node.text;
}

function isExported(node: webTreeSitter.Node): boolean {
  let current: webTreeSitter.Node | null = node;
  while (current) {
    if (current.type === 'export_statement') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findParentSymbol(
  node: webTreeSitter.Node,
  existingSymbols: SymbolType[]
): string | undefined {
  let current: webTreeSitter.Node | null = node.parent;
  while (current) {
    for (const symbol of existingSymbols) {
      const symbolRange = symbol.range;
      const currentRange = {
        startLine: current.startPosition.row + 1,
        endLine: current.endPosition.row + 1,
      };
      if (
        currentRange.startLine <= symbolRange.startLine &&
        currentRange.endLine >= symbolRange.endLine
      ) {
        return symbol.id;
      }
    }
    current = current.parent;
  }
  return undefined;
}

function extractSymbolsFromQuery(
  parsedFile: ParsedFile,
  queryString: string,
  kind: SymbolKind,
  existingSymbols: SymbolType[],
  sourceCode: string
): SymbolType[] {
  const tree = parsedFile.tree as webTreeSitter.Tree;
  if (!tree) return [];

  const query = new Query(tree.language, queryString);
  const captures = query.captures(tree.rootNode);

  const symbols: SymbolType[] = [];

  for (const capture of captures) {
    const nodeType = capture.node.type;
    if (
      capture.name === 'name' &&
      (nodeType === 'identifier' ||
        nodeType === 'type_identifier' ||
        nodeType === 'property_identifier')
    ) {
      const name = getNodeText(capture.node, sourceCode);
      const range = nodeToRange(capture.node);
      const exported = isExported(capture.node);
      const id = symbolId(parsedFile.file, name, kind);

      const parentID = findParentSymbol(capture.node, existingSymbols);

      symbols.push({
        id,
        name,
        kind,
        language: parsedFile.language,
        file: parsedFile.file,
        range,
        parentID: parentID ?? '',
        exported,
        references: [],
      });
    }
  }

  return symbols;
}

export function extractSymbols(parsedFile: ParsedFile): SymbolType[] {
  if (!parsedFile.tree) {
    return [];
  }

  const langQueries = queries[parsedFile.language as keyof typeof queries];
  if (!langQueries) {
    log.warn({ file: parsedFile.file, language: parsedFile.language }, 'No queries for language');
    return [];
  }

  const allSymbols: SymbolType[] = [];

  // Get source code for text extraction
  const tree = parsedFile.tree as webTreeSitter.Tree;
  const sourceCode = tree.rootNode.text;

  const extractionOrder: Array<{ queryType: string; kind: SymbolKind }> = [
    { queryType: 'classes', kind: 'class' },
    { queryType: 'interfaces', kind: 'interface' },
    { queryType: 'types', kind: 'type' },
    { queryType: 'functions', kind: 'function' },
    { queryType: 'variables', kind: 'variable' },
    { queryType: 'imports', kind: 'import' },
    { queryType: 'exports', kind: 'export' },
  ];

  for (const { queryType, kind } of extractionOrder) {
    const queryString = langQueries[queryType as keyof typeof langQueries];
    if (!queryString) continue;

    const symbols = extractSymbolsFromQuery(parsedFile, queryString, kind, allSymbols, sourceCode);
    allSymbols.push(...symbols);
  }

  const seen = new Set<string>();
  const deduplicated: SymbolType[] = [];

  for (const symbol of allSymbols) {
    const key = `${symbol.name}:${symbol.kind}:${symbol.file}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(symbol);
    }
  }

  return deduplicated;
}

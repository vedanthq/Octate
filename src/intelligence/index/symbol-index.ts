/**
 * In-memory repository-wide symbol index.
 * Maps declarations, exports, signatures, and class inheritance/interfaces.
 */

import path from 'node:path';
import type { Symbol as AnalysisSymbol, ParsedFile } from '../../analysis/types.js';
import type { SymbolIndexEntry } from '../types.js';

interface AstNodeLike {
  type: string;
  text: string;
  childCount: number;
  child(index: number): AstNodeLike | null;
}

interface TreeLike {
  rootNode?: AstNodeLike;
}

interface HeritageInfo {
  extendsClasses: string[];
  implementsInterfaces: string[];
}

export class SymbolIndex {
  private symbolsById: Map<string, SymbolIndexEntry> = new Map();
  private symbolsByFile: Map<string, AnalysisSymbol[]> = new Map();
  private exportsByFile: Map<string, Map<string, AnalysisSymbol>> = new Map();
  private implementsMap: Map<string, string[]> = new Map();
  private extendsMap: Map<string, string[]> = new Map();

  /**
   * Adds a parsed file and indexes its symbols and inheritance information.
   */
  public addFile(parsed: ParsedFile, fileContent?: string): void {
    const normalizedPath = path.normalize(parsed.file);
    const heritageByClassName = this.extractHeritage(parsed, fileContent);

    const fileSymbols: AnalysisSymbol[] = [];
    const fileExports = new Map<string, AnalysisSymbol>();

    for (const sym of parsed.symbols) {
      // Normalize symbol file path
      const symbol: AnalysisSymbol = {
        ...sym,
        file: normalizedPath,
      };

      fileSymbols.push(symbol);

      let extendsClasses: string[] | undefined;
      let implementsInterfaces: string[] | undefined;

      if (symbol.kind === 'class') {
        const heritage = heritageByClassName.get(symbol.name);
        if (heritage) {
          extendsClasses = heritage.extendsClasses;
          implementsInterfaces = heritage.implementsInterfaces;

          if (extendsClasses.length > 0) {
            this.extendsMap.set(symbol.id, extendsClasses);
          }
          if (implementsInterfaces.length > 0) {
            this.implementsMap.set(symbol.id, implementsInterfaces);
          }
        }
      }

      const signature = fileContent ? this.extractSignature(symbol, fileContent) : undefined;
      const docstring = fileContent ? this.extractDocstring(symbol, fileContent) : undefined;

      const entry: SymbolIndexEntry = {
        symbol,
        signature,
        docstring,
        implementsInterfaces,
        extendsClasses,
      };

      this.symbolsById.set(symbol.id, entry);

      if (symbol.exported) {
        fileExports.set(symbol.name, symbol);
      }
    }

    this.symbolsByFile.set(normalizedPath, fileSymbols);
    this.exportsByFile.set(normalizedPath, fileExports);
  }

  /**
   * Gets a symbol index entry by unique ID.
   */
  public getSymbol(id: string): SymbolIndexEntry | undefined {
    return this.symbolsById.get(id);
  }

  /**
   * Gets all symbols defined in a file.
   */
  public getFileSymbols(filePath: string): AnalysisSymbol[] {
    const normalized = path.normalize(filePath);
    return this.symbolsByFile.get(normalized) ?? [];
  }

  /**
   * Gets an exported symbol by file and export name.
   */
  public getExport(filePath: string, exportName: string): AnalysisSymbol | undefined {
    const normalized = path.normalize(filePath);
    const fileExports = this.exportsByFile.get(normalized);
    if (!fileExports) return undefined;
    return fileExports.get(exportName);
  }

  /**
   * Returns all exported symbols for a file.
   */
  public getAllExports(filePath: string): AnalysisSymbol[] {
    const normalized = path.normalize(filePath);
    const fileExports = this.exportsByFile.get(normalized);
    if (!fileExports) return [];
    return Array.from(fileExports.values());
  }

  /**
   * Finds all symbols matching the given identifier name.
   */
  public findSymbolsByName(name: string): AnalysisSymbol[] {
    const results: AnalysisSymbol[] = [];
    for (const entry of this.symbolsById.values()) {
      if (entry.symbol.name === name) {
        results.push(entry.symbol);
      }
    }
    return results;
  }

  /**
   * Returns interfaces implemented by the symbol ID.
   */
  public getImplements(symbolId: string): string[] {
    return this.implementsMap.get(symbolId) ?? [];
  }

  /**
   * Returns classes extended by the symbol ID.
   */
  public getExtends(symbolId: string): string[] {
    return this.extendsMap.get(symbolId) ?? [];
  }

  /**
   * Returns all indexed entries.
   */
  public getAllSymbols(): SymbolIndexEntry[] {
    return Array.from(this.symbolsById.values());
  }

  /**
   * Returns all indexed file paths.
   */
  public getAllFiles(): string[] {
    return Array.from(this.symbolsByFile.keys());
  }

  /**
   * Total number of indexed symbols.
   */
  public size(): number {
    return this.symbolsById.size;
  }

  /**
   * Extracts class inheritance (extends and implements) via AST or regex fallback.
   */
  private extractHeritage(parsed: ParsedFile, fileContent?: string): Map<string, HeritageInfo> {
    const result = new Map<string, HeritageInfo>();

    // 1. Try Tree-sitter AST walk if tree is available
    const tree = parsed.tree as TreeLike | null | undefined;
    if (tree && typeof tree.rootNode === 'object' && tree.rootNode !== null) {
      try {
        const root = tree.rootNode;
        this.walkAstHeritage(root, parsed.language, result);
        if (result.size > 0) {
          return result;
        }
      } catch {
        // Fall back to text parsing if AST traversal throws
      }
    }

    // 2. Fall back to regex parsing if file content is available
    if (fileContent) {
      this.extractHeritageFromText(fileContent, parsed.language, result);
    }

    return result;
  }

  private walkAstHeritage(
    node: AstNodeLike | null | undefined,
    language: string,
    out: Map<string, HeritageInfo>
  ): void {
    if (!node) return;

    if (
      (language === 'typescript' || language === 'javascript') &&
      node.type === 'class_declaration'
    ) {
      let className = '';
      const extendsClasses: string[] = [];
      const implementsInterfaces: string[] = [];

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;

        if (child.type === 'type_identifier' || child.type === 'identifier') {
          if (!className) className = child.text;
        } else if (child.type === 'class_heritage') {
          for (let j = 0; j < child.childCount; j++) {
            const hChild = child.child(j);
            if (!hChild) continue;

            if (hChild.type === 'extends_clause') {
              for (let k = 0; k < hChild.childCount; k++) {
                const eNode = hChild.child(k);
                if (
                  eNode &&
                  (eNode.type === 'identifier' || eNode.type === 'type_identifier') &&
                  eNode.text !== 'extends'
                ) {
                  extendsClasses.push(eNode.text);
                }
              }
            } else if (hChild.type === 'implements_clause') {
              for (let k = 0; k < hChild.childCount; k++) {
                const iNode = hChild.child(k);
                if (
                  iNode &&
                  (iNode.type === 'identifier' || iNode.type === 'type_identifier') &&
                  iNode.text !== 'implements'
                ) {
                  implementsInterfaces.push(iNode.text);
                }
              }
            }
          }
        }
      }

      if (className) {
        out.set(className, { extendsClasses, implementsInterfaces });
      }
    } else if (language === 'python' && node.type === 'class_definition') {
      let className = '';
      const extendsClasses: string[] = [];

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;

        if (child.type === 'identifier' && !className) {
          className = child.text;
        } else if (child.type === 'argument_list') {
          for (let j = 0; j < child.childCount; j++) {
            const arg = child.child(j);
            if (
              arg &&
              (arg.type === 'identifier' || arg.type === 'attribute') &&
              arg.text !== '(' &&
              arg.text !== ')' &&
              arg.text !== ','
            ) {
              extendsClasses.push(arg.text);
            }
          }
        }
      }

      if (className) {
        out.set(className, { extendsClasses, implementsInterfaces: [] });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      this.walkAstHeritage(node.child(i), language, out);
    }
  }

  private extractHeritageFromText(
    text: string,
    language: string,
    out: Map<string, HeritageInfo>
  ): void {
    if (language === 'typescript' || language === 'javascript') {
      // Regex for class Foo extends Bar implements Baz, Qux
      const classRegex =
        /class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+([A-Za-z0-9_$.]+))?(?:\s+implements\s+([A-Za-z0-9_$,\s]+))?/g;
      let match = classRegex.exec(text);
      while (match !== null) {
        const className = match[1];
        const extendsPart = match[2]?.trim();
        const implementsPart = match[3]?.trim();

        const extendsClasses = extendsPart ? [extendsPart] : [];
        const implementsInterfaces = implementsPart
          ? implementsPart
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        if (className) {
          out.set(className, { extendsClasses, implementsInterfaces });
        }
        match = classRegex.exec(text);
      }
    } else if (language === 'python') {
      // Regex for class Foo(Bar, Baz):
      const classRegex = /class\s+([A-Za-z0-9_]+)(?:\(([^)]+)\))?\s*:/g;
      let match = classRegex.exec(text);
      while (match !== null) {
        const className = match[1];
        const basesPart = match[2]?.trim();
        const extendsClasses = basesPart
          ? basesPart
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        if (className) {
          out.set(className, { extendsClasses, implementsInterfaces: [] });
        }
        match = classRegex.exec(text);
      }
    }
  }

  private extractSignature(symbol: AnalysisSymbol, fileContent: string): string | undefined {
    const lines = fileContent.split('\n');
    const lineIdx = symbol.range.startLine - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return undefined;

    // Grab up to 3 lines starting from symbol line
    const slice = lines.slice(lineIdx, Math.min(lineIdx + 3, lines.length));
    const combined = slice.join(' ').trim();
    if (symbol.language === 'python') {
      const endCharIdx = combined.search(/:/);
      if (endCharIdx !== -1) {
        return combined.slice(0, endCharIdx).trim();
      }
    } else {
      const endCharIdx = combined.search(/[{;]/);
      if (endCharIdx !== -1) {
        return combined.slice(0, endCharIdx).trim();
      }
    }
    return combined.slice(0, 120).trim();
  }

  private extractDocstring(symbol: AnalysisSymbol, fileContent: string): string | undefined {
    const lines = fileContent.split('\n');
    const lineIdx = symbol.range.startLine - 1;
    if (lineIdx <= 0 || lineIdx >= lines.length) return undefined;

    // Check lines preceding symbol definition
    const preceding: string[] = [];
    let cur = lineIdx - 1;

    // Skip empty lines immediately preceding
    while (cur >= 0 && lines[cur] !== undefined && lines[cur]?.trim() === '') {
      cur--;
    }

    if (cur >= 0 && lines[cur] !== undefined && lines[cur]?.trim().endsWith('*/')) {
      while (cur >= 0) {
        const l = lines[cur];
        if (l === undefined) break;
        preceding.unshift(l.trim());
        if (l.trim().startsWith('/*')) break;
        cur--;
      }
      return preceding.join('\n');
    }

    return undefined;
  }
}

/**
 * Creates and populates a SymbolIndex from parsed files.
 */
export function createSymbolIndex(
  files: ParsedFile[],
  fileContents?: Map<string, string>
): SymbolIndex {
  const index = new SymbolIndex();
  for (const file of files) {
    const content = fileContents?.get(file.file);
    index.addFile(file, content);
  }
  return index;
}

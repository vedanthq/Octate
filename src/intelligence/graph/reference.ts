/**
 * Directed reference multigraph tracking caller->callee, importer->imported,
 * implementation->interface, test->production, and route->handler relationships.
 */

import path from 'node:path';
import type { Symbol as AnalysisSymbol, ParsedFile } from '../../analysis/types.js';
import type { SymbolIndex } from '../index/symbol-index.js';
import type { PathResolver } from '../resolver/path-resolver.js';
import type { GraphEdge, GraphNode, ImportStatement } from '../types.js';

export class ReferenceGraph {
  private outgoing: Map<string, GraphEdge[]> = new Map();
  private incoming: Map<string, GraphEdge[]> = new Map();
  private nodes: Map<string, GraphNode> = new Map();
  private fileLayers: Map<string, string> = new Map();

  /**
   * Adds a node to the graph.
   */
  public addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Gets a node by ID.
   */
  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Adds a directed edge and automatically inserts the reciprocal edge.
   */
  public addEdge(edge: GraphEdge): void {
    // Add outgoing edge
    const outList = this.outgoing.get(edge.from) ?? [];
    outList.push(edge);
    this.outgoing.set(edge.from, outList);

    // Add reciprocal incoming edge
    const reciprocalKind = this.getReciprocalKind(edge.kind);
    const reciprocalEdge: GraphEdge = {
      from: edge.to,
      to: edge.from,
      kind: reciprocalKind,
      metadata: edge.metadata,
    };

    const inList = this.incoming.get(edge.to) ?? [];
    inList.push(reciprocalEdge);
    this.incoming.set(edge.to, inList);
  }

  /**
   * Sets the architectural layer tag for a file.
   */
  public setFileLayer(filePath: string, layer: string): void {
    this.fileLayers.set(path.normalize(filePath), layer);
  }

  /**
   * Returns the architectural layer for a file.
   */
  public getLayer(filePath: string): string | undefined {
    return this.fileLayers.get(path.normalize(filePath));
  }

  /**
   * Gets direct 1-hop callers sorted by proximity and capped to limit.
   * Priority: same directory (1) > same package (2) > other files (3) > tests (4).
   */
  public getCallers(symbolId: string, limit = 10): GraphEdge[] {
    const callers = (this.incoming.get(symbolId) ?? []).filter((e) => e.kind === 'called_by');

    const targetNode = this.nodes.get(symbolId);
    const targetFile = targetNode?.path ?? targetNode?.symbol?.file ?? '';
    const targetDir = targetFile ? path.dirname(path.normalize(targetFile)) : '';

    const scored = callers.map((edge) => {
      const callerNode = this.nodes.get(edge.to);
      const callerFile = edge.metadata?.file ?? callerNode?.path ?? callerNode?.symbol?.file ?? '';
      const normCaller = path.normalize(callerFile);
      const isTest = this.isTestFile(normCaller);

      let score = 3; // Default other files
      if (isTest) {
        score = 4; // Tests come after prod callers
      } else if (targetDir && path.dirname(normCaller) === targetDir) {
        score = 1; // Same directory
      } else if (this.isSamePackage(normCaller, targetFile)) {
        score = 2; // Same package
      }

      return { edge, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, limit).map((s) => s.edge);
  }

  /**
   * Gets direct incoming edges for a node (symbol or file).
   */
  public getIncoming(nodeId: string): GraphEdge[] {
    return this.incoming.get(path.normalize(nodeId)) ?? this.incoming.get(nodeId) ?? [];
  }

  /**
   * Gets direct 1-hop callees for a symbol.
   */
  public getCallees(symbolId: string): GraphEdge[] {
    return (this.outgoing.get(symbolId) ?? []).filter((e) => e.kind === 'calls');
  }

  /**
   * Gets implementations of an interface symbol.
   */
  public getImplementations(interfaceSymbolId: string): GraphEdge[] {
    return (this.incoming.get(interfaceSymbolId) ?? []).filter((e) => e.kind === 'implemented_by');
  }

  /**
   * Returns test files associated with a production file.
   */
  public getTestsForFile(filePath: string): string[] {
    const normalized = path.normalize(filePath);
    const results = new Set<string>();

    // 1. Direct edges from graph (e.g. tests / tested_by)
    const outEdges = this.outgoing.get(normalized) ?? [];
    for (const e of outEdges) {
      if (e.kind === 'tested_by') {
        results.add(e.to);
      } else if (e.kind === 'tests') {
        results.add(e.to);
      }
    }

    const inEdges = this.incoming.get(normalized) ?? [];
    for (const e of inEdges) {
      if (e.kind === 'tested_by') {
        results.add(e.to);
      } else if (e.kind === 'tests') {
        results.add(e.from);
      }
    }

    return Array.from(results);
  }

  /**
   * Returns all nodes in the graph.
   */
  public getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Returns all directed outgoing edges.
   */
  public getAllEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const list of this.outgoing.values()) {
      edges.push(...list);
    }
    return edges;
  }

  /**
   * Returns layer mapping for all files.
   */
  public getAllFileLayers(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [file, layer] of this.fileLayers.entries()) {
      obj[file] = layer;
    }
    return obj;
  }

  private isTestFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return (
      lower.includes('.test.') ||
      lower.includes('.spec.') ||
      lower.includes('__tests__') ||
      lower.startsWith('test/') ||
      lower.startsWith('tests/') ||
      lower.includes('/test/') ||
      lower.includes('/tests/') ||
      lower.endsWith('_test.py') ||
      path.basename(lower).startsWith('test_')
    );
  }

  private isSamePackage(pathA: string, pathB: string): boolean {
    if (!pathA || !pathB) return false;
    const partsA = pathA.split(path.sep);
    const partsB = pathB.split(path.sep);
    if (partsA[0] === 'packages' && partsB[0] === 'packages' && partsA[1] && partsB[1]) {
      return partsA[1] === partsB[1];
    }
    return false;
  }

  private getReciprocalKind(kind: GraphEdge['kind']): GraphEdge['kind'] {
    switch (kind) {
      case 'calls':
        return 'called_by';
      case 'called_by':
        return 'calls';
      case 'imports':
        return 'imported_by';
      case 'imported_by':
        return 'imports';
      case 'implements':
        return 'implemented_by';
      case 'implemented_by':
        return 'implements';
      case 'tests':
        return 'tested_by';
      case 'tested_by':
        return 'tests';
      case 'routes_to':
        return 'called_by';
    }
  }
}

/**
 * Parses import statements from file content (JS/TS and Python).
 */
export function extractImportStatements(filePath: string, content: string): ImportStatement[] {
  const isPython = filePath.endsWith('.py');
  const lines = content.split('\n');
  const imports: ImportStatement[] = [];

  if (isPython) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';
      if (!line || line.startsWith('#')) continue;

      // from .module import a, b as c
      const fromMatch = line.match(/^from\s+([^\s]+)\s+import\s+(.+)$/);
      if (fromMatch) {
        const specifier = fromMatch[1] ?? '';
        const rawSymbols = (fromMatch[2] ?? '').split('#')[0] ?? '';
        const importedSymbols = rawSymbols
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((item) => {
            const aliasMatch = item.match(/^([a-zA-Z0-9_]+)(?:\s+as\s+([a-zA-Z0-9_]+))?$/);
            if (aliasMatch) {
              return {
                name: aliasMatch[1] ?? item,
                alias: aliasMatch[2],
              };
            }
            return { name: item };
          });

        imports.push({
          sourceFile: filePath,
          specifier,
          importedSymbols,
          line: i + 1,
          isDefault: false,
          isNamespace: false,
        });
        continue;
      }

      // import a, b
      const importMatch = line.match(/^import\s+([^#]+)$/);
      if (importMatch) {
        const rawModules = importMatch[1]?.split(',') ?? [];
        for (const mod of rawModules) {
          const trimmed = mod.trim();
          if (!trimmed) continue;
          const parts = trimmed.split(/\s+as\s+/);
          const modName = parts[0] ?? trimmed;
          const alias = parts[1];
          imports.push({
            sourceFile: filePath,
            specifier: modName,
            importedSymbols: [{ name: modName, alias }],
            line: i + 1,
            isDefault: false,
            isNamespace: false,
          });
        }
      }
    }
  } else {
    // TypeScript / JavaScript
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

      // import { a, b as c } from '...'
      // import defaultExport, { a } from '...'
      // import * as ns from '...'
      const importRegex =
        /import\s+(?:(?:type\s+)?(?:\*\s+as\s+([A-Za-z0-9_$]+)|{([^}]*)}|([A-Za-z0-9_$]+))\s*,?\s*(?:{([^}]*)})?\s*from\s*)?['"]([^'"]+)['"]/;
      const match = line.match(importRegex);
      if (match) {
        const nsName = match[1];
        const named1 = match[2];
        const defaultName = match[3];
        const named2 = match[4];
        const specifier = match[5];

        if (!specifier) continue;

        const importedSymbols: Array<{ name: string; alias?: string | undefined }> = [];
        let isDefault = false;
        let isNamespace = false;

        if (nsName) {
          isNamespace = true;
          importedSymbols.push({ name: nsName });
        }
        if (defaultName) {
          isDefault = true;
          importedSymbols.push({ name: defaultName });
        }

        const namedBlock = named1 ?? named2;
        if (namedBlock) {
          const parts = namedBlock
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          for (const p of parts) {
            const aliasMatch = p.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
            if (aliasMatch) {
              importedSymbols.push({
                name: aliasMatch[1] ?? p,
                alias: aliasMatch[2],
              });
            }
          }
        }

        imports.push({
          sourceFile: filePath,
          specifier,
          importedSymbols,
          line: i + 1,
          isDefault,
          isNamespace,
        });
      }
    }
  }

  return imports;
}

/**
 * Determines layer tag for a file from file path and optional config overrides.
 */
export function determineLayer(filePath: string, layerConfig?: Record<string, string>): string {
  const norm = filePath.replace(/\\/g, '/');

  if (layerConfig) {
    for (const [pattern, layer] of Object.entries(layerConfig)) {
      if (norm.includes(pattern)) return layer;
    }
  }

  const lower = norm.toLowerCase();
  if (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.startsWith('test/') ||
    lower.startsWith('tests/')
  ) {
    return 'test';
  }
  if (
    lower.includes('/routes/') ||
    lower.includes('/routers/') ||
    lower.includes('/controllers/') ||
    lower.includes('/endpoints/') ||
    lower.includes('/api/') ||
    lower.endsWith('router.ts') ||
    lower.endsWith('controller.ts')
  ) {
    return 'route';
  }
  if (lower.includes('/services/') || lower.endsWith('service.ts')) {
    return 'service';
  }
  if (
    lower.includes('/repositories/') ||
    lower.includes('/models/') ||
    lower.includes('/db/') ||
    lower.includes('/entities/') ||
    lower.endsWith('repo.ts') ||
    lower.endsWith('repository.ts')
  ) {
    return 'repository';
  }
  if (lower.includes('/config/') || lower.includes('.config.')) {
    return 'config';
  }
  if (lower.includes('/utils/') || lower.includes('/helpers/') || lower.includes('/lib/')) {
    return 'util';
  }

  return 'domain';
}

/**
 * Creates and populates a ReferenceGraph from parsed files, SymbolIndex, and PathResolver.
 */
export function createReferenceGraph(
  files: ParsedFile[],
  symbolIndex: SymbolIndex,
  pathResolver: PathResolver,
  layerConfig?: Record<string, string>,
  fileContents?: Map<string, string>
): ReferenceGraph {
  const graph = new ReferenceGraph();

  // 1. Register file and symbol nodes, tag layers
  for (const file of files) {
    const normFile = path.normalize(file.file);
    const layer = determineLayer(normFile, layerConfig);
    graph.setFileLayer(normFile, layer);

    graph.addNode({
      id: normFile,
      kind: 'file',
      name: path.basename(normFile),
      path: normFile,
    });

    for (const sym of file.symbols) {
      graph.addNode({
        id: sym.id,
        kind: 'symbol',
        name: sym.name,
        path: normFile,
        symbol: sym,
      });
    }
  }

  // 2. Parse imports and build import edges & call edges
  for (const file of files) {
    const normFile = path.normalize(file.file);
    const content = fileContents?.get(file.file);
    if (!content) continue;

    const imports = extractImportStatements(normFile, content);

    for (const imp of imports) {
      const resolved = pathResolver.resolve(normFile, imp.specifier);
      if (!resolved.resolvedPath) continue;

      const targetFile = path.normalize(resolved.resolvedPath);

      // File -> File import edge
      graph.addEdge({
        from: normFile,
        to: targetFile,
        kind: 'imports',
        metadata: { file: normFile, line: imp.line },
      });

      // Match imported symbols to target exports
      for (const importedSym of imp.importedSymbols) {
        const targetSym = symbolIndex.getExport(targetFile, importedSym.name);
        if (!targetSym) continue;

        const effectiveName = importedSym.alias ?? importedSym.name;

        // Check which symbols in caller file reference effectiveName
        const callerSymbols = file.symbols;
        for (const caller of callerSymbols) {
          // Check caller content range for reference
          const isReferenced = isIdentifierReferenced(caller, effectiveName, content);

          if (isReferenced) {
            graph.addEdge({
              from: caller.id,
              to: targetSym.id,
              kind: 'calls',
              metadata: { file: normFile, line: caller.range.startLine },
            });
          }
        }
      }
    }
  }

  // 3. Connect implements and extends edges
  for (const entry of symbolIndex.getAllSymbols()) {
    const sym = entry.symbol;

    if (entry.implementsInterfaces) {
      for (const ifaceName of entry.implementsInterfaces) {
        const matches = symbolIndex.findSymbolsByName(ifaceName);
        for (const target of matches) {
          if (target.kind === 'interface') {
            graph.addEdge({
              from: sym.id,
              to: target.id,
              kind: 'implements',
              metadata: { file: sym.file, line: sym.range.startLine },
            });
          }
        }
      }
    }

    if (entry.extendsClasses) {
      for (const baseName of entry.extendsClasses) {
        const matches = symbolIndex.findSymbolsByName(baseName);
        for (const target of matches) {
          if (target.kind === 'class') {
            graph.addEdge({
              from: sym.id,
              to: target.id,
              kind: 'implements',
              metadata: { file: sym.file, line: sym.range.startLine },
            });
          }
        }
      }
    }
  }

  // 4. Multi-signal test-production edges (D-10)
  const fileSet = new Set(files.map((f) => path.normalize(f.file)));

  for (const file of files) {
    const normFile = path.normalize(file.file);
    const isTest =
      normFile.includes('.test.') ||
      normFile.includes('.spec.') ||
      normFile.endsWith('_test.py') ||
      path.basename(normFile).startsWith('test_');

    if (!isTest) continue;

    // Signal A: Naming convention matching
    // e.g. src/foo.test.ts -> src/foo.ts
    const candidateProdFiles = deriveProdFilesFromTest(normFile);
    for (const prod of candidateProdFiles) {
      if (fileSet.has(prod)) {
        graph.addEdge({
          from: normFile,
          to: prod,
          kind: 'tests',
          metadata: { file: normFile },
        });
      }
    }

    // Signal B: Imports matching (test imports prod file)
    const content = fileContents?.get(file.file);
    if (content) {
      const imports = extractImportStatements(normFile, content);
      for (const imp of imports) {
        const res = pathResolver.resolve(normFile, imp.specifier);
        if (res.resolvedPath && fileSet.has(path.normalize(res.resolvedPath))) {
          const prodFile = path.normalize(res.resolvedPath);
          graph.addEdge({
            from: normFile,
            to: prodFile,
            kind: 'tests',
            metadata: { file: normFile, line: imp.line },
          });
        }
      }
    }
  }

  return graph;
}

function isIdentifierReferenced(
  symbol: AnalysisSymbol,
  identifier: string,
  fileContent: string
): boolean {
  const lines = fileContent.split('\n');
  const start = Math.max(0, symbol.range.startLine - 1);
  const end = Math.min(lines.length, symbol.range.endLine);

  const body = lines.slice(start, end).join('\n');
  const regex = new RegExp(`\\b${escapeRegExp(identifier)}\\b`);
  return regex.test(body);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveProdFilesFromTest(testPath: string): string[] {
  const candidates: string[] = [];

  // Replace .test.ts -> .ts, .spec.ts -> .ts
  if (testPath.includes('.test.')) {
    candidates.push(testPath.replace('.test.', '.'));
  }
  if (testPath.includes('.spec.')) {
    candidates.push(testPath.replace('.spec.', '.'));
  }
  if (testPath.endsWith('_test.py')) {
    candidates.push(testPath.replace('_test.py', '.py'));
  }
  const base = path.basename(testPath);
  if (base.startsWith('test_') && testPath.endsWith('.py')) {
    candidates.push(path.join(path.dirname(testPath), base.replace(/^test_/, '')));
  }

  // Handle tests/ or test/ directory mirror
  // e.g. tests/foo.test.ts -> src/foo.ts
  const withoutTestDir = testPath
    .replace(/^tests?\//, 'src/')
    .replace('.test.', '.')
    .replace('.spec.', '.');
  candidates.push(withoutTestDir);

  const directMirror = testPath
    .replace(/^tests?\//, '')
    .replace('.test.', '.')
    .replace('.spec.', '.');
  candidates.push(directMirror);

  return candidates;
}

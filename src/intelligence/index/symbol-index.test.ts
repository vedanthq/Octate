import { describe, expect, it } from '@jest/globals';
import type { Symbol as AnalysisSymbol, ParsedFile } from '../../analysis/types.js';
import { createSymbolIndex, SymbolIndex } from './symbol-index.js';

describe('SymbolIndex', () => {
  const file1Content = `
/**
 * Processes incoming user requests.
 */
export function handleRequest(req: Request): Response {
  return new Response();
}

export interface UserHandler {
  handle(user: User): void;
}

export class DefaultUserHandler extends BaseHandler implements UserHandler, LoggingHandler {
  handle(user: User): void {}
}
`;

  const symbolFn: AnalysisSymbol = {
    id: 'sym-fn-1',
    name: 'handleRequest',
    kind: 'function',
    language: 'typescript',
    file: 'src/handler.ts',
    range: { startLine: 5, endLine: 7, startColumn: 0, endColumn: 1 },
    exported: true,
    references: [],
  };

  const symbolInterface: AnalysisSymbol = {
    id: 'sym-iface-1',
    name: 'UserHandler',
    kind: 'interface',
    language: 'typescript',
    file: 'src/handler.ts',
    range: { startLine: 9, endLine: 11, startColumn: 0, endColumn: 1 },
    exported: true,
    references: [],
  };

  const symbolClass: AnalysisSymbol = {
    id: 'sym-class-1',
    name: 'DefaultUserHandler',
    kind: 'class',
    language: 'typescript',
    file: 'src/handler.ts',
    range: { startLine: 13, endLine: 15, startColumn: 0, endColumn: 1 },
    exported: true,
    references: [],
  };

  const parsedFile: ParsedFile = {
    file: 'src/handler.ts',
    language: 'typescript',
    tree: null,
    symbols: [symbolFn, symbolInterface, symbolClass],
    parseTimeMs: 1,
  };

  it('indexes symbols and allows lookup by ID', () => {
    const index = new SymbolIndex();
    index.addFile(parsedFile, file1Content);

    const entry = index.getSymbol('sym-fn-1');
    expect(entry).toBeDefined();
    expect(entry?.symbol.name).toBe('handleRequest');
    expect(entry?.docstring).toContain('Processes incoming user requests');
    expect(entry?.signature).toContain('export function handleRequest(req: Request): Response');
  });

  it('indexes exported symbols for fast export lookup', () => {
    const index = new SymbolIndex();
    index.addFile(parsedFile, file1Content);

    const exp = index.getExport('src/handler.ts', 'handleRequest');
    expect(exp).toBeDefined();
    expect(exp?.id).toBe('sym-fn-1');

    const nonExistent = index.getExport('src/handler.ts', 'nonExistent');
    expect(nonExistent).toBeUndefined();

    const allExports = index.getAllExports('src/handler.ts');
    expect(allExports).toHaveLength(3);
  });

  it('extracts extends and implements relationships from class heritage', () => {
    const index = new SymbolIndex();
    index.addFile(parsedFile, file1Content);

    const entry = index.getSymbol('sym-class-1');
    expect(entry).toBeDefined();
    expect(entry?.extendsClasses).toEqual(['BaseHandler']);
    expect(entry?.implementsInterfaces).toEqual(['UserHandler', 'LoggingHandler']);

    expect(index.getExtends('sym-class-1')).toEqual(['BaseHandler']);
    expect(index.getImplements('sym-class-1')).toEqual(['UserHandler', 'LoggingHandler']);
  });

  it('finds symbols by name across files', () => {
    const file2: ParsedFile = {
      file: 'src/other.ts',
      language: 'typescript',
      tree: null,
      symbols: [
        {
          id: 'sym-fn-2',
          name: 'handleRequest',
          kind: 'function',
          language: 'typescript',
          file: 'src/other.ts',
          range: { startLine: 1, endLine: 3, startColumn: 0, endColumn: 1 },
          exported: false,
          references: [],
        },
      ],
      parseTimeMs: 1,
    };

    const index = createSymbolIndex([parsedFile, file2]);
    const matches = index.findSymbolsByName('handleRequest');
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.file)).toEqual(['src/handler.ts', 'src/other.ts']);
  });

  it('extracts Python inheritance correctly', () => {
    const pyContent = `
class ServiceUser(BaseUser, AuditMixin):
    def save(self):
        pass
`;
    const pySymbol: AnalysisSymbol = {
      id: 'py-class-1',
      name: 'ServiceUser',
      kind: 'class',
      language: 'python',
      file: 'app/models.py',
      range: { startLine: 2, endLine: 4, startColumn: 0, endColumn: 1 },
      exported: true,
      references: [],
    };

    const pyFile: ParsedFile = {
      file: 'app/models.py',
      language: 'python',
      tree: null,
      symbols: [pySymbol],
      parseTimeMs: 1,
    };

    const index = new SymbolIndex();
    index.addFile(pyFile, pyContent);

    const entry = index.getSymbol('py-class-1');
    expect(entry?.extendsClasses).toEqual(['BaseUser', 'AuditMixin']);
  });
});

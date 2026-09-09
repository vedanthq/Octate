/**
 * Analysis module barrel export.
 */

export { initParser, type ParserState, parseFile } from './parser/index.js';
export { extractSymbols, symbolId } from './symbols/index.js';
export type { ParsedFile, ParseOptions, ParseResult, Symbol, SymbolKind } from './types.js';

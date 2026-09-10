/**
 * Intelligence layer public exports.
 */

export { createSymbolIndex, SymbolIndex } from './index/symbol-index.js';
export {
  createPathResolver,
  PathResolver,
  type PathResolverOptions,
  resolveImportPath,
  type WorkspaceInfo,
} from './resolver/path-resolver.js';
export * from './types.js';

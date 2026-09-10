/**
 * Intelligence layer public exports.
 */

export {
  createDependencyGraph,
  DependencyGraph,
  type FileDependencies,
  type ModuleDependencyEdge,
} from './graph/dependency.js';
export {
  createReferenceGraph,
  determineLayer,
  extractImportStatements,
  ReferenceGraph,
} from './graph/reference.js';
export {
  getGraphCacheKey,
  loadGraph,
  type SerializedGraphData,
  saveGraph,
} from './graph/serializer.js';
export { createSymbolIndex, SymbolIndex } from './index/symbol-index.js';
export {
  createPathResolver,
  PathResolver,
  type PathResolverOptions,
  resolveImportPath,
  type WorkspaceInfo,
} from './resolver/path-resolver.js';
export * from './types.js';

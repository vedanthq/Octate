/**
 * Intelligence layer public exports.
 */

export {
  estimateTokens,
  type TieredBudget,
  TokenBudgetManager,
} from './context/budget.js';
export {
  CandidateCollector,
  type CandidateCollectParams,
  scoreCandidate,
} from './context/candidates.js';
export {
  type BuildContextOptions,
  ContextEngine,
  type ContextEngineOptions,
  createContextEngine,
} from './context/engine.js';
export {
  formatDiagnosticsSection,
  formatUntrustedCodeFence,
  serializePromptContext,
} from './context/serializer.js';
export { formatNumberedLines, windowSnippet } from './context/windowing.js';
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

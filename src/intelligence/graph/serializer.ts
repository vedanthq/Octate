/**
 * Atomic disk persistence and cache invalidation for graph.json.
 * Uses CacheStore with SHA-keyed atomic file writes.
 */

import { cacheKey } from '../../cache/keys.js';
import type { CacheStore } from '../../cache/store.js';
import type { GraphEdge, GraphNode } from '../types.js';
import { DependencyGraph, type ModuleDependencyEdge } from './dependency.js';
import { ReferenceGraph } from './reference.js';

export interface SerializedGraphData {
  version: string;
  commitSha: string;
  configHash: string;
  timestamp: number;
  nodes: GraphNode[];
  referenceEdges: GraphEdge[];
  dependencyEdges: ModuleDependencyEdge[];
  fileLayers?: Record<string, string> | undefined;
}

/**
 * Computes deterministic cache key for graph state based on commit SHA and config hash.
 */
export function getGraphCacheKey(commitSha: string, configHash: string): string {
  return cacheKey({
    type: 'intelligence-graph',
    commitSha,
    configHash,
    version: '1',
  });
}

/**
 * Saves graph state to CacheStore atomically.
 */
export async function saveGraph(
  store: CacheStore,
  graph: { reference: ReferenceGraph; dependency: DependencyGraph },
  commitSha: string,
  configHash: string
): Promise<void> {
  const data: SerializedGraphData = {
    version: '1.0.0',
    commitSha,
    configHash,
    timestamp: Date.now(),
    nodes: graph.reference.getAllNodes(),
    referenceEdges: graph.reference.getAllEdges(),
    dependencyEdges: graph.dependency.getAllEdges(),
    fileLayers: graph.reference.getAllFileLayers(),
  };

  const key = getGraphCacheKey(commitSha, configHash);
  await store.set(key, data);
}

/**
 * Loads graph state from CacheStore. Validates commit SHA, config hash, and payload integrity.
 * Returns null if cache entry is missing, stale, or malformed.
 */
export async function loadGraph(
  store: CacheStore,
  commitSha: string,
  configHash: string
): Promise<{ reference: ReferenceGraph; dependency: DependencyGraph } | null> {
  const key = getGraphCacheKey(commitSha, configHash);

  try {
    const entry = await store.get<SerializedGraphData>(key);
    if (!entry?.value) {
      return null;
    }

    const data = entry.value;

    // Validate commit SHA and config hash match
    if (data.commitSha !== commitSha || data.configHash !== configHash) {
      return null;
    }

    // Reconstruct ReferenceGraph
    const reference = new ReferenceGraph();
    if (Array.isArray(data.nodes)) {
      for (const node of data.nodes) {
        reference.addNode(node);
      }
    }

    if (Array.isArray(data.referenceEdges)) {
      for (const edge of data.referenceEdges) {
        reference.addEdge(edge);
      }
    }

    if (data.fileLayers && typeof data.fileLayers === 'object') {
      for (const [file, layer] of Object.entries(data.fileLayers)) {
        reference.setFileLayer(file, layer);
      }
    }

    // Reconstruct DependencyGraph
    const dependency = new DependencyGraph();
    if (Array.isArray(data.dependencyEdges)) {
      for (const edge of data.dependencyEdges) {
        dependency.addModuleDependency(edge.from, edge.to, edge.isExternal, edge.isWorkspace);
      }
    }

    return { reference, dependency };
  } catch {
    // If deserialization or reconstruction throws, fail safe by returning null
    return null;
  }
}

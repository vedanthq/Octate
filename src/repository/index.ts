/**
 * Public repository API.
 * Exports all repository layer functionality.
 */

export {
  findGitRoot,
  detectWorkspace,
  discoverRepository,
} from './discovery.js';

export {
  detectMonorepo,
  aggregateWorkspaces,
  expandWorkspacePatterns,
  type MonorepoConfig,
  type MonorepoType,
} from './monorepo.js';

export {
  resolveRef,
  getLog,
  getStatus,
  getDiff,
  getChangedFiles,
  getStagedDiff,
  getWorkingDiff,
} from './git.js';

export {
  resolveScope,
  parseRange,
  validateRef,
  type ScopeOptions,
} from './scope.js';

export type { ReviewScope, FileChange, Repository, Workspace } from '../types/index.js';
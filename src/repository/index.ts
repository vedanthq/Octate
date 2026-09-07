/**
 * Public repository API.
 * Exports all repository layer functionality.
 */

export type { FileChange, Repository, ReviewScope, Workspace } from '../types/index.js';
export {
  detectWorkspace,
  discoverRepository,
  findGitRoot,
} from './discovery.js';
export {
  createFileFilter,
  FileFilter,
  type FileFilterConfig,
  type FileFilterConfig as FileFilterOptions,
  type FileFilterResult,
  type FileFilterResult as FileAnalysisResult,
  isBinaryFile,
  isBinaryFileFast,
  isGeneratedFile,
  isSymlink,
  resolveSymlinkSafely,
} from './filter.js';
export {
  getChangedFiles,
  getDiff,
  getLog,
  getStagedDiff,
  getStatus,
  getWorkingDiff,
  resolveRef,
} from './git.js';

export {
  createIgnoreMatcher,
  createWorkspaceIgnoreMatcher,
  type IgnoreMatcher,
  type IgnoreParseResult,
  loadIgnorePatterns,
  normalizePathForIgnore,
  parseIgnoreFile,
} from './ignore.js';
export {
  aggregateWorkspaces,
  detectMonorepo,
  expandWorkspacePatterns,
  type MonorepoConfig,
  type MonorepoType,
} from './monorepo.js';
export {
  parseRange,
  resolveScope,
  type ScopeOptions,
  validateRef,
} from './scope.js';

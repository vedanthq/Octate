/**
 * Tests for core domain types.
 */

import {
  type FileChange,
  isFileChange,
  isMonorepoConfig,
  isRepository,
  isReviewScope,
  isWorkspace,
  type MonorepoConfig,
  type Repository,
  type ReviewScope,
  type Workspace,
} from './index.js';

describe('Core Domain Types', () => {
  describe('Repository', () => {
    it('should have correct structure', () => {
      const repo: Repository = {
        root: '/test/repo',
        gitDir: '/test/repo/.git',
        workspaces: [],
      };
      expect(repo.root).toBe('/test/repo');
      expect(repo.gitDir).toBe('/test/repo/.git');
      expect(Array.isArray(repo.workspaces)).toBe(true);
    });

    it('should support optional monorepo config', () => {
      const repo: Repository = {
        root: '/test/repo',
        gitDir: '/test/repo/.git',
        workspaces: [],
        monorepo: {
          type: 'pnpm',
          root: '/test/repo',
          workspaces: ['packages/*'],
        },
      };
      expect(repo.monorepo).toBeDefined();
      expect(repo.monorepo?.type).toBe('pnpm');
    });
  });

  describe('Workspace', () => {
    it('should have correct structure', () => {
      const workspace: Workspace = {
        root: '/test/repo/packages/pkg1',
        name: 'pkg1',
        packageManager: 'pnpm',
        ignorePatterns: ['**/*.test.ts'],
      };
      expect(workspace.root).toBe('/test/repo/packages/pkg1');
      expect(workspace.name).toBe('pkg1');
      expect(workspace.packageManager).toBe('pnpm');
      expect(workspace.ignorePatterns).toEqual(['**/*.test.ts']);
    });

    it('should accept all valid package managers', () => {
      const managers: Workspace['packageManager'][] = ['pnpm', 'npm', 'yarn', 'turbo', 'nx'];
      managers.forEach((manager) => {
        const workspace: Workspace = {
          root: '/test',
          name: 'test',
          packageManager: manager,
          ignorePatterns: [],
        };
        expect(workspace.packageManager).toBe(manager);
      });
    });
  });

  describe('MonorepoConfig', () => {
    it('should have correct structure', () => {
      const config: MonorepoConfig = {
        type: 'pnpm',
        root: '/test/repo',
        workspaces: ['packages/*', 'apps/*'],
      };
      expect(config.type).toBe('pnpm');
      expect(config.root).toBe('/test/repo');
      expect(config.workspaces).toEqual(['packages/*', 'apps/*']);
    });
  });

  describe('FileChange', () => {
    it('should have correct structure for added file', () => {
      const change: FileChange = {
        path: 'src/new.ts',
        status: 'added',
        diff: '+new content',
      };
      expect(change.path).toBe('src/new.ts');
      expect(change.status).toBe('added');
      expect(change.diff).toBe('+new content');
    });

    it('should support renamed files with oldPath', () => {
      const change: FileChange = {
        path: 'src/renamed.ts',
        status: 'renamed',
        oldPath: 'src/old.ts',
        diff: 'similarity index 80%',
      };
      expect(change.oldPath).toBe('src/old.ts');
    });

    it('should accept all valid statuses', () => {
      const statuses: FileChange['status'][] = ['added', 'modified', 'deleted', 'renamed'];
      statuses.forEach((status) => {
        const change: FileChange = { path: 'test.ts', status };
        expect(change.status).toBe(status);
      });
    });
  });

  describe('ReviewScope', () => {
    it('should have correct structure', () => {
      const scope: ReviewScope = {
        type: 'working-tree',
        base: 'HEAD',
        head: 'working-tree',
        files: [{ path: 'src/test.ts', status: 'modified' }],
        diff: 'diff content',
      };
      expect(scope.type).toBe('working-tree');
      expect(scope.base).toBe('HEAD');
      expect(scope.head).toBe('working-tree');
      expect(scope.files).toHaveLength(1);
      expect(scope.diff).toBe('diff content');
    });

    it('should accept all valid scope types', () => {
      const types: ReviewScope['type'][] = ['working-tree', 'staged', 'commit', 'range', 'branch'];
      types.forEach((type) => {
        const scope: ReviewScope = {
          type,
          base: 'base',
          head: 'head',
          files: [],
          diff: '',
        };
        expect(scope.type).toBe(type);
      });
    });
  });

  describe('Type Guards', () => {
    describe('isRepository', () => {
      it('should return true for valid Repository', () => {
        const repo: Repository = {
          root: '/test',
          gitDir: '/test/.git',
          workspaces: [],
        };
        expect(isRepository(repo)).toBe(true);
      });

      it('should return false for invalid object', () => {
        expect(isRepository(null)).toBe(false);
        expect(isRepository(undefined)).toBe(false);
        expect(isRepository({})).toBe(false);
        expect(isRepository({ root: '/test' })).toBe(false);
      });
    });

    describe('isWorkspace', () => {
      it('should return true for valid Workspace', () => {
        const workspace: Workspace = {
          root: '/test',
          name: 'test',
          packageManager: 'pnpm',
          ignorePatterns: [],
        };
        expect(isWorkspace(workspace)).toBe(true);
      });

      it('should return false for invalid object', () => {
        expect(isWorkspace(null)).toBe(false);
        expect(isWorkspace({})).toBe(false);
      });
    });

    describe('isMonorepoConfig', () => {
      it('should return true for valid MonorepoConfig', () => {
        const config: MonorepoConfig = {
          type: 'pnpm',
          root: '/test',
          workspaces: ['packages/*'],
        };
        expect(isMonorepoConfig(config)).toBe(true);
      });

      it('should return false for invalid object', () => {
        expect(isMonorepoConfig(null)).toBe(false);
        expect(isMonorepoConfig({})).toBe(false);
      });
    });

    describe('isFileChange', () => {
      it('should return true for valid FileChange', () => {
        const change: FileChange = { path: 'test.ts', status: 'modified' };
        expect(isFileChange(change)).toBe(true);
      });

      it('should return false for invalid object', () => {
        expect(isFileChange(null)).toBe(false);
        expect(isFileChange({})).toBe(false);
        expect(isFileChange({ path: 'test.ts' })).toBe(false);
      });
    });

    describe('isReviewScope', () => {
      it('should return true for valid ReviewScope', () => {
        const scope: ReviewScope = {
          type: 'working-tree',
          base: 'HEAD',
          head: 'working-tree',
          files: [],
          diff: '',
        };
        expect(isReviewScope(scope)).toBe(true);
      });

      it('should return false for invalid object', () => {
        expect(isReviewScope(null)).toBe(false);
        expect(isReviewScope({})).toBe(false);
        expect(isReviewScope({ type: 'working-tree', base: 'HEAD' })).toBe(false);
      });
    });
  });
});

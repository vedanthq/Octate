import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, mergeConfigs, parseEnvConfig } from './merger.js';
import { DefaultConfig, type OctateConfig } from './schema.js';

describe('config/merger', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    testDir = join(tmpdir(), `octate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await rm(testDir, { recursive: true, force: true });
  });

  describe('parseEnvConfig', () => {
    it('returns empty object when no OCTATE_ vars set', () => {
      const envConfig = parseEnvConfig();
      expect(envConfig).toEqual({});
    });

    it('parses simple string values', () => {
      process.env.OCTATE_PROJECT_NAME = 'env-project';
      const envConfig = parseEnvConfig();
      expect(envConfig.project?.name).toBe('env-project');
    });

    it('parses JSON values', () => {
      process.env.OCTATE_REVIEW_MAX_FINDINGS = '75';
      const envConfig = parseEnvConfig();
      expect(envConfig.review?.maxFindings).toBe(75);
    });

    it('parses boolean values', () => {
      process.env.OCTATE_REVIEW_SEVERITY = 'high';
      const envConfig = parseEnvConfig();
      expect(envConfig.review?.severity).toBe('high');
    });

    it('parses nested object paths', () => {
      process.env.OCTATE_ARCHITECTURE_BOUNDARIES = '["src/core", "src/api"]';
      const envConfig = parseEnvConfig();
      expect(envConfig.architecture?.boundaries).toEqual(['src/core', 'src/api']);
    });

    it('handles multiple env vars', () => {
      process.env.OCTATE_PROJECT_NAME = 'multi-project';
      process.env.OCTATE_REVIEW_SEVERITY = 'high';
      process.env.OCTATE_REVIEW_MAX_FINDINGS = '25';
      const envConfig = parseEnvConfig();
      expect(envConfig.project?.name).toBe('multi-project');
      expect(envConfig.review?.severity).toBe('high');
      expect(envConfig.review?.maxFindings).toBe(25);
    });
  });

  describe('mergeConfigs', () => {
    it('returns defaults when all layers are defaults', () => {
      const merged = mergeConfigs(DefaultConfig, DefaultConfig, DefaultConfig, {}, {});
      expect(merged).toEqual(DefaultConfig);
    });

    it('global overrides defaults when project does not override', () => {
      const global: OctateConfig = {
        ...DefaultConfig,
        project: { name: 'global-project' },
        review: { ...DefaultConfig.review, severity: 'high', maxFindings: 100 },
      };
      // Project config that only sets project name (not review)
      // Using Partial to avoid overriding review
      const project: Partial<OctateConfig> = {
        project: { name: 'unnamed-project' },
      };
      const merged = mergeConfigs(DefaultConfig, global, project as OctateConfig, {}, {});
      // Project name from project config
      expect(merged.project.name).toBe('unnamed-project');
      // Review settings from global (project didn't override)
      expect(merged.review.severity).toBe('high');
      expect(merged.review.maxFindings).toBe(100);
    });

    it('project overrides global', () => {
      const global: OctateConfig = {
        ...DefaultConfig,
        project: { name: 'global-project' },
        review: { ...DefaultConfig.review, severity: 'high', maxFindings: 100 },
      };
      const project: OctateConfig = {
        ...DefaultConfig,
        project: { name: 'project-name' },
        review: { ...DefaultConfig.review, severity: 'medium', maxFindings: 50 }, // project sets severity back to medium
      };
      const merged = mergeConfigs(DefaultConfig, global, project, {}, {});
      expect(merged.project.name).toBe('project-name');
      expect(merged.review.severity).toBe('medium');
    });

    it('env overrides project', () => {
      const project: OctateConfig = {
        ...DefaultConfig,
        project: { name: 'project-name' },
        review: { ...DefaultConfig.review, severity: 'medium', maxFindings: 50 },
      };
      const env: Partial<OctateConfig> = {
        project: { name: 'env-name' },
        review: { ...DefaultConfig.review, severity: 'medium', maxFindings: 75 },
      };
      const merged = mergeConfigs(DefaultConfig, DefaultConfig, project, env, {});
      expect(merged.project.name).toBe('env-name');
      expect(merged.review.maxFindings).toBe(75);
      expect(merged.review.severity).toBe('medium'); // project value preserved
    });

    it('CLI overrides env', () => {
      const env: Partial<OctateConfig> = {
        review: { ...DefaultConfig.review, severity: 'high', maxFindings: 75 },
      };
      const cli: Partial<OctateConfig> = {
        review: { ...DefaultConfig.review, severity: 'high', maxFindings: 10 },
      };
      const merged = mergeConfigs(DefaultConfig, DefaultConfig, DefaultConfig, env, cli);
      expect(merged.review.severity).toBe('high'); // from env
      expect(merged.review.maxFindings).toBe(10); // from CLI
    });

    it('full precedence chain: defaults → global → project → env → CLI', () => {
      const global: OctateConfig = {
        ...DefaultConfig,
        project: { name: 'global' },
        review: { ...DefaultConfig.review, severity: 'low', maxFindings: 100 },
        architecture: { boundaries: ['global-boundary'], forbiddenDependencies: [] },
      };
      const project: OctateConfig = {
        ...DefaultConfig,
        project: { name: 'project' },
        review: { ...DefaultConfig.review, severity: 'medium', maxFindings: 50 },
        architecture: { boundaries: ['project-boundary'], forbiddenDependencies: ['lodash'] },
      };
      const env: Partial<OctateConfig> = {
        review: { ...DefaultConfig.review, severity: 'high', maxFindings: 50 },
        architecture: { boundaries: ['project-boundary'], forbiddenDependencies: ['moment'] },
      };
      const cli: Partial<OctateConfig> = {
        review: { ...DefaultConfig.review, severity: 'high', maxFindings: 25 },
        architecture: { boundaries: ['cli-boundary'], forbiddenDependencies: ['moment'] },
      };

      const merged = mergeConfigs(DefaultConfig, global, project, env, cli);

      // CLI wins for maxFindings and boundaries
      expect(merged.review.maxFindings).toBe(25);
      expect(merged.architecture.boundaries).toEqual(['cli-boundary']);

      // Env wins for severity and forbiddenDependencies (overridden by CLI for boundaries)
      expect(merged.review.severity).toBe('high');
      expect(merged.architecture.forbiddenDependencies).toEqual(['moment']);

      // Project wins for project.name
      expect(merged.project.name).toBe('project');
    });

    it('deep merges arrays by replacement (not concat)', () => {
      const global: OctateConfig = {
        ...DefaultConfig,
        ignore: ['*.log', 'dist/'],
      };
      const project: OctateConfig = {
        ...DefaultConfig,
        ignore: ['*.tmp', 'build/'],
      };
      const merged = mergeConfigs(DefaultConfig, global, project, {}, {});
      expect(merged.ignore).toEqual(['*.tmp', 'build/']);
    });

    it('validates final merged config', () => {
      const invalid = {
        ...DefaultConfig,
        project: { name: '' }, // invalid: empty name
      };
      expect(() => mergeConfigs(DefaultConfig, DefaultConfig, invalid, {}, {})).toThrow();
    });
  });

  describe('loadConfig', () => {
    it('loads full config chain', async () => {
      // Create project config
      await writeFile(
        join(testDir, 'octate.yaml'),
        'version: "1.0.0"\nproject:\n  name: project-config\nreview:\n  severity: medium\n'
      );

      // Create global config
      const globalDir = join(testDir, '.config', 'octate');
      await mkdir(globalDir, { recursive: true });
      await writeFile(
        join(globalDir, 'config.yaml'),
        'version: "1.0.0"\nproject:\n  name: global-config\nreview:\n  maxFindings: 100\n'
      );
      process.env.HOME = testDir;
      process.env.XDG_CONFIG_HOME = join(testDir, '.config');

      // Set env var
      process.env.OCTATE_REVIEW_SEVERITY = 'high';

      const config = await loadConfig({
        cliConfig: { review: { severity: 'high', maxFindings: 10 } },
      });

      expect(config.project.name).toBe('project-config'); // project wins
      expect(config.review.severity).toBe('high'); // env wins
      expect(config.review.maxFindings).toBe(10); // CLI wins
    });
  });
});

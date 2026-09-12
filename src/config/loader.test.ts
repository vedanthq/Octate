import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findConfigFile, loadGlobalConfig, loadProjectConfig } from './loader.js';
import { DefaultConfig } from './schema.js';

describe('config/loader', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalXdgConfig: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;
    originalXdgConfig = process.env.XDG_CONFIG_HOME;

    testDir = join(tmpdir(), `octate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalXdgConfig !== undefined) {
      process.env.XDG_CONFIG_HOME = originalXdgConfig;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    await rm(testDir, { recursive: true, force: true });
  });

  describe('findConfigFile', () => {
    it('finds octate.yaml in current directory', async () => {
      await writeFile(join(testDir, 'octate.yaml'), 'version: "1.0.0"\nproject:\n  name: test\n');
      const found = await findConfigFile();
      expect(found).toBe(join(testDir, 'octate.yaml'));
    });

    it('finds octate.yaml in parent directory', async () => {
      const subDir = join(testDir, 'sub', 'dir');
      await mkdir(subDir, { recursive: true });
      await writeFile(join(testDir, 'octate.yaml'), 'version: "1.0.0"\nproject:\n  name: test\n');
      process.chdir(subDir);
      const found = await findConfigFile();
      expect(found).toBe(join(testDir, 'octate.yaml'));
    });

    it('returns null when no config file exists', async () => {
      const found = await findConfigFile();
      expect(found).toBeNull();
    });
  });

  describe('loadProjectConfig', () => {
    it('returns DefaultConfig when no config file exists', async () => {
      const config = await loadProjectConfig();
      expect(config).toEqual(DefaultConfig);
    });

    it('loads and validates valid config file', async () => {
      await writeFile(
        join(testDir, 'octate.yaml'),
        'version: "2.0.0"\nproject:\n  name: my-project\nreview:\n  severity: high\n'
      );
      const config = await loadProjectConfig();
      expect(config.version).toBe('2.0.0');
      expect(config.project.name).toBe('my-project');
      expect(config.review.severity).toBe('high');
    });

    it('throws on invalid config', async () => {
      await writeFile(join(testDir, 'octate.yaml'), 'version: "invalid"\nproject:\n  name: test\n');
      await expect(loadProjectConfig()).rejects.toThrow('Invalid octate.yaml');
    });

    it('throws on unknown keys (strict mode)', async () => {
      await writeFile(
        join(testDir, 'octate.yaml'),
        'version: "1.0.0"\nproject:\n  name: test\nunknown: value\n'
      );
      await expect(loadProjectConfig()).rejects.toThrow('Invalid octate.yaml');
    });

    it('uses explicit config path when provided', async () => {
      const customDir = join(testDir, 'custom');
      await mkdir(customDir, { recursive: true });
      await writeFile(
        join(customDir, 'custom.yaml'),
        'version: "1.0.0"\nproject:\n  name: custom-project\n'
      );
      const config = await loadProjectConfig(join(customDir, 'custom.yaml'));
      expect(config.project.name).toBe('custom-project');
    });
  });

  describe('loadGlobalConfig', () => {
    it('returns DefaultConfig when no global config exists', async () => {
      process.env.HOME = testDir;
      process.env.XDG_CONFIG_HOME = join(testDir, '.config');
      const config = await loadGlobalConfig();
      expect(config).toEqual(DefaultConfig);
    });

    it('loads global config from XDG_CONFIG_HOME', async () => {
      const configDir = join(testDir, '.config', 'octate');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.yaml'),
        'version: "1.0.0"\nproject:\n  name: global-project\nreview:\n  maxFindings: 100\n'
      );
      process.env.HOME = testDir;
      process.env.XDG_CONFIG_HOME = join(testDir, '.config');
      const config = await loadGlobalConfig();
      expect(config.project.name).toBe('global-project');
      expect(config.review.maxFindings).toBe(100);
    });

    it('falls back to ~/.config when XDG_CONFIG_HOME not set', async () => {
      const configDir = join(testDir, '.config', 'octate');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.yaml'),
        'version: "1.0.0"\nproject:\n  name: fallback-project\n'
      );
      process.env.HOME = testDir;
      delete process.env.XDG_CONFIG_HOME;
      const config = await loadGlobalConfig();
      expect(config.project.name).toBe('fallback-project');
    });

    it('returns DefaultConfig on validation error (warns but does not throw)', async () => {
      const configDir = join(testDir, '.config', 'octate');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.yaml'), 'invalid: yaml: [\n');
      process.env.HOME = testDir;
      process.env.XDG_CONFIG_HOME = join(testDir, '.config');
      const config = await loadGlobalConfig();
      expect(config).toEqual(DefaultConfig);
    });
  });
});

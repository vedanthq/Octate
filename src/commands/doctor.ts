/**
 * Doctor command - validates configuration, Git access, NVIDIA connectivity, and cache health.
 */

import { Command } from 'commander';
import { getCacheDir, initializeProjectCache } from '../cache/identity.js';
import { createCacheStore } from '../cache/store.js';
import { loadConfig } from '../config/merger.js';
import { ConfigurationError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';
import { findGitRoot } from '../repository/discovery.js';

const _logger = createLogger('commands:doctor');

/**
 * Creates the doctor command for Commander.js.
 */
export function createDoctorCommand(): Command {
  const cmd = new Command('doctor')
    .description('Validate Octate configuration, Git access, NVIDIA connectivity, and cache health')
    .option('--json', 'Output results as JSON')
    .option('-q, --quiet', 'Minimal output (summary only)')
    .action(async (options: DoctorOptions) => {
      return runDoctor(options);
    });

  return cmd;
}

/**
 * Doctor command options interface.
 */
interface DoctorOptions {
  json?: boolean;
  quiet?: boolean;
  config?: string;
  cacheDir?: string;
  logLevel?: string;
  debug?: boolean;
}

/**
 * Doctor check result.
 */
interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Doctor result.
 */
interface DoctorResult {
  timestamp: string;
  version: string;
  checks: DoctorCheck[];
  overall: 'pass' | 'fail' | 'warn';
}

/**
 * Main doctor execution function.
 */
async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks: DoctorCheck[] = [];

  // 1. Check configuration
  checks.push(await checkConfiguration(options));

  // 2. Check Git repository access
  checks.push(await checkGitAccess());

  // 3. Check NVIDIA connectivity (local mode)
  checks.push(await checkNvidiaConnectivity());

  // 4. Check cache health
  checks.push(await checkCacheHealth());

  // Determine overall status
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

  const result: DoctorResult = {
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    checks,
    overall,
  };

  // Output results
  await outputDoctorResults(result, options);

  // Exit with appropriate code
  if (overall === 'fail') {
    process.exit(2); // Config error
  }
}

/**
 * Checks configuration validity.
 */
async function checkConfiguration(_options: DoctorOptions): Promise<DoctorCheck> {
  try {
    const config = await loadConfig({
      cliConfig: {},
    });

    return {
      name: 'Configuration',
      status: 'pass',
      message: `Valid configuration for project "${config.project.name}"`,
      details: {
        version: config.version,
        project: config.project.name,
        reviewSeverity: config.review.severity,
        maxFindings: config.review.maxFindings,
        rulesCount: config.rules.length,
        architectureBoundaries: config.architecture.boundaries.length,
        ignorePatterns: config.ignore.length,
      },
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return {
        name: 'Configuration',
        status: 'fail',
        message: error.message,
        details: error.context,
      };
    }
    return {
      name: 'Configuration',
      status: 'fail',
      message: `Configuration check failed: ${error}`,
    };
  }
}

/**
 * Checks Git repository access.
 */
async function checkGitAccess(): Promise<DoctorCheck> {
  try {
    const repoRoot = await findGitRoot(process.cwd());

    if (!repoRoot) {
      return {
        name: 'Git Repository',
        status: 'fail',
        message: 'Not a Git repository (or any parent directory)',
      };
    }

    // Try to read Git status
    const { status } = await import('isomorphic-git');
    const gitStatus = await status({
      fs: (await import('node:fs/promises')).default,
      dir: repoRoot,
      filepath: '.',
    });

    return {
      name: 'Git Repository',
      status: 'pass',
      message: `Git repository accessible at ${repoRoot}`,
      details: {
        repoRoot,
        status: gitStatus,
      },
    };
  } catch (error) {
    return {
      name: 'Git Repository',
      status: 'fail',
      message: `Git access failed: ${error}`,
    };
  }
}

/**
 * Checks NVIDIA API connectivity (local mode).
 */
async function checkNvidiaConnectivity(): Promise<DoctorCheck> {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return {
      name: 'NVIDIA API',
      status: 'warn',
      message: 'NVIDIA_API_KEY not set (local mode only)',
      details: {
        note: 'Set NVIDIA_API_KEY environment variable for API access',
      },
    };
  }

  // Test connectivity with a simple request
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const nemotronAvailable = data.data?.some((model) => model.id.includes('nemotron-3-ultra'));

      return {
        name: 'NVIDIA API',
        status: 'pass',
        message: 'NVIDIA API accessible',
        details: {
          nemotron3UltraAvailable: nemotronAvailable,
          modelsCount: data.data?.length ?? 0,
        },
      };
    } else {
      return {
        name: 'NVIDIA API',
        status: 'fail',
        message: `NVIDIA API returned ${response.status}: ${response.statusText}`,
        details: { status: response.status, statusText: response.statusText },
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        name: 'NVIDIA API',
        status: 'fail',
        message: 'NVIDIA API request timed out (10s)',
      };
    }
    return {
      name: 'NVIDIA API',
      status: 'fail',
      message: `NVIDIA API connectivity failed: ${error}`,
    };
  }
}

/**
 * Checks cache health.
 */
async function checkCacheHealth(): Promise<DoctorCheck> {
  try {
    const repoRoot = process.cwd();
    const { getCacheDir, initializeProjectCache } = await import('../cache/identity.js');
    const cachePaths = await getCacheDir(repoRoot);
    await initializeProjectCache(repoRoot);

    // Create cache store to test
    const store = await createCacheStore({
      rootDir: cachePaths.cache,
      maxSize: 100 * 1024 * 1024, // 100MB default
    });

    // Test write/read
    const testKey = 'doctor-health-check';
    const testValue = { test: true, timestamp: Date.now() };
    await store.set(testKey, testValue);
    const retrieved = await store.get(testKey);
    await store.delete(testKey);

    const isWorking =
      retrieved &&
      typeof retrieved === 'object' &&
      retrieved.value &&
      typeof retrieved.value === 'object' &&
      'test' in retrieved.value;

    // Get cache stats
    let size = 0;
    const entryCount = 0;
    try {
      const { stat } = await import('node:fs/promises');
      const stats = await stat(cachePaths.cache);
      size = stats.size ?? 0;
    } catch {
      // Ignore
    }

    return {
      name: 'Cache',
      status: isWorking ? 'pass' : 'warn',
      message: isWorking ? 'Cache is healthy and operational' : 'Cache read/write test failed',
      details: {
        cacheDir: cachePaths.cache,
        sizeBytes: size,
        entryCount,
        readWriteTest: isWorking ? 'pass' : 'fail',
      },
    };
  } catch (error) {
    return {
      name: 'Cache',
      status: 'fail',
      message: `Cache health check failed: ${error}`,
    };
  }
}

/**
 * Outputs doctor results.
 */
async function outputDoctorResults(result: DoctorResult, options: DoctorOptions): Promise<void> {
  if (options.json) {
    // biome-ignore lint/suspicious/noConsole: CLI user output
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.quiet) {
    const statusIcon = result.overall === 'pass' ? '✓' : result.overall === 'warn' ? '⚠' : '✗';
    const passed = result.checks.filter((c) => c.status === 'pass').length;
    const failed = result.checks.filter((c) => c.status === 'fail').length;
    const warned = result.checks.filter((c) => c.status === 'warn').length;
    // biome-ignore lint/suspicious/noConsole: CLI user output
    console.log(`${statusIcon} ${passed} passed, ${warned} warnings, ${failed} failed`);
    return;
  }

  // Default human-readable output
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ' Octate Doctor',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  for (const check of result.checks) {
    const statusIcon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    lines.push(`${statusIcon} ${check.name}: ${check.message}`);

    if (check.details && !options.quiet) {
      for (const [key, value] of Object.entries(check.details)) {
        lines.push(`    ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  lines.push('');
  const overallIcon = result.overall === 'pass' ? '✓' : result.overall === 'warn' ? '⚠' : '✗';
  lines.push(`${overallIcon} Overall: ${result.overall.toUpperCase()}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // biome-ignore lint/suspicious/noConsole: CLI user output
  console.log(lines.join('\n'));
}

/**
 * Exported doctor command for registration.
 */
export const doctorCommand = createDoctorCommand();

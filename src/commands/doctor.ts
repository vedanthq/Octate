/**
 * Doctor command - validates configuration, Node.js runtime, Git access,
 * static tools on PATH, Tree-sitter WASM grammars, NVIDIA connectivity, and cache health.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { getCacheDir, initializeProjectCache } from '../cache/identity.js';
import { createCacheStore } from '../cache/store.js';
import { which } from '../cancellation/index.js';
import { loadConfig } from '../config/merger.js';
import { ConfigurationError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';
import { findGitRoot } from '../repository/discovery.js';

const logger = createLogger('commands:doctor');

/**
 * Doctor command options interface.
 */
export interface DoctorOptions {
  json?: boolean;
  quiet?: boolean;
  config?: string;
  cacheDir?: string;
  logLevel?: string;
  debug?: boolean;
}

/**
 * Doctor check result interface.
 */
export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, unknown> | undefined;
  remediation?: string | undefined;
}

/**
 * Doctor aggregated result.
 */
export interface DoctorResult {
  timestamp: string;
  version: string;
  checks: DoctorCheck[];
  overall: 'pass' | 'fail' | 'warn';
}

/**
 * Creates the doctor command for Commander.js.
 */
export function createDoctorCommand(): Command {
  const cmd = new Command('doctor')
    .description('Validate Octate configuration, Git access, NVIDIA connectivity, and cache health')
    .option('--json', 'Output results as JSON')
    .option('-q, --quiet', 'Minimal output (summary only)')
    .action(async (options: DoctorOptions) => {
      await runDoctor(options);
    });

  return cmd;
}

/**
 * Checks Node.js runtime compatibility (>= 22.0.0 required by Ink 7.1.1).
 */
export function checkNodeRuntime(version: string = process.version): DoctorCheck {
  const match = version.match(/^v?(\d+)/);
  const firstMatch = match?.[1];
  const major = firstMatch ? parseInt(firstMatch, 10) : 0;

  if (major < 22) {
    return {
      name: 'Node.js Runtime',
      status: 'fail',
      message: `Node.js >= 22.0.0 required by Ink 7.1.1 (found ${version})`,
      remediation: 'Upgrade Node.js to version 22 or later (https://nodejs.org)',
      details: {
        version,
        required: '>= 22.0.0',
      },
    };
  }

  return {
    name: 'Node.js Runtime',
    status: 'pass',
    message: `Node.js ${version} (>= 22.0.0)`,
    details: {
      version,
      required: '>= 22.0.0',
    },
  };
}

/**
 * Checks configuration validity.
 */
export async function checkConfiguration(options: DoctorOptions = {}): Promise<DoctorCheck> {
  try {
    const config = await loadConfig({
      configPath: options.config,
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
        remediation: 'Check octate.yaml for syntax and schema errors',
      };
    }
    return {
      name: 'Configuration',
      status: 'fail',
      message: `Configuration check failed: ${error instanceof Error ? error.message : String(error)}`,
      remediation: 'Ensure octate.yaml exists or initialize with octate init',
    };
  }
}

/**
 * Checks Git repository access and status.
 */
export async function checkGitAccess(): Promise<DoctorCheck> {
  try {
    const repoRoot = await findGitRoot(process.cwd());

    if (!repoRoot) {
      return {
        name: 'Git Repository',
        status: 'fail',
        message: 'Not a Git repository (or any parent directory)',
        remediation: 'Run git init or navigate into a git repository',
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
      message: `Git access failed: ${error instanceof Error ? error.message : String(error)}`,
      remediation: 'Verify git repository permissions and integrity',
    };
  }
}

export const STATIC_TOOLS_CHECKLIST: Array<{ name: string; lang: string; install: string }> = [
  { name: 'tsc', lang: 'TypeScript', install: 'npm i -D typescript' },
  { name: 'biome', lang: 'TypeScript/JavaScript', install: 'npm i -D @biomejs/biome' },
  { name: 'eslint', lang: 'JavaScript/TypeScript', install: 'npm i -D eslint' },
  { name: 'ruff', lang: 'Python', install: 'pip install ruff' },
  { name: 'mypy', lang: 'Python', install: 'pip install mypy' },
  { name: 'pyright', lang: 'Python', install: 'npm i -D pyright or pip install pyright' },
  { name: 'bandit', lang: 'Python', install: 'pip install bandit' },
  { name: 'pytest', lang: 'Python', install: 'pip install pytest' },
];

/**
 * Discovers static analysis tools on PATH and suggests remediation for missing tools.
 */
export async function checkStaticTools(
  whichFn: (cmd: string) => Promise<string | null> = which
): Promise<DoctorCheck> {
  const detected: string[] = [];
  const missing: string[] = [];
  const missingInstalls: string[] = [];

  for (const tool of STATIC_TOOLS_CHECKLIST) {
    const toolPath = await whichFn(tool.name);
    if (toolPath) {
      detected.push(tool.name);
    } else {
      missing.push(tool.name);
      missingInstalls.push(`${tool.name} (${tool.install})`);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'Static Analysis Tools',
      status: 'warn',
      message: `Detected ${detected.length}/${STATIC_TOOLS_CHECKLIST.length} tools on PATH. Available: [${detected.join(', ')}]. Missing: [${missing.join(', ')}]`,
      details: {
        detected,
        missing,
      },
      remediation: `Install missing tools for enhanced analysis: ${missingInstalls.join('; ')}`,
    };
  }

  return {
    name: 'Static Analysis Tools',
    status: 'pass',
    message: `All ${STATIC_TOOLS_CHECKLIST.length} static analysis tools detected on PATH`,
    details: {
      detected,
      missing: [],
    },
  };
}

/**
 * Validates Tree-sitter WASM grammar availability.
 */
export async function checkWasmGrammars(): Promise<DoctorCheck> {
  try {
    const { initParser } = await import('../analysis/parser/index.js');
    const { languages } = await initParser();

    const hasTs = languages.has('typescript');
    const hasPy = languages.has('python');

    if (!hasTs || !hasPy) {
      return {
        name: 'Tree-sitter WASM Grammars',
        status: 'fail',
        message: 'Incomplete Tree-sitter WASM grammars: missing required language grammars',
        remediation: 'Run npm run build to ensure WASM grammars are copied',
      };
    }

    return {
      name: 'Tree-sitter WASM Grammars',
      status: 'pass',
      message: 'Tree-sitter WASM grammars loaded successfully (TypeScript, JavaScript, Python)',
      details: {
        languages: Array.from(languages.keys()),
      },
    };
  } catch (error) {
    return {
      name: 'Tree-sitter WASM Grammars',
      status: 'fail',
      message: `Failed to load Tree-sitter WASM grammars: ${error instanceof Error ? error.message : String(error)}`,
      remediation: 'Run npm run build to ensure WASM grammars are copied',
    };
  }
}

/**
 * Three-tier NVIDIA API connectivity check.
 * Tier 1: Check NVIDIA_API_KEY environment variable.
 * Tier 2: Ping /v1/models endpoint with 10s AbortController timeout.
 * Tier 3: Verify nemotron-3-ultra model availability in catalog without burning inference tokens.
 */
export async function checkNvidiaConnectivity(
  apiKey: string | undefined = process.env.NVIDIA_API_KEY,
  fetchFn: typeof fetch = fetch
): Promise<DoctorCheck> {
  // Tier 1: Key existence check
  if (!apiKey) {
    return {
      name: 'NVIDIA API',
      status: 'warn',
      message: 'NVIDIA_API_KEY not set (offline review mode only)',
      remediation: 'Set export NVIDIA_API_KEY="nvapi-..." for AI review features',
      details: {
        tier: 1,
        offlineMode: true,
      },
    };
  }

  // Tier 2 & Tier 3: Models catalog ping and nemotron check
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    timeoutId.unref();

    let response: Response;
    try {
      response = await fetchFn('https://integrate.api.nvidia.com/v1/models', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const nemotronAvailable = data.data?.some(
        (model) =>
          model.id.includes('nemotron-3-ultra') || model.id.includes('nemotron-3-ultra-550b-a55b')
      );

      if (nemotronAvailable) {
        return {
          name: 'NVIDIA API',
          status: 'pass',
          message: 'NVIDIA API connected and Nemotron 3 Ultra model verified',
          details: {
            tier: 3,
            modelsCount: data.data?.length ?? 0,
            nemotronAvailable: true,
          },
        };
      }

      return {
        name: 'NVIDIA API',
        status: 'warn',
        message: 'API connected but nemotron-3-ultra not found in model catalog',
        remediation: 'Verify your NVIDIA API key permissions and model catalog access',
        details: {
          tier: 3,
          modelsCount: data.data?.length ?? 0,
          nemotronAvailable: false,
        },
      };
    }

    return {
      name: 'NVIDIA API',
      status: 'fail',
      message: `NVIDIA API returned ${response.status}: ${response.statusText}`,
      remediation: 'Verify your NVIDIA API key validity and quota',
      details: {
        status: response.status,
        statusText: response.statusText,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        name: 'NVIDIA API',
        status: 'fail',
        message: 'NVIDIA API request timed out (10s)',
        remediation: 'Check internet connection and firewall settings',
      };
    }
    return {
      name: 'NVIDIA API',
      status: 'fail',
      message: `NVIDIA API connectivity failed: ${error instanceof Error ? error.message : String(error)}`,
      remediation: 'Check internet connection and firewall settings',
    };
  }
}

/**
 * Checks cache health and read/write operational capability.
 */
export async function checkCacheHealth(): Promise<DoctorCheck> {
  try {
    const repoRoot = process.cwd();
    const cachePaths = await getCacheDir(repoRoot);
    await initializeProjectCache(repoRoot);

    const store = await createCacheStore({
      rootDir: cachePaths.cache,
      maxSize: 100 * 1024 * 1024,
    });

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

    let size = 0;
    try {
      const { stat } = await import('node:fs/promises');
      const stats = await stat(cachePaths.cache);
      size = stats.size ?? 0;
    } catch {
      // Directory size non-critical
    }

    return {
      name: 'Cache',
      status: isWorking ? 'pass' : 'warn',
      message: isWorking ? 'Cache is healthy and operational' : 'Cache read/write test failed',
      remediation: isWorking ? undefined : 'Clear cache directory or verify directory permissions',
      details: {
        cacheDir: cachePaths.cache,
        sizeBytes: size,
        readWriteTest: isWorking ? 'pass' : 'fail',
      },
    };
  } catch (error) {
    return {
      name: 'Cache',
      status: 'fail',
      message: `Cache health check failed: ${error instanceof Error ? error.message : String(error)}`,
      remediation: 'Ensure write permissions exist for cache directory',
    };
  }
}

/**
 * Outputs doctor results in ANSI styled boxes, JSON, or quiet summary.
 */
export function outputDoctorResults(result: DoctorResult, options: DoctorOptions): void {
  if (options.json) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const passed = result.checks.filter((c) => c.status === 'pass').length;
  const warned = result.checks.filter((c) => c.status === 'warn').length;
  const failed = result.checks.filter((c) => c.status === 'fail').length;

  if (options.quiet) {
    const statusIcon =
      result.overall === 'pass'
        ? pc.green('✓')
        : result.overall === 'warn'
          ? pc.yellow('⚠')
          : pc.red('✗');
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(`${statusIcon} ${passed} passed, ${warned} warnings, ${failed} failed`);
    return;
  }

  // Default human-readable ANSI box layout
  const lines: string[] = [
    pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'),
    ` ${pc.bold(pc.cyan('Octate Doctor'))} ${pc.dim(`v${result.version}`)}`,
    pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'),
    '',
  ];

  for (const check of result.checks) {
    let icon = pc.green('✓');
    if (check.status === 'warn') {
      icon = pc.yellow('⚠');
    } else if (check.status === 'fail') {
      icon = pc.red('✗');
    }

    lines.push(`${icon} ${pc.bold(check.name)}: ${check.message}`);

    if (check.details && options.debug) {
      for (const [key, value] of Object.entries(check.details)) {
        lines.push(`    ${pc.dim(key)}: ${JSON.stringify(value)}`);
      }
    }
  }

  const remediations = result.checks.filter((c) => c.remediation);
  if (remediations.length > 0) {
    lines.push('');
    lines.push(pc.yellow('╭─ Remediation Suggestions ──────────────────────────'));
    for (const check of remediations) {
      lines.push(`${pc.yellow('│')} • ${pc.bold(check.name)}: ${check.remediation}`);
    }
    lines.push(pc.yellow('╰────────────────────────────────────────────────────'));
  }

  lines.push('');
  const overallText =
    result.overall === 'pass'
      ? pc.green(pc.bold('PASS'))
      : result.overall === 'warn'
        ? pc.yellow(pc.bold('WARN'))
        : pc.red(pc.bold('FAIL'));

  const overallIcon =
    result.overall === 'pass'
      ? pc.green('✓')
      : result.overall === 'warn'
        ? pc.yellow('⚠')
        : pc.red('✗');

  lines.push(
    `${overallIcon} Overall: ${overallText} (${passed} passed, ${warned} warnings, ${failed} failed)`
  );
  lines.push(pc.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(lines.join('\n'));
}

/**
 * Main doctor execution function.
 */
export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  logger.debug('Starting system doctor checks');

  // 1. Node.js runtime check
  checks.push(checkNodeRuntime());

  // 2. Configuration check
  checks.push(await checkConfiguration(options));

  // 3. Git repository access
  checks.push(await checkGitAccess());

  // 4. Static analysis tools discovery
  checks.push(await checkStaticTools());

  // 5. Tree-sitter WASM grammars
  checks.push(await checkWasmGrammars());

  // 6. NVIDIA API connectivity
  checks.push(await checkNvidiaConnectivity());

  // 7. Cache store health
  checks.push(await checkCacheHealth());

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const overall: 'pass' | 'fail' | 'warn' = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

  const result: DoctorResult = {
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    checks,
    overall,
  };

  outputDoctorResults(result, options);

  // Exit code policy: 0 for pass/warn, 2 for fail
  if (overall === 'fail') {
    process.exitCode = 2;
  } else {
    process.exitCode = 0;
  }

  return result;
}

/**
 * Exported doctor command instance for registration.
 */
export const doctorCommand = createDoctorCommand();

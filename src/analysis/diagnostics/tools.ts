/**
 * Tool detection and subprocess execution for static analysis.
 */

import { createPromisePool } from '../../cache/pool.js';
import { type SpawnWithSignalOptions, spawnWithSignal } from '../../cancellation/subprocess.js';
import { createLogger } from '../../logging/index.js';
import type { Diagnostic } from '../../model/types.js';
import { normalizeDiagnostic } from './severity.js';

const log = createLogger('diagnostics/tools');

export interface ToolConfig {
  name: string;
  command: string;
  args: string[];
  configFile: string;
  languages: string[];
  enabled: boolean;
}

const TOOL_DEFINITIONS: ToolConfig[] = [
  {
    name: 'tsc',
    command: 'npx',
    args: ['tsc', '--noEmit', '--pretty', 'false'],
    configFile: 'tsconfig.json',
    languages: ['typescript', 'javascript'],
    enabled: false,
  },
  {
    name: 'biome',
    command: 'npx',
    args: ['biome', 'check', '--reporter=json'],
    configFile: 'biome.json',
    languages: ['typescript', 'javascript'],
    enabled: false,
  },
  {
    name: 'ruff',
    command: 'ruff',
    args: ['check', '--output-format=json', '.'],
    configFile: 'ruff.toml',
    languages: ['python'],
    enabled: false,
  },
  {
    name: 'mypy',
    command: 'mypy',
    args: ['--show-error-codes', '--no-error-summary', '.'],
    configFile: 'pyproject.toml',
    languages: ['python'],
    enabled: false,
  },
  {
    name: 'pyright',
    command: 'pyright',
    args: ['--outputjson'],
    configFile: 'pyrightconfig.json',
    languages: ['python'],
    enabled: false,
  },
  {
    name: 'bandit',
    command: 'bandit',
    args: ['-f', 'json', '-r', '.'],
    configFile: 'pyproject.toml',
    languages: ['python'],
    enabled: false,
  },
  {
    name: 'pytest',
    command: 'pytest',
    args: ['--collect-only', '-q'],
    configFile: 'pyproject.toml',
    languages: ['python'],
    enabled: false,
  },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    const { access } = await import('node:fs/promises');
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const { spawn } = await import('node:child_process');
    await new Promise<boolean>((resolve) => {
      const proc = spawn('which', [cmd]);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects available analysis tools based on repository configuration.
 * Per D-07: Hybrid tool detection with fallbacks — check config files first,
 * fallback to defaults if missing.
 */
export async function detectTools(repoRoot: string, languages: string[]): Promise<ToolConfig[]> {
  const enabledTools: ToolConfig[] = [];

  for (const toolDef of TOOL_DEFINITIONS) {
    // Filter by language
    if (!toolDef.languages.some((l) => languages.includes(l))) {
      continue;
    }

    const configPath = `${repoRoot}/${toolDef.configFile}`;
    const hasConfig = await fileExists(configPath);

    // Per D-07: Hybrid detection - check config file first, fallback to defaults
    let shouldEnable = hasConfig;

    if (!hasConfig) {
      // Check if tool is available in PATH as fallback
      shouldEnable = await commandExists(toolDef.command);
    }

    if (shouldEnable) {
      const tool: ToolConfig = {
        ...toolDef,
        enabled: true,
      };
      enabledTools.push(tool);
      log.debug({ tool: tool.name, hasConfig }, 'Tool enabled');
    } else {
      log.debug({ tool: toolDef.name }, 'Tool not available');
    }
  }

  return enabledTools;
}

/**
 * Runs a single analysis tool on the given files.
 * Per D-08: Spawn subprocesses for analysis tools
 * Per D-12: Graceful degradation - catch errors, log warning, return empty array
 */
export async function runTool(
  tool: ToolConfig,
  files: string[],
  repoRoot: string,
  signal?: AbortSignal
): Promise<Diagnostic[]> {
  const startTime = Date.now();

  // Check abort signal before running
  if (signal?.aborted) {
    throw new Error('Tool execution aborted');
  }

  try {
    log.debug({ tool: tool.name, fileCount: files.length }, 'Running tool');

    // For tools that work on whole project, we pass the repo root
    // For file-specific tools, we could filter args
    const args = [...tool.args];

    // Add file filters for file-specific tools if needed
    if (
      files.length > 0 &&
      tool.name !== 'tsc' &&
      tool.name !== 'mypy' &&
      tool.name !== 'pyright'
    ) {
      // Some tools accept file arguments
    }

    const spawnOptions: SpawnWithSignalOptions = {
      cwd: repoRoot ?? process.cwd(),
    };
    if (signal) {
      spawnOptions.signal = signal;
    }
    const result = await spawnWithSignal(tool.command, args, spawnOptions);

    const timeMs = Date.now() - startTime;

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      // Exit code 1 is often "found issues" which is expected
      log.warn(
        { tool: tool.name, exitCode: result.exitCode, stderr: result.stderr },
        'Tool exited with non-zero code'
      );
    }

    const diagnostics: Diagnostic[] = [];

    try {
      // Parse JSON output - each tool has different format
      const output = result.stdout.trim();
      if (output) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(output);
        } catch {
          // Not JSON, try parsing line by line
          parsed = output
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        }

        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          const diagnostic = normalizeDiagnostic(item as Record<string, unknown>, tool.name);
          if (diagnostic) {
            diagnostics.push(diagnostic);
          }
        }
      }
    } catch (parseError) {
      log.warn({ tool: tool.name, error: parseError }, 'Failed to parse tool output');
    }

    log.debug({ tool: tool.name, count: diagnostics.length, timeMs }, 'Tool completed');
    return diagnostics;
  } catch (error) {
    // Per D-12: Graceful degradation - log warning, return empty array
    log.warn({ tool: tool.name, error }, 'Tool execution failed - graceful degradation');
    return [];
  }
}

/**
 * Runs multiple tools in parallel with bounded concurrency.
 * Per D-09: Parallel execution with concurrency limit using PromisePool
 */
export async function runToolsParallel(
  tools: ToolConfig[],
  files: string[],
  repoRoot: string,
  signal?: AbortSignal
): Promise<Map<string, Diagnostic[]>> {
  const pool = createPromisePool(3); // Concurrency limit of 3
  const results = new Map<string, Diagnostic[]>();

  const _toolResults = await pool.map(tools, async (tool) => {
    const diagnostics = await runTool(tool, files, repoRoot, signal);
    results.set(tool.name, diagnostics);
    return diagnostics;
  });

  return results;
}

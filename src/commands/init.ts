import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { ConfigurationError } from '../errors/index.js';
import { createLogger } from '../logging/index.js';

const logger = createLogger('commands:init');

/**
 * Generates a commented octate.yaml with all sections and examples.
 */
function generateConfigContent(projectName: string): string {
  return `# Octate Configuration
# See https://octate.dev/config for full documentation

version: "1.0.0"

# Project identification
project:
  name: "${projectName}"
  # description: "My awesome project"  # Optional project description

# Review behavior configuration
review:
  # Minimum severity to report: critical, high, medium, low, info
  severity: "medium"
  # Maximum number of findings to report (1-100)
  max_findings: 50
  # Enable/disable specific reviewer types (all enabled by default)
  # reviewers:
  #   structural: true
  #   semantic: true
  #   security: true

# Custom rules to apply during review
# Each rule is a reference to a built-in or custom rule
rules: []
  # - "no-console-log"
  # - "require-error-handling"
  # - "no-hardcoded-secrets"

# Architecture constraints
architecture:
  # Module boundaries that should not be crossed
  # boundaries:
  #   - "src/core"
  #   - "src/api"
  # Forbidden dependency patterns (glob patterns)
  # forbidden_dependencies:
  #   - "lodash"
  #   - "moment"
  #   - "@internal/*"

# Additional ignore patterns (extends .gitignore and .octateignore)
# These patterns are applied during file discovery and diff generation
ignore: []
  # - "*.generated.ts"
  # - "dist/"
  # - "vendor/"
  # - "*.min.js"
`;
}

/**
 * Creates the init command for Commander.js
 */
export function createInitCommand(): Command {
  const cmd = new Command('init')
    .description('Create a new octate.yaml configuration file at the repository root')
    .argument('[path]', 'Repository root path (default: current directory)', process.cwd())
    .option('-f, --force', 'Overwrite existing octate.yaml')
    .option('-n, --name <name>', 'Project name (default: directory name)')
    .action(async (repoPath: string, options: { force?: boolean; name?: string }) => {
      const targetDir = resolve(repoPath);
      const configPath = join(targetDir, 'octate.yaml');
      const projectName = options.name ?? targetDir.split('/').pop() ?? 'unnamed-project';

      logger.info({ configPath, projectName, force: options.force }, 'Initializing Octate config');

      try {
        // Check if file exists
        const fs = await import('node:fs/promises');
        try {
          await fs.access(configPath);
          if (!options.force) {
            throw new ConfigurationError(
              `octate.yaml already exists at ${configPath}. Use --force to overwrite.`,
              { filePath: configPath }
            );
          }
          logger.warn({ configPath }, 'Overwriting existing octate.yaml');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
          // File doesn't exist, continue
        }

        const content = generateConfigContent(projectName);
        await writeFile(configPath, content, 'utf-8');

        logger.info({ configPath }, 'Created octate.yaml');
        // biome-ignore lint/suspicious/noConsole: CLI user output
        console.log(`✓ Created ${configPath}`);
        // biome-ignore lint/suspicious/noConsole: CLI user output
        console.log(`  Project name: ${projectName}`);
        // biome-ignore lint/suspicious/noConsole: CLI user output
        console.log(`  Edit this file to customize your review configuration.`);
      } catch (error) {
        logger.error({ error: String(error) }, 'Init command failed');
        if (error instanceof ConfigurationError) {
          throw error;
        }
        throw new ConfigurationError(`Failed to create octate.yaml: ${error}`, {
          filePath: configPath,
        });
      }
    });

  return cmd;
}

/**
 * Exported init command for registration
 */
export const initCommand = createInitCommand();

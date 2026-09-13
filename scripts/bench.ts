/**
 * Benchmark runner wrapper delegating to benchmark/evaluate.ts
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evaluateScript = path.resolve(__dirname, '../benchmark/evaluate.ts');

const args = ['tsx', evaluateScript, ...process.argv.slice(2)];
const child = spawn('pnpm', ['exec', ...args], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

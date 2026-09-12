/**
 * Post-build asset copy hook relocating WASM grammars into dist/wasm/ (D-09).
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'test-wasm');
const destDir = path.join(projectRoot, 'dist', 'wasm');

const wasmFiles = ['tree-sitter-typescript.wasm', 'tree-sitter-python.wasm'];

console.log(`[copy-wasm] Ensuring destination directory exists: ${destDir}`);
fs.mkdirSync(destDir, { recursive: true });

for (const file of wasmFiles) {
  const src = path.join(sourceDir, file);
  const dst = path.join(destDir, file);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    const stat = fs.statSync(dst);
    console.log(`[copy-wasm] Copied ${file} (${Math.round(stat.size / 1024)} KB) -> dist/wasm/`);
  } else {
    console.error(`[copy-wasm] Error: Source WASM grammar not found at ${src}`);
    process.exit(1);
  }
}

console.log('[copy-wasm] Successfully packaged all Tree-sitter WASM grammars into dist/wasm/.');

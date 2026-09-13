# Phase 0 Baseline Audit: Production Build & Packaging Inspection

**Commands:**
- Build: `npm run build` (`tsc && node scripts/copy-wasm.cjs && chmod +x dist/cli.js`)
- Packaging Dry Run: `npm pack --dry-run`

---

## 1. Production Build Results

- **Compiler:** TypeScript `tsc` (v5.9.3)
- **Output Directory:** `dist/`
- **WASM Assets Copied:**
  - `tree-sitter-typescript.wasm`: 1,381 KB -> `dist/wasm/tree-sitter-typescript.wasm`
  - `tree-sitter-python.wasm`: 447 KB -> `dist/wasm/tree-sitter-python.wasm`
- **CLI Executable Bit:** `dist/cli.js` chmod +x
- **Build Status:** SUCCESS (Exit code: 0, Duration: ~5.8s)

---

## 2. Package Inspection (`npm pack --dry-run`)

- **Package Name:** `octate`
- **Version:** `0.1.0`
- **Tarball Filename:** `octate-0.1.0.tgz`
- **Package Size (Compressed):** 594.4 kB
- **Unpacked Size:** 3.9 MB
- **Total Files:** 726 files
- **Shasum:** `77e4f41b96aaa2d19f08650901136b7e55e4e6db`

---

## 3. Package Content & Hygiene Findings

1. **WASM Binaries Correctly Bundled:**
   - `dist/wasm/tree-sitter-typescript.wasm` (1.4MB uncompressed)
   - `dist/wasm/tree-sitter-python.wasm` (457.9kB uncompressed)
   - *Status:* Both grammars are present inside the distributed bundle, resolving the concern where WASM was previously resolved from root `test-wasm/`.

2. **Defect / Hygiene Issue: Test Files Compiled into `dist/` and Packaged:**
   - In `package.json`, `"files": ["bin", "dist", "README.md", "LICENSE"]`.
   - In `tsconfig.json`, `"include": ["src/**/*"]`, but test files (`*.test.ts`) inside `src/` are not excluded from production builds.
   - Consequently, compiled test files and their source maps are emitted to `dist/` and bundled into `octate-0.1.0.tgz`:
     - `dist/**/*.test.js`
     - `dist/**/*.test.d.ts`
     - `dist/**/*.test.js.map`
     - `dist/**/*.test.d.ts.map`
   - *Impact:* Over 200 unnecessary files inflating package size and exposing internal tests in production distribution.
   - *Classification:* Genuine Product Defect (Build/Packaging Hygiene).

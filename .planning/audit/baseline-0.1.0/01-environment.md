# Phase 0 Baseline Audit: Environment Specifications

**Audit Timestamp:** 2026-09-14T01:22:00+05:30  
**Baseline Git Tag:** `baseline-0.1.0-pre`  
**Git Commit SHA:** `5363e288bc267d011e2369aeba1935a5ff451951`  
**Branch:** `main`

---

## 1. Runtime & Package Manager

| Tool / Runtime | Recorded Version | Requirement / Constraint | Status |
|----------------|------------------|--------------------------|--------|
| **Node.js** | `v26.8.1` | `>=22.0.0` (engines constraint) | PASS |
| **npm** | `12.0.2` | Core package manager | PASS |
| **pnpm** | `12.3.4` (via lockfile/npx) | Workspace & monorepo management | PASS |
| **TypeScript** | `5.9.3` | `package.json` devDependency | PASS |

---

## 2. Tree-sitter Parser Grammars & WASM

| Package | Installed Version | Location | Notes |
|---------|-------------------|----------|-------|
| `web-tree-sitter` | `0.27.0` | `node_modules/web-tree-sitter` | Pure WebAssembly Tree-sitter runtime |
| `tree-sitter-typescript` | `0.23.2` | `node_modules/tree-sitter-typescript` | Grammar source for TS & TSX |
| `tree-sitter-python` | `0.25.0` | `node_modules/tree-sitter-python` | Grammar source for Python |
| `tree-sitter-typescript.wasm` | Built | `dist/wasm/tree-sitter-typescript.wasm` (1,381 KB) | Packaged in `npm run build` |
| `tree-sitter-python.wasm` | Built | `dist/wasm/tree-sitter-python.wasm` (447 KB) | Packaged in `npm run build` |

---

## 3. Host System & Hardware Architecture

| Property | Value |
|----------|-------|
| **Operating System** | Linux (Snigdha OS / Arch Linux rolling release) |
| **Kernel** | `6.18.49-2-lts #1 SMP PREEMPT_DYNAMIC` (x86_64) |
| **CPU Architecture** | x86_64, 16 logical cores (12 physical cores, 12th Gen Intel Core i5-1240P) |
| **CPU Clock** | 400 MHz min / 4,400 MHz max |
| **RAM** | 15 GiB Total (Available: ~12 GiB, Free: ~10 GiB) |
| **Swap** | 4.0 GiB Total |

---

## 4. Environment Variables & API Credentials

- `NVIDIA_API_KEY`: Configured in `.env` (verified live connectivity to `https://integrate.api.nvidia.com/v1/models`).
- Target Model: `nvidia/nemotron-3-ultra-550b-a55b`.
- Service Strategy: Free endpoint / public API during validation.

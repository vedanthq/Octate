# Troubleshooting & Diagnostics

When troubleshooting unexpected behavior or configuration issues, first run `octate doctor` to audit your local environment.

---

## Running `octate doctor`

```bash
octate doctor
```

Add `--debug` to inspect full diagnostic payload details:

```bash
octate doctor --debug
```

---

## Common Issues & Remediation

### 1. Node.js Version Incompatibility
- **Symptom:** `✗ Node.js Runtime: Node.js >= 22.0.0 required by Ink 7.1.1`
- **Cause:** Octate's interactive terminal UI depends on React 19 and Ink 7.1.1, which require modern Node.js engine features.
- **Remediation:** Upgrade your Node runtime via your version manager:
  ```bash
  # Using nvm
  nvm install 22 && nvm use 22

  # Using fnm
  fnm install 22 && fnm use 22
  ```

### 2. Missing Static Analysis Tools Warning
- **Symptom:** `⚠ Static Analysis Tools: Detected 3/8 tools on PATH. Missing: [ruff, biome]`
- **Cause:** Octate incorporates deterministic host linters into its pre-analysis pipeline. While not strictly fatal, missing tools reduce hybrid analysis depth.
- **Remediation:** Install missing linters for your target languages:
  ```bash
  # TypeScript / JavaScript tooling
  npm install -D typescript @biomejs/biome eslint

  # Python tooling
  pip install ruff mypy pyright bandit pytest
  ```

### 3. Tree-sitter WASM Grammars Not Found
- **Symptom:** `✗ Tree-sitter WASM Grammars: Tree-sitter WASM grammar not found: tree-sitter-typescript.wasm`
- **Cause:** WASM assets were not copied during build or were stripped by packaging.
- **Remediation:** Re-run the asset copy build hook:
  ```bash
  npm run copy:wasm
  ```

### 4. NVIDIA API Connectivity & Key Missing
- **Symptom:** `⚠ NVIDIA API: NVIDIA_API_KEY not set (offline review mode only)`
- **Cause:** The `NVIDIA_API_KEY` environment variable is not defined in your shell session.
- **Remediation:** Export your NVIDIA API token:
  ```bash
  export NVIDIA_API_KEY="nvapi-..."
  ```
  Persist it in your shell configuration (`~/.bashrc` or `~/.zshrc`).

### 5. Cache Store Invalidation
- **Symptom:** Stale AST symbols or cache read errors.
- **Cause:** Corrupted local cache files in `~/.local/share/octate/`.
- **Remediation:** Remove the local cache directory:
  ```bash
  rm -rf ~/.local/share/octate/
  ```
  Octate will automatically reinitialize a pristine cache on the next run.

# External Integrations

**Analysis Date:** 2026-09-10

## APIs & External Services

**AI Model Inference:**
- **NVIDIA API** - Nemotron 3 Ultra 550B-A55B model
  - Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI-compatible)
  - Model ID: `nvidia/nemotron-3-ultra-550b-a55b`
  - SDK/Client: Native Node.js `fetch` + `AbortController` (zero external SDK dependency)
  - Auth: Bearer token via `NVIDIA_API_KEY` environment variable
  - Health & Connectivity: Verified via `octate doctor` (`src/commands/doctor.ts:checkNvidiaConnectivity()`)
  - Integration Boundary: `ReviewModel` abstraction (`src/model/abstraction.ts`), with planned providers `LocalNvidiaProvider` and `HostedProvider`

**Language Parser WebAssembly Grammars:**
- **Tree-sitter WASM Grammars** - Language grammar distribution
  - Runtime: `web-tree-sitter`
  - Binaries: `test-wasm/tree-sitter-typescript.wasm`, `test-wasm/tree-sitter-python.wasm`
  - Loader: `src/analysis/parser/languages.ts` & `src/analysis/parser/index.ts`

## Local Static Analysis Subprocesses

Octate executes local command-line linters, static analyzers, and test runners in the developer's repository to collect deterministic ground-truth diagnostics before AI reasoning:

| Tool | Language | Detection Trigger | Subprocess Command | Output Format | Normalization Handler |
|---|---|---|---|---|---|
| `tsc` | TypeScript/JS | `tsconfig.json` / PATH | `npx tsc --noEmit --pretty false` | Text lines (file(line,col): error TS...) | `src/analysis/diagnostics/severity.ts` |
| `biome` | TS/JS | `biome.json` / PATH | `npx biome check --formatter=json` | JSON diagnostic array | `src/analysis/diagnostics/severity.ts` |
| `ruff` | Python | `ruff.toml` / PATH | `ruff check --output-format=json .` | JSON array of violation objects | `src/analysis/diagnostics/severity.ts` |
| `mypy` | Python | `pyproject.toml` / PATH | `mypy --show-error-codes --no-error-summary .` | Text lines with error codes | `src/analysis/diagnostics/severity.ts` |
| `pyright` | Python | `pyrightconfig.json` / PATH | `pyright --outputjson` | JSON with `generalDiagnostics` | `src/analysis/diagnostics/severity.ts` |
| `bandit` | Python | `pyproject.toml` / PATH | `bandit -f json -r .` | JSON with `results` array | `src/analysis/diagnostics/severity.ts` |
| `pytest` | Python | `pyproject.toml` / PATH | `pytest --collect-only -q` | Pytest session output | `src/analysis/diagnostics/severity.ts` |

**Subprocess Execution Protocol:**
- Managed by `src/cancellation/subprocess.ts:spawnWithSignal()`
- Bounded concurrency: Executed via `PromisePool` with a concurrency limit of 3 (`src/analysis/diagnostics/index.ts`)
- Graceful degradation: Failed tool executions log warnings and return empty diagnostic sets without interrupting the overall review pipeline
- Cancellation: Subprocess trees are terminated with `SIGTERM` followed by `SIGKILL` on AbortSignal

## Data Storage

**Databases:**
- None. Octate has no database requirements.

**File Storage:**
- **Local filesystem only** - Content-addressable storage at `~/.local/share/octate/{project-hash}/`
  - Subdirectories: `indexes/`, `cache/`, `findings/`, `logs/`
  - Project Identity: Derived via SHA256(repoRoot + remoteOriginUrl) truncated to 16 hex characters (`src/cache/identity.ts`)
  - Global Cache: `~/.local/share/octate/global/`

**Caching Subsystem:**
- **Cache Store**: Atomic file writes, LRU eviction (`src/cache/store.ts`)
- **Cache Keys**:
  - Analysis Cache Key: `contentHash:filePath:parserVersion:language:configHash`
  - Diagnostic Collection Key: Combined file hashes + tool list + config version (`diagnosticsKey`)
  - Tool Result Key: Tool name + tool version + file hashes + config version (`toolResultKey`)
  - Tool Version Caching: In-memory cache for `--version` command outputs (`getToolVersion`)
  - Config Version Hashing: SHA256 over repository configs (`tsconfig.json`, `biome.json`, `ruff.toml`, etc.)

## Authentication & Identity

**Authentication:**
- Static environment variable: `NVIDIA_API_KEY`
- No user credentials, accounts, or OAuth tokens stored on disk
- No per-seat billing or authentication servers

**Security Redaction:**
- Structured logging automatically redacts: `NVIDIA_API_KEY`, `apiKey`, `token`, `password`, `secret`, `authorization`, `x-api-key`, `apikey`

## Monitoring & Observability

**Error Tracking:**
- None (zero telemetry, zero phone-home behavior).

**Logging:**
- Pino structured JSON logging (`src/logging/index.ts`)
- Child loggers created per module (`createLogger('analysis/orchestrator')`, etc.)
- Human-readable colorized output in development via `pino-pretty`
- Raw structured JSON output in production/automation mode

## CI/CD & Deployment

**Packaging & Distribution:**
- Node.js npm package with binary executable entry `dist/cli.js`
- Local execution model: Repository files never leave the local environment for analysis
- Automation outputs: Supported formats include `--json` and `--sarif` for GitHub Actions and CI pipelines

## Environment Configuration

**Required Environment Variables:**
- `NVIDIA_API_KEY` - API key for model reasoning (checked by `octate doctor`)

**Optional Environment Variables:**
- `LOG_LEVEL` - Log level (`debug`, `info`, `warn`, `error`)
- `NODE_ENV` - Set to `production` for raw JSON logs
- `XDG_CONFIG_HOME` - Override path for user config (`~/.config`)
- `HOME` / `USERPROFILE` - Base directory for local cache store

---

*Integration audit: 2026-09-10*
*Update when adding or modifying external service or subprocess integrations*
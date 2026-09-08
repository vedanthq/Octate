# External Integrations

**Analysis Date:** 2026-09-08

## APIs & External Services

**AI Model Inference:**
- **NVIDIA API** - Nemotron 3 Ultra 550B-A55B model
  - Endpoint: `https://integrate.api.nvidia.com/v1` (OpenAI-compatible chat completions)
  - Model ID: `nvidia/nemotron-3-ultra-550b-a55b` (confirmed available via `/v1/models`)
  - SDK/Client: Native `fetch` + `AbortController` (no SDK dependency)
  - Auth: Bearer token via `NVIDIA_API_KEY` environment variable
  - Implementation: `src/commands/doctor.ts:checkNvidiaConnectivity()` (connectivity check only)
  - Phase 4: LocalNvidiaProvider and HostedProvider will implement `ReviewModel` interface (`src/model/abstraction.ts`)

## Data Storage

**Databases:**
- None. No database dependencies in `package.json`.

**File Storage:**
- **Local filesystem only** - Cache and indexes stored at `~/.local/share/octate/{project-hash}/`
  - Structure: `indexes/`, `cache/`, `findings/`, `logs/` (`src/cache/identity.ts:CachePaths`)
  - Project identity: SHA256(repo-root-path + git-remote-url) truncated to 16 chars
  - Fallback: Absolute path + platform + device/inode if no git remote
  - Global cache: `~/.local/share/octate/global/` (`src/cache/identity.ts:getGlobalCacheDir()`)

**Caching:**
- **Custom LRU cache** - `src/cache/` module (store, pool, lru, keys, identity)
  - `CacheStore` interface with `get`/`set`/`delete`/`has`/`keys`/`clear`/`size` (`src/cache/store.ts`)
  - `LRUCache` implementation with TTL support (`src/cache/lru.ts`)
  - `CachePool` for namespaced caches (`src/cache/pool.ts`)
  - Content hashing: SHA256 via `node:crypto` for incremental indexing keys

## Authentication & Identity

**Auth Provider:**
- **None (API key only)** - NVIDIA API uses static `NVIDIA_API_KEY` environment variable
- No OAuth, no JWT, no session management
- No user accounts, no per-seat pricing (local execution model)
- Secrets server-side only for hosted inference (not implemented yet)

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Datadog, or similar integrations.

**Logs:**
- **Pino** - Structured JSON logging (`src/logging/index.ts`)
  - Child loggers per module: `createLogger('module:name')`
  - Redaction paths: `NVIDIA_API_KEY`, `apiKey`, `token`, `password`, `secret`, `authorization`, `x-api-key`, `apikey`
  - Development: `pino-pretty` with colorized output, timestamp translation
  - Production: JSON to stdout
  - Levels: trace, debug, info, warn, error, fatal
  - Configurable via `LOG_LEVEL` env var or `--log-level` CLI flag

## CI/CD & Deployment

**Hosting:**
- **NPM package** - Published as CLI tool (`bin.octate` -> `dist/cli.js`)
- No hosted service, no server component
- Zero per-seat pricing (local execution)

**CI Pipeline:**
- None configured in repository (no `.github/workflows/`, no `.gitlab-ci.yml`, no Jenkinsfile)
- Local commands: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm check`

## Environment Configuration

**Required env vars:**
- `NVIDIA_API_KEY` - For NVIDIA API access (warns if missing in `doctor` check)

**Optional env vars:**
- `LOG_LEVEL` - Override log level
- `NODE_ENV` - `production` disables pretty printing
- `XDG_CONFIG_HOME` - Override global config directory
- `HOME` / `USERPROFILE` - Home directory detection for cache

**Secrets location:**
- `NVIDIA_API_KEY` in environment (never in config files)
- Pino redacts `NVIDIA_API_KEY` from logs automatically
- No `.env` files committed (`.gitignore` excludes `*.log`, `.octate/`, `~/.local/share/octate/`)

## Webhooks & Callbacks

**Incoming:**
- None. CLI tool only, no HTTP server.

**Outgoing:**
- **NVIDIA API** - HTTPS POST to `https://integrate.api.nvidia.com/v1/chat/completions` (Phase 4)
  - Request: OpenAI-compatible chat completions format
  - Response: Structured findings validated via Zod schema
  - Timeout: 10s (configurable via `ModelProviderConfig.timeout`)
  - Retries: Configurable via `ModelProviderConfig.maxRetries`

---

*Integration audit: 2026-09-08*
# Phase 4: Model Provider - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the Model Provider layer for Octate, making NVIDIA Nemotron 3 Ultra 550B-A55B callable through the `ReviewModel` abstraction (`ReviewModel.generate(request): Promise<ModelResponse>`). This layer handles network transport, authentication, retries, rate limiting, cancellation, usage telemetry, prompt templating, schema validation via compiled Zod schemas, malformed JSON recovery, and strict boundary validation of model findings against the repository.

In scope:
- Concrete `LocalNvidiaProvider` implementing `ReviewModel` interface.
- Native `fetch` HTTP communication with NVIDIA OpenAI-compatible chat completions endpoint (`https://integrate.api.nvidia.com/v1/chat/completions`).
- Authentication via `NVIDIA_API_KEY` environment variable only.
- Timeout (60s default, configurable in `octate.yaml`), exponential backoff retry (up to 3 attempts with jitter, respecting `Retry-After`), and cancellation propagation (`signal` passed to `fetch` and draining queue).
- Typed error hierarchy: `AuthenticationError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ModelError`, and `ValidationError` mapping to exit codes (code 4 for provider/model errors, code 5 for internal errors).
- Client-side concurrency control: Internal concurrency limiter defaulting to 2 concurrent in-flight requests (configurable up to 4) using `p-limit` / `PromisePool`.
- Usage telemetry tracking (`promptTokens`, `completionTokens`, `totalTokens`, `latencyMs`) and debug logging via Pino (`createLogger('model/nvidia')`).
- Prompt markdown templates with Mustache-style variable interpolation located at `src/model/prompts/*.md` (`reviewer.structural.v1.md`, `reviewer.semantic.v1.md`, `reviewer.security.v1.md`, `critic.v1.md`) loaded via `import.meta.dirname` with embedded fallback strings.
- Two-message chat format: system message with role instructions and schema, user message with `serializePromptContext` and meta-policy sandwich framing.
- JSON mode enforcement via OpenAI `response_format: { type: 'json_object' }`.
- Robust JSON extraction: Strip markdown fences (```json ... ```), extract outermost `{...}` / `[...]`, clean trailing commas.
- Compiled Zod schema for `ModelFinding` and `ModelResponse`.
- Schema validation recovery: 2 repair retries sending specific Zod error messages back to the model before failing.
- Strict path & line boundary validation: Ensure file exists in repository/diff, verify positive line numbers, and clamp/validate ranges against actual file lengths.
- Testing architecture: Hermetic tests using Jest `jest.spyOn(globalThis, 'fetch')` to simulate 200, 400, 401, 429, 500, timeouts, malformed JSON, and schema recovery.

Out of scope:
- Review DAG orchestration (Phase 5 - Review Engine).
- Finding deduplication and composite ranking algorithms (Phase 5).
- TUI or CLI formatting of findings (Phase 6/7).
- Multiple model providers (NVIDIA Nemotron only in v1).
- Local offline LLM inference.
- Hosted Vercel proxy implementation (deferred/server-side; local direct inference is MVP default).

</domain>

<decisions>
## Implementation Decisions

### Retry & Rate-Limit Strategy
- **D-01:** 60s default HTTP timeout per request with configurable override in `octate.yaml` under `model.timeoutMs`. Gives Nemotron 550B sufficient time for reasoning over 8k–16k token contexts without premature cutoffs.
- **D-02:** Max 3 retries with exponential backoff + jitter (base delays ~1s, ~2s, ~4s with ±20% jitter, 10s maximum cap) for 429 (rate limit), 5xx server errors, and network disconnects. Honors HTTP `Retry-After` header when provided on 429 responses.
- **D-03:** Distinct typed error classes (`AuthenticationError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ModelError`) with automatic secret redaction (`NVIDIA_API_KEY`, Bearer tokens) in error messages and stack traces, mapped to CLI exit code 4.
- **D-04:** Strict environment variable discovery for `NVIDIA_API_KEY` only. Never read keys from repo configuration files (`octate.yaml`) to prevent accidental git commits of secrets. Clear actionable error when missing detailing how to obtain and export the key.

### Schema Validation & Malformed JSON Recovery
- **D-05:** Robust JSON extraction before schema validation: Strip markdown code fences (```json ... ```), extract the outermost JSON boundary (`{...}` or `[...]`), and normalize trailing commas to maximize first-pass parse success.
- **D-06:** 2 repair retries with schema feedback: If model output fails JSON parsing or Zod schema validation, send a follow-up prompt containing the specific Zod validation errors and request a corrected JSON payload, retrying up to 2 times before throwing `ValidationError`.
- **D-07:** Strict path & line boundary validation: Verify that `finding.file` exists in the repository or review scope diff, line numbers are positive integers, and line ranges are clamped and validated against actual file line counts.
- **D-08:** Compiled Zod schema validator combined with OpenAI-compatible payload parameter `response_format: { type: 'json_object' }` to enforce JSON generation at the provider API level.

### Prompt Template Architecture
- **D-09:** External markdown template files located in `src/model/prompts/*.md` (`reviewer.structural.v1.md`, `reviewer.semantic.v1.md`, `reviewer.security.v1.md`, `critic.v1.md`) loaded from disk via `import.meta.dirname` with embedded fallback strings so execution succeeds in both source and bundled CLI environments.
- **D-10:** Two-message OpenAI chat format: System message contains role instructions, reviewer persona, domain guidance, and JSON output schema; User message contains `serializePromptContext` (diff, source snippets, deterministic diagnostics, repository metadata) enclosed in meta-policy sandwich framing.
- **D-11:** Lightweight built-in template renderer: Simple regex-based `{{variable}}` substitution and `{{#rules}}...{{/rules}}` block iteration with zero external dependencies (`handlebars`/`mustache` not needed).

### Provider Concurrency & Client-Side Rate Limiting
- **D-12:** Internal concurrency limiter defaulting to 2 concurrent requests (configurable up to 4 in `octate.yaml` or options) using `p-limit` / `PromisePool` from `src/cache/pool.ts` to prevent burst 429 rate limit errors when Phase 5 triggers multiple reviewers in parallel.
- **D-13:** Strict `AbortSignal` propagation: Pass the cancellation signal directly to `fetch()`, immediately aborting active HTTP sockets and purging queued requests without leaving orphaned background requests.
- **D-14:** Structured telemetry and logging: Track `ModelUsage` (`promptTokens`, `completionTokens`, `totalTokens`, `latencyMs`) and log API calls, retry attempts, and rate-limit headers via Pino child logger (`createLogger('model/nvidia')`).
- **D-15:** Testing with `jest.spyOn(globalThis, 'fetch')`: Comprehensive hermetic unit and integration test suite mocking HTTP status codes (200, 400, 401, 429, 500), network timeouts, malformed JSON, and multi-turn schema repair flows.

### Agent Discretion
- Concrete regex patterns for stripping markdown fences and trailing commas.
- Exact format of the schema-repair prompt payload when re-prompting the model.
- Internal queue structure for request concurrency limiting.
- Fallback string constants embedded alongside prompt template loading logic.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/PROJECT.md` — Core value, constraints, NVIDIA Nemotron 3 Ultra provider boundary, local-first execution
- `.planning/REQUIREMENTS.md` §MODEL-01, MODEL-02, MODEL-03, MODEL-04 — Model Provider requirements
- `.planning/ROADMAP.md` §Phase 4 — Phase goals, 5 success criteria, requirements mapping
- `.planning/STATE.md` — Current project state and 8-layer dependency architecture

### Preceding Phase Implementations
- `src/model/types.ts` — `ReviewModel`, `ModelRequest`, `ModelResponse`, `ModelFinding`, `ModelEvidence`, `ModelUsage`
- `src/model/abstraction.ts` — Base abstraction and `defaultReviewModel` factory
- `src/intelligence/context/serializer.ts` — `serializePromptContext` producing sandwich-framed prompt context
- `src/cache/pool.ts` — `PromisePool` for concurrency limiting
- `src/errors/index.ts` — Typed error hierarchy (`AuthenticationError`, `ModelError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ValidationError`)
- `src/commands/doctor.ts` — `checkNvidiaConnectivity()` connectivity verification pattern

### Research & Conventions
- `.planning/codebase/INTEGRATIONS.md` — NVIDIA API integration specs, chat completions endpoint, and secret redaction rules
- `.planning/codebase/ARCHITECTURE.md` — System architecture and layer boundaries
- `.planning/codebase/CONVENTIONS.md` — TypeScript and error handling conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/model/types.ts`: Core interfaces `ModelFinding`, `ModelResponse`, `ModelRequest`, `ModelUsage` ready for provider and schema implementation.
- `src/model/abstraction.ts`: Placeholder factory `createModelProvider` ready to instantiate `LocalNvidiaProvider`.
- `src/cache/pool.ts`: `createPromisePool` providing bounded concurrency for API requests.
- `src/errors/index.ts`: Standard error classes `AuthenticationError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ModelError`, `ValidationError` with exit code mapping (exit codes 4 and 5).
- `src/logging/index.ts`: Pino logger with automatic redaction for `NVIDIA_API_KEY`, `apiKey`, `token`, `secret`.
- `src/intelligence/context/serializer.ts`: `serializePromptContext` formatting diff, snippets, and diagnostics with sandwich framing.

### Established Patterns
- ES modules with explicit `.js` import extensions.
- Child loggers created per module namespace (`createLogger('model/nvidia')`).
- Native Node.js `fetch` + `AbortController` without third-party HTTP/SDK clients.
- Clean separation between core interfaces and provider implementations.

### Integration Points
- Input: `ModelRequest` produced by Context Engine & Review DAG.
- Output: Validated `ModelResponse` consumed by Review DAG (Phase 5).
- Environment: `process.env.NVIDIA_API_KEY`.
- Doctor Command: `src/commands/doctor.ts` checks connectivity to NVIDIA API.

</code_context>

<specifics>
## Specific Ideas

- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
- Model ID: `nvidia/nemotron-3-ultra-550b-a55b`
- `response_format`: `{ type: 'json_object' }` in payload body.
- Fallback templates inlined in TS source so tests and bundled execution don't fail if markdown files are not copied to build output.

</specifics>

<deferred>
## Deferred Ideas

- Hosted Vercel proxy (`HostedProvider` routing requests through Octate backend API with server-side secrets) — deferred to cloud/hosted milestone.
- Local model execution (Ollama / llama.cpp / vLLM) — deferred to v2 local inference roadmap.
- Multi-provider support (OpenAI, Anthropic, Google Gemini) — deferred to future provider expansion.

</deferred>

---

*Phase: 04-model-provider*
*Context gathered: 2026-09-10*

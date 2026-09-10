# Phase 4: Model Provider - Research

**Researched:** 2026-09-10
**Domain:** LLM API integration, OpenAI-compatible chat completions, NVIDIA Nemotron 3 Ultra, compiled Zod validation, prompt templating, and rate-limit backoff
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 60s default HTTP timeout per request with configurable override in `octate.yaml` under `model.timeoutMs`. Gives Nemotron 550B sufficient time for reasoning over 8k–16k token contexts without premature cutoffs.
- **D-02:** Max 3 retries with exponential backoff + jitter (base delays ~1s, ~2s, ~4s with ±20% jitter, 10s maximum cap) for 429 (rate limit), 5xx server errors, and network disconnects. Honors HTTP `Retry-After` header when provided on 429 responses.
- **D-03:** Distinct typed error classes (`AuthenticationError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ModelError`) with automatic secret redaction (`NVIDIA_API_KEY`, Bearer tokens) in error messages and stack traces, mapped to CLI exit code 4.
- **D-04:** Strict environment variable discovery for `NVIDIA_API_KEY` only. Never read keys from repo configuration files (`octate.yaml`) to prevent accidental git commits of secrets. Clear actionable error when missing detailing how to obtain and export the key.
- **D-05:** Robust JSON extraction before schema validation: Strip markdown code fences (```json ... ```), extract the outermost JSON boundary (`{...}` or `[...]`), and normalize trailing commas to maximize first-pass parse success.
- **D-06:** 2 repair retries with schema feedback: If model output fails JSON parsing or Zod schema validation, send a follow-up prompt containing the specific Zod validation errors and request a corrected JSON payload, retrying up to 2 times before throwing `ValidationError`.
- **D-07:** Strict path & line boundary validation: Verify that `finding.file` exists in the repository or review scope diff, line numbers are positive integers, and line ranges are clamped and validated against actual file line counts.
- **D-08:** Compiled Zod schema validator combined with OpenAI-compatible payload parameter `response_format: { type: 'json_object' }` to enforce JSON generation at the provider API level.
- **D-09:** External markdown template files located in `src/model/prompts/*.md` (`reviewer.structural.v1.md`, `reviewer.semantic.v1.md`, `reviewer.security.v1.md`, `critic.v1.md`) loaded from disk via `import.meta.dirname` with embedded fallback strings so execution succeeds in both source and bundled CLI environments.
- **D-10:** Two-message OpenAI chat format: System message contains role instructions, reviewer persona, domain guidance, and JSON output schema; User message contains `serializePromptContext` (diff, source snippets, deterministic diagnostics, repository metadata) enclosed in meta-policy sandwich framing.
- **D-11:** Lightweight built-in template renderer: Simple regex-based `{{variable}}` substitution and `{{#rules}}...{{/rules}}` block iteration with zero external dependencies (`handlebars`/`mustache` not needed).
- **D-12:** Internal concurrency limiter defaulting to 2 concurrent requests (configurable up to 4 in `octate.yaml` or options) using `p-limit` / `PromisePool` from `src/cache/pool.ts` to prevent burst 429 rate limit errors when Phase 5 triggers multiple reviewers in parallel.
- **D-13:** Strict `AbortSignal` propagation: Pass the cancellation signal directly to `fetch()`, immediately aborting active HTTP sockets and purging queued requests without leaving orphaned background requests.
- **D-14:** Structured telemetry and logging: Track `ModelUsage` (`promptTokens`, `completionTokens`, `totalTokens`, `latencyMs`) and log API calls, retry attempts, and rate-limit headers via Pino child logger (`createLogger('model/nvidia')`).
- **D-15:** Testing with `jest.spyOn(globalThis, 'fetch')`: Comprehensive hermetic unit and integration test suite mocking HTTP status codes (200, 400, 401, 429, 500), network timeouts, malformed JSON, and multi-turn schema repair flows.

### the agent's Discretion
- Concrete regex patterns for stripping markdown fences and trailing commas.
- Exact format of the schema-repair prompt payload when re-prompting the model.
- Internal queue structure for request concurrency limiting.
- Fallback string constants embedded alongside prompt template loading logic.

### Deferred Ideas (OUT OF SCOPE)
- Hosted Vercel proxy (`HostedProvider` routing requests through Octate backend API with server-side secrets) — deferred to cloud/hosted milestone.
- Local model execution (Ollama / llama.cpp / vLLM) — deferred to v2 local inference roadmap.
- Multi-provider support (OpenAI, Anthropic, Google Gemini) — deferred to future provider expansion.

</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Module | Secondary Module | Rationale |
|------------|---------------|------------------|-----------|
| Prompt Templates & Rendering | `src/model/prompts/` | `src/model/prompts/template.ts` | Loads `.md` templates, applies variable substitutions, embeds fallbacks |
| Output Schema & Parsing | `src/model/schema/` | `src/model/schema/validator.ts` | Zod compilation, robust markdown JSON extraction, line/file grounding |
| NVIDIA Client & Transport | `src/model/providers/nvidia.ts` | `src/model/abstraction.ts` | HTTP request serialization, response handling, telemetry, exit code mapping |
| Rate-Limiting & Retries | `src/model/providers/resilience.ts` | `src/cache/pool.ts` | Concurrency throttle (2 workers), exponential backoff with jitter, 2-turn repair loop |
| Abstraction Factory | `src/model/abstraction.ts` | `src/model/index.ts` | `createModelProvider('nvidia', config)` instantiation and verification |

</architectural_responsibility_map>

<research_summary>
## Summary

Phase 4 establishes Octate's AI inference engine by delivering a production-grade, highly resilient NVIDIA Nemotron 3 Ultra provider behind the `ReviewModel` abstraction interface.

Key technical realities and design patterns:

### 1. NVIDIA Chat Completions API Protocol
- **Endpoint:** `https://integrate.api.nvidia.com/v1/chat/completions`
- **Model:** `nvidia/nemotron-3-ultra-550b-a55b`
- **Request Format:**
  ```json
  {
    "model": "nvidia/nemotron-3-ultra-550b-a55b",
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user", "content": "..." }
    ],
    "temperature": 0.2,
    "top_p": 0.7,
    "max_tokens": 4096,
    "response_format": { "type": "json_object" }
  }
  ```
- **Response Format:**
  ```json
  {
    "id": "chatcmpl-...",
    "choices": [
      {
        "index": 0,
        "message": { "role": "assistant", "content": "{\n  \"findings\": [...] \n}" },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 3200,
      "completion_tokens": 450,
      "total_tokens": 3650
    }
  }
  ```
- **Authentication:** `Authorization: Bearer ${NVIDIA_API_KEY}`. Missing key raises `AuthenticationError` (code 4) before making any network requests.
- **Cancellation:** Pass `signal: AbortSignal` directly into the Node.js `fetch()` options. When aborted, Node `fetch` terminates the socket and rejects with an `AbortError`.

### 2. Compiled Zod Schema & Robust JSON Recovery
- **Zod 4 Optimization:** `z.compile(FindingSchema)` creates an AOT optimized validator.
- **Robust JSON Stripping:**
  LLMs occasionally output:
  ````
  ```json
  {
    "findings": [ ... ]
  }
  ```
  ````
  or prefix conversational text before the opening `{`.
  The extractor:
  1. Detects and extracts contents within ```` ```(?:json)?([\s\S]*?)``` ````.
  2. If no code fences exist, locates the first `{` and matching last `}`.
  3. Replaces trailing commas in arrays/objects (e.g. `,[ \t\r\n]*([}\]])` -> `$1`) before `JSON.parse`.
- **2-Turn Repair Loop:**
  If `JSON.parse` or `zod.safeParse` fails:
  - Format the Zod issues: `Path '${issue.path.join('.')}': ${issue.message}`.
  - Issue a follow-up completion prompt to NVIDIA:
    ```
    Your previous response was invalid JSON or did not conform to the schema:
    Errors:
    - Path 'findings[0].evidence': Required
    Original Response:
    ...
    Please return ONLY valid, corrected JSON matching the schema.
    ```
  - Allow up to 2 repair attempts. If still invalid after 2 retries, throw `ValidationError` (exit code 5).

### 3. Repository Grounding & Line Boundary Clamping
- To eliminate hallucinations where a model invents files or attributes finding lines beyond the end of a file:
  - Validate `file` against the known file set from `ReviewScope` or repository root.
  - If a file exists on disk, query its total line count.
  - Ensure `startLine >= 1` and `endLine >= startLine`.
  - Clamp `endLine` to `Math.min(endLine, totalLines)`. If `startLine > totalLines`, flag the finding or drop it.

### 4. Concurrency & Rate-Limit Backoff
- When Phase 5 executes the Review DAG, multiple reviewer roles (Structural, Semantic, Security) execute concurrently.
- To prevent immediate HTTP 429 rate limit errors:
  - Provider uses `createPromisePool(2)` to limit concurrent in-flight requests.
  - On HTTP 429 or 5xx:
    - If `Retry-After` header is present, parse it (either seconds or HTTP date) and delay accordingly.
    - Otherwise, apply exponential backoff with jitter: `delay = Math.min(10000, 1000 * Math.pow(2, attempt)) * (0.8 + Math.random() * 0.4)`.
    - Retry up to 3 times before re-throwing `ProviderRateLimitError` or `ModelError`.

### 5. Template Engine & Prompt Markdown Files
- Markdown files in `src/model/prompts/`:
  - `reviewer.structural.v1.md`
  - `reviewer.semantic.v1.md`
  - `reviewer.security.v1.md`
  - `critic.v1.md`
- Built-in template renderer:
  - Interpolates `{{variable}}`.
  - Interpolates loops: `{{#projectRules}}\n- {{.}}\n{{/projectRules}}`.
  - Inlines embedded string fallbacks in `src/model/prompts/fallbacks.ts` so imports always succeed even when asset copying is skipped in compilation.

</research_summary>

<verification_plan>
## Verification Plan

### Automated Unit & Integration Tests
1. **Template Engine (`src/model/prompts/template.test.ts`):**
   - Variable substitution (`{{key}}`).
   - Block iterations (`{{#rules}}...{{/rules}}`).
   - Fallback template loading when disk file is absent.
2. **Schema & JSON Extractor (`src/model/schema/validator.test.ts`):**
   - Pure JSON parsing.
   - Markdown code fence stripping (```` ```json ````).
   - Trailing comma removal.
   - Zod validation for all required `ModelFinding` fields and enum constraints (`severity`, `category`).
   - File existence and line boundary clamping against fixture files.
3. **NVIDIA Provider Resilience & Client (`src/model/providers/nvidia.test.ts`):**
   - Successful 200 response parsing into `ModelResponse`.
   - 401 Unauthorized -> `AuthenticationError`.
   - 429 Rate Limit with exponential backoff & `Retry-After` header -> succeeds on retry or throws `ProviderRateLimitError`.
   - 500/502/503 Server Error -> retries up to 3 times.
   - Request timeout (60s) -> `ProviderTimeoutError`.
   - AbortSignal cancellation -> immediate abort with zero lingering requests.
   - Malformed JSON triggering 2-turn repair loop.
   - Secret redaction ensuring `NVIDIA_API_KEY` never appears in logs or error messages.
4. **Abstraction Factory (`src/model/abstraction.test.ts`):**
   - `createModelProvider('nvidia', config)` returns valid `ReviewModel`.

### Manual / Smoke Test
- Run `octate doctor` and verify NVIDIA connectivity checks pass.
- Test `LocalNvidiaProvider` with mock completions.
</verification_plan>

# Phase 4: Model Provider - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10T16:35:00.000Z
**Phase:** 4-model-provider
**Areas discussed:** Retry & Rate-Limit Strategy, Schema Validation & Malformed JSON Recovery, Prompt Template Architecture, Provider Concurrency & Client-Side Rate Limiting

---

## Retry & Rate-Limit Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 60s default timeout (with octate.yaml override) | Gives Nemotron 550B sufficient reasoning time on large context windows without premature aborts | ✓ |
| 30s strict timeout | Fails fast on network stalls, but risks cutting off large or complex diff reviews | |
| 90s generous timeout | Ensures completion during heavy NVIDIA API endpoint load, but lengthens wait on hangs | |

**User's choice:** 60s default timeout (with octate.yaml config override).
**Notes:** Configurable via `model.timeoutMs` in `octate.yaml`.

| Option | Description | Selected |
|--------|-------------|----------|
| Max 3 retries with exponential backoff + jitter (1s, 2s, 4s with ±20% jitter, 10s cap) and honor Retry-After header | Balanced retry strategy respecting 429 and transient errors | ✓ |
| Max 2 retries with fixed 2s delays | Fast failure, but may fail prematurely during momentary API bursts | |
| Max 5 retries with longer backoff (up to 30s cap) | Maximizes CI resilience, but can feel sluggish in interactive terminal runs | |

**User's choice:** Max 3 retries with exponential backoff + jitter and honor `Retry-After`.
**Notes:** Handles HTTP 429, 500, 502, 503, 504, and network errors.

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct typed errors (AuthenticationError, ProviderRateLimitError, ProviderTimeoutError, ModelError) mapping to exit code 4 with secret redaction | Clear classification for CLI reporting and exit codes | ✓ |
| Single generic ModelError with status code, response body, and error cause attached | Simpler hierarchy | |
| Return ModelResponse with finishReason: 'error' and empty findings instead of throwing | Avoids exceptions | |

**User's choice:** Distinct typed errors mapping to exit code 4 with secret redaction.
**Notes:** Reuses error hierarchy in `src/errors/index.ts`.

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable NVIDIA_API_KEY only | Fails with clear actionable instructions if missing, preventing accidental key commits | ✓ |
| Environment variable first, with fallback to global user config | Multiple lookup locations | |
| Interactive prompt when missing in interactive mode | Prompts user dynamically | |

**User's choice:** Environment variable `NVIDIA_API_KEY` only.
**Notes:** Keeps repository configs zero-secret.

---

## Schema Validation & Malformed JSON Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Robust JSON extraction (strip code fences, extract outermost boundary, normalize trailing commas) | Maximizes parse success on markdown-wrapped LLM responses | ✓ |
| Strict JSON parsing | Requires pure JSON with zero markdown fences | |
| Two-pass parsing | Try exact JSON.parse first, then strip fences if error occurs | |

**User's choice:** Robust JSON extraction.
**Notes:** Extracts `{...}` or `[...]` and removes markdown fences prior to `JSON.parse`.

| Option | Description | Selected |
|--------|-------------|----------|
| 1 repair retry with schema feedback | Sends specific Zod errors back to the model for single correction attempt | |
| 2 repair retries with schema feedback | Maximum resilience against complex schema hallucination | ✓ |
| No repair retries | Immediately reject and throw ValidationError | |

**User's choice:** 2 repair retries with schema feedback.
**Notes:** Provides high resilience when model hallucinates schema keys or invalid enum severities.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict path & line boundary validation | Ensure file exists in repository/diff, verify positive line numbers, and clamp/validate ranges against actual file lengths | ✓ |
| Schema-only validation in provider | Leave file existence and semantic grounding to Critic in Phase 5 | |
| Lenient filter | Drop findings referencing nonexistent files silently | |

**User's choice:** Strict path & line boundary validation.
**Notes:** Findings are grounded in real files before passing out of provider.

| Option | Description | Selected |
|--------|-------------|----------|
| Reusable compiled Zod schema validator + OpenAI response_format: { type: 'json_object' } | Enforces JSON mode at provider API level and validates structure | ✓ |
| Compiled Zod schema validator only with system prompt instructions | No response_format parameter | |
| Dual-mode with fallback | Try response_format then fallback | |

**User's choice:** Reusable compiled Zod schema validator + OpenAI `response_format: { type: 'json_object' }`.
**Notes:** Passes `{ type: 'json_object' }` in chat completion payload.

---

## Prompt Template Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript modules with typed prompt builders | Code-only templates | |
| External markdown template files (.planning/prompts/ or src/prompts/*.md) with Mustache-style variable interpolation loaded from disk | Clear prompt readability and editing | ✓ |
| Centralized dictionary object in a single file | Single object map | |

**User's choice:** External markdown template files with Mustache-style variable interpolation loaded from disk.
**Notes:** Placed in `src/model/prompts/*.md`.

| Option | Description | Selected |
|--------|-------------|----------|
| Two-message OpenAI format: System message holds role instructions, domain expertise, and JSON schema; User message holds serializePromptContext with sandwich policy framing | Natural chat completions structure | ✓ |
| Multi-message chat sequence | 3+ turns | |
| Single giant user message | Everything in user message | |

**User's choice:** Two-message OpenAI format (System + User).
**Notes:** Pairs with Phase 3's `serializePromptContext`.

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight built-in template renderer (simple {{var}} and {{#rules}} array blocks) | Zero external dependencies, fast | ✓ |
| External template engine (Handlebars or Mustache) | New dependencies | |
| Plain string placeholder replacement | No block support | |

**User's choice:** Lightweight built-in template renderer with zero external dependencies.
**Notes:** Implemented in `src/model/prompts/template.ts`.

| Option | Description | Selected |
|--------|-------------|----------|
| In src/model/prompts/*.md loaded via import.meta.dirname with embedded fallback strings | Works both from source and when packaged/bundled | ✓ |
| Strictly disk-based in src/model/prompts/*.md | Requires disk file at runtime | |
| Configurable with repo .octate/prompts/ override | Repository overrides | |

**User's choice:** In `src/model/prompts/*.md` loaded via `import.meta.dirname` with embedded fallback strings.
**Notes:** Ensures bundled and standalone CLI distributions never crash on missing files.

---

## Provider Concurrency & Client-Side Rate Limiting

| Option | Description | Selected |
|--------|-------------|----------|
| Internal concurrency limit of 2 (configurable up to 4) using p-limit/PromisePool | Prevents burst 429 rate limit spikes when multiple reviewers trigger simultaneously | ✓ |
| Unbounded in provider | Relies on caller | |
| Strict serial execution (concurrency = 1) | Slows down review | |

**User's choice:** Internal concurrency limit of 2 (configurable up to 4).
**Notes:** Uses `PromisePool` or `p-limit`.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict AbortSignal propagation (pass signal directly into fetch, abort active sockets and purge queued requests) | Clean cancellation on Ctrl+C | ✓ |
| Soft cancellation | Discards response but leaves fetch running | |
| Timeout cancellation only | Ignores Ctrl+C for API requests | |

**User's choice:** Strict AbortSignal propagation.
**Notes:** Sockets closed immediately, queue drained.

| Option | Description | Selected |
|--------|-------------|----------|
| Structured Pino logging + ModelResponse usage tracking | Log tokens, latency, rate limits at debug level, exposing totals on ModelResponse | ✓ |
| Minimal tracking | Response only, no logs | |
| Dedicated audit log file | Separate file in ~/.local/share/octate/ | |

**User's choice:** Structured Pino logging + ModelResponse usage tracking.
**Notes:** Uses `createLogger('model/nvidia')`.

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable custom fetch injector in provider options | Injected fetch mock | |
| Global fetch spying with jest.spyOn(globalThis, 'fetch') across all provider tests | Standard Jest testing pattern | ✓ |
| Real network tests only | Needs live API key | |

**User's choice:** Global fetch spying with `jest.spyOn(globalThis, 'fetch')` across all provider tests.
**Notes:** Hermetic tests without live network calls.

---

## the agent's Discretion

- Regex implementation details for markdown fence removal and bracket extraction.
- Exact phrasing and formatting for the 2-turn schema-repair re-prompt.
- In-memory embedded fallback strings for the prompt templates.

---

## Deferred Ideas

- Hosted Vercel proxy (`HostedProvider` routing requests through Octate backend API with server-side secrets) — deferred to cloud/hosted milestone.
- Local model execution (Ollama / llama.cpp / vLLM) — deferred to v2 local inference roadmap.
- Multi-provider support (OpenAI, Anthropic, Google Gemini) — deferred to future provider expansion.

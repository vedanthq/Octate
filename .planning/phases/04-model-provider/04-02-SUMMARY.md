---
phase: 04-model-provider
plan: 02
subsystem: model
tags: [zod, schema, grounding, validation, extraction]
requires: []
provides:
  - compiled zod schemas for model finding and response
  - robust json extraction stripping markdown fences and trailing commas
  - repository path and line grounding
  - zod error repair prompt formatting
affects:
  - src/model/schema/
tech-stack:
  added: []
  patterns: [compiled-schema, aot-validation, grounding-guard, self-repair-prompt]
key-files:
  created:
    - src/model/schema/extractor.ts
    - src/model/schema/extractor.test.ts
    - src/model/schema/finding.ts
    - src/model/schema/finding.test.ts
    - src/model/schema/grounding.ts
    - src/model/schema/grounding.test.ts
    - src/model/schema/repair.ts
    - src/model/schema/repair.test.ts
    - src/model/schema/index.ts
key-decisions:
  - "Used z.compile() for AOT optimization of ModelResponse validation"
  - "Sanitized paths to strictly reject path traversal ('..') and absolute paths"
  - "Clamped line numbers to file length and dropped phantom findings"
requirements-completed:
  - MODEL-03
duration: 5 min
completed: 2026-09-10
---

# Phase 4 Plan 02 Summary: Zod Schema Validation & Grounding

## Objectives Delivered
- `extractJsonFromText` & `safeJsonParse`: Strips markdown code fences, commentary, and trailing commas from LLM output before parsing.
- `ModelFindingSchema` & `ModelResponseSchema`: Compiled Zod schemas enforcing strict enums for 5 severities and 8 categories, required fields, and stripped unknown keys.
- `validateModelResponse`: AOT-compiled validator accepting both `{ findings: [...] }` objects and raw arrays.
- `groundFinding` & `groundFindings`: Validates relative paths against traversal (`..`), validates against allowed file whitelists, drops phantom findings exceeding total file lines, and clamps out-of-bounds line numbers.
- `formatZodIssuesForRepairPrompt`: Formats specific Zod validation errors into structured repair prompts for multi-turn correction.
- `src/model/schema/index.ts`: Barrel export for all schema validation components.

## Verification
- `pnpm test src/model/schema/` passed 4 test suites (32/32 tests).
- `npx tsc --noEmit` passed with 0 errors.
- `pnpm biome check src/model/schema/` passed with 0 errors.

## Self-Check: PASSED

# Phase 2: Analysis Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-09-09
**Phase:** 02-analysis-layer
**Mode:** discuss
**Areas analyzed:** Tree-sitter Integration, Symbol Extraction Schema, Static Analysis Orchestration, Diagnostics Structuring

## Decisions Made

### Tree-sitter Integration
| Decision | Choice | Notes |
|----------|--------|-------|
| Integration method | WASM bindings | Cross-platform, no native compilation |
| Language loading | Eager loading all grammars | Faster parsing for multi-language files |
| Error handling | Graceful degradation | Skip unsupported files, log warnings |

### Symbol Extraction Schema
| Decision | Choice | Notes |
|----------|--------|-------|
| Symbol ID generation | Content-based hash | SHA256(filePath + symbolName + symbolKind) |
| Symbol scope | All exported + changed | Balances completeness with performance |
| Parent tracking | Direct parent reference | Simple parentID reference |

### Static Analysis Orchestration
| Decision | Choice | Notes |
|----------|--------|-------|
| Tool detection | Hybrid with fallbacks | Check config first, fallback to defaults |
| Tool execution | Spawn subprocesses | Isolated, respects tool versions |
| Execution strategy | Parallel with concurrency limit | Use existing p-limit from cache layer |

### Diagnostics Structuring
| Decision | Choice | Notes |
|----------|--------|-------|
| Severity mapping | Standardized mapping | Errors → critical, warnings → high/medium |
| Output format | Unified diagnostic schema | Consistent structure across all tools |
| Tool failures | Graceful degradation | Log warning, skip failed tool |

## Deferred Ideas

- Custom tree-sitter queries for language-specific patterns
- Architecture boundary detection via static analysis
- Test coverage integration
- Performance profiling of analysis pipeline

---

*Discussion log: 2026-09-09*

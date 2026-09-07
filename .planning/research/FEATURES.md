# Feature Landscape

**Domain:** Terminal-native AI code-review CLI
**Researched:** 2025-09-06
**Sources:** Cubic, CodeRabbit, Qodo, Graphite, GitHub Copilot, SonarQube, Jules documentation + competitive analysis

---

## Table Stakes

Features users expect from any AI code-review tool. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Git diff analysis** | Core purpose: review what changed | Low | Working tree, staged, commit range, branch comparison |
| **Multi-language support** | Real repos are polyglot | Medium | TS/JS/Python minimum; others later |
| **Finding categorization** | Users triage by type | Low | Severity (critical/high/medium/low), category (security/correctness/perf/arch) |
| **Evidence/location references** | Devs need to jump to code | Low | File + line ranges for finding + evidence |
| **Configuration file** | Teams customize rules | Low | YAML/TOML at repo root (octate.yaml) |
| **Ignore patterns** | Generated/vendor code wastes tokens | Low | Glob patterns for files, dirs, branches |
| **JSON output** | CI/CD integration | Low | Machine-readable for automation |
| **SARIF output** | Industry standard for security tools | Low | GitHub/GitLab/Azure DevOps code scanning |
| **Exit codes** | Scriptable in pipelines | Low | 0=pass, 1=blocking, 2=config, 3=git, 4=model, 5=internal |
| **Incremental analysis** | Re-reviewing same repo must be fast | Medium | Cache symbols, diagnostics; reparse only changed files |
| **Repository discovery** | `cd repo && octate review` just works | Low | Auto-detect Git root, workspace, monorepo |
| **Progress indication** | Long-running AI calls need feedback | Low | Streaming status: indexing → analyzing → reviewing → ranking |
| **Cancellation (Ctrl+C)** | Devs abort slow reviews | Medium | Clean shutdown of model requests, subprocesses |
| **Schema-validated output** | Unstructured LLM output is unreliable | Medium | Validate findings structure before rendering |

---

## Differentiators

Features that set Octate apart. Not expected by default, but high value for terminal-native workflow.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Interactive TUI workspace** | Navigate findings, inspect source, view evidence without leaving terminal | High | Ink-based; keyboard-first; split-pane finding navigator + source + details |
| **Local-first execution** | Source never leaves machine; zero cloud dependency for core review | Medium | Only context sent to NVIDIA; Git/parsing/graph local |
| **Repository Intelligence Graph** | Persistent symbol/reference/dependency graph powers review, ask, explain, impact | High | Incremental Tree-sitter + language tooling; bounded traversal |
| **Context Engine with token budgeting** | Relevant context only; lower latency/cost/noise vs full-repo dump | High | Rank candidates (changed symbols → callers → types → tests → config → history) |
| **Review DAG (multi-reviewer pipeline)** | Structural + Semantic + Security reviewers → Critic → Dedup → Rank | High | Not single-prompt; each reviewer has focused responsibility |
| **Critic / false-positive reduction** | Aggressive filtering before human sees findings | High | Truth check, evidence verification, intentionality, duplicate detection |
| **Evidence-backed findings** | Every finding cites repository locations (callers, types, tests, config) | Medium | TUI allows jumping to evidence files/lines |
| **Confidence scoring (0.0–1.0)** | Ranking signal; not mathematical truth | Medium | Display as % in TUI; used for ranking |
| **Custom rules as executable knowledge** | YAML rules → deterministic graph checks + AI explanation | Medium | Architecture boundaries, forbidden deps, path constraints |
| **`octate ask` / `explain` / `impact`** | Same graph + context engine powers Q&A beyond review | Medium | Reuses Repository Intelligence layer |
| **Local cache at `~/.local/share/octate/`** | Fast startup; project-namespaced; no source retention | Low | Indexes, diagnostics, findings metadata |
| **Non-interactive modes (--json/--sarif/--quiet)** | Same engine, different renderers | Low | Shared ReviewResult domain object |
| **Prompt injection protection** | Repository content treated as untrusted | Medium | Trusted (system policy, rules, task) vs untrusted (source, comments) separation |
| **NVIDIA Nemotron behind provider abstraction** | Swappable model; not locked to one vendor | Low | Interface: `ReviewModel.generate(request)` |

---

## Anti-Features

Features to explicitly NOT build in MVP (and likely never for core product).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Web dashboard** | Terminal-native first; web is future layer (§3, §82) | Build excellent TUI; web consumes same core later |
| **GitHub App (webhook-based)** | Heavy infra; not needed for local review | Phase A: GitHub Action wrapping `octate review --json` (§82) |
| **GitLab App (webhook-based)** | Same as GitHub | Phase A: GitLab CI adapter wrapping CLI output |
| **Multiple model providers** | Complexity without proven demand | NVIDIA only; provider boundary exists for future (§41) |
| **Local inference (Ollama/vLLM)** | Hardware variability; not MVP | Future capability (§85) behind same abstraction |
| **Autonomous coding agent** | Review quality must be proven first (§79, §92) | `octate fix <finding-id>` later, with human approval loop |
| **Hosted arbitrary code execution** | Security boundary; separate problem (§80) | Never in normal request path; sandboxed if ever |
| **Billing / enterprise admin** | Free during validation (§60–64) | Quotas/rate limits only; SSO/RBAC/audit in §86.1 |
| **Vector database** | Not needed for deterministic repository intelligence | Graph-based retrieval is more precise |
| **Custom model training** | Model is replaceable implementation detail (§121) | Prompt engineering + context engineering |
| **Kubernetes / microservices** | Premature for terminal product (§92) | Single Node.js process; Vercel for hosted API later |
| **Separate TUI product** | One terminal app with CLI entry points + workspaces (§2.1) | `octate review` launches interactive workspace |
| **Real-time chat** | Not a chat product | `octate ask` / `octate chat` for structured Q&A |
| **Mobile app** | Terminal-only | N/A |
| **Plugin system** | Not MVP; core must be solid first | Extensibility via config rules + future provider interface |
| **Custom rule DSL** | Rules evolve from prompt text to executable knowledge (§47) | YAML config + graph constraints |
| **Rust implementation** | TypeScript/Node.js only initially (§4) | Profile first; native only if bottleneck proven |
| **IDE integrations** | Terminal-first; IDE later | CLI/TUI excellence first |
| **Team features (shared rules, analytics)** | Future phase (§83) | Single-developer workflow first |

---

## Feature Dependencies

```
Repository Discovery (REPO-01)
    ↓
Git Diff Generation (REPO-02)
    ↓
Tree-sitter Parsing (PARSE-01)
    ↓
Symbol Extraction (PARSE-02)
    ↓
Reference Graph (PARSE-03) ←→ Dependency Graph (PARSE-04)
    ↓
Static Analysis (ANAL-01, ANAL-02)
    ↓
Context Engine (CTX-01, CTX-02)
    ↓
Review DAG (REV-01)
    ├── Structural Reviewer
    ├── Semantic Reviewer
    └── Security Reviewer
    ↓
Critic (REV-02)
    ↓
Deduplication (REV-03)
    ↓
Ranking (REV-04)
    ↓
Model Provider (MODEL-01, MODEL-02)
    ↓
Schema Validation (MODEL-03)
    ↓
Prompt Injection Protection (MODEL-04)
    ↓
ReviewResult
    ├── Interactive TUI (TUI-01, TUI-02, TUI-03)
    ├── Human Renderer
    ├── JSON Renderer (OUT-01)
    └── SARIF Renderer (OUT-01)
```

**Critical path for MVP:**
`REPO-01 → REPO-02 → PARSE-01 → PARSE-02 → PARSE-03 → ANAL-01 → CTX-01 → REV-01 → REV-02 → REV-03 → REV-04 → MODEL-01 → MODEL-03 → TUI-01`

**Parallelizable:**
- `PARSE-04` (dependency graph) can run alongside `PARSE-03`
- `ANAL-02` (test discovery) alongside `ANAL-01`
- `CACHE-01/02/03` infrastructure throughout
- `CONF-01/02` configuration loading early

---

## MVP Recommendation

### Prioritize (Must Have for v0.1)
1. **Repository discovery + Git diff** (REPO-01, REPO-02) — Foundation
2. **Tree-sitter parsing + symbol extraction** (PARSE-01, PARSE-02) — Intelligence base
3. **Reference graph + static analysis** (PARSE-03, ANAL-01) — Deterministic facts
4. **Context Engine + token budgeting** (CTX-01, CTX-02) — Bounded relevant context
5. **Review DAG (3 reviewers + Critic + Dedup + Rank)** (REV-01–04) — Quality findings
6. **NVIDIA provider + schema validation** (MODEL-01, MODEL-03) — Trusted output
7. **Interactive TUI workspace** (TUI-01, TUI-02, TUI-03) — Product surface
8. **JSON/SARIF output + exit codes** (OUT-01, OUT-02) — CI/CD ready
9. **Configuration + ignore patterns** (CONF-01, CONF-02) — Team adoption
10. **Local cache + incremental indexing** (CACHE-01, CACHE-02) — Speed
11. **Cancellation + prompt injection protection** (CACHE-03, MODEL-04) — Safety

### Defer (Post-MVP)
| Feature | Reason |
|---------|--------|
| `octate ask` / `explain` / `impact` | Reuses graph/context; build after review proven |
| `octate scan --security/--architecture` | Graph traversal + deterministic rules; later |
| `octate fix <finding-id>` | Requires trusted review + verification loop |
| `octate chat` | Conversational interface; not core |
| Custom rules as executable knowledge | Start with YAML prompt rules; graph rules later |
| Architecture diagrams | Visualization; terminal ASCII later if at all |
| Cross-repo review | Monorepo support first; multi-repo later |
| Auto-approve / PR description generation | Hosted service features |
| Slack/IDE integrations | Terminal-first |
| Team features (shared rules, analytics) | Single-developer first |
| Local inference provider | Behind abstraction; demand-driven |
| Vector database | Not needed |

---

## Competitive Feature Matrix (Reference)

| Feature | Cubic | CodeRabbit | Qodo | Graphite | GitHub Copilot | SonarQube | Octate (MVP) |
|---------|-------|------------|------|----------|----------------|-----------|--------------|
| **Local-first (no cloud)** | ✗ | ✗ | ✗ | ✗ | ✗ | Self-hosted | ✓ |
| **Terminal-native TUI** | ✗ | ✗ | ✗ | ✗ | CLI only | ✗ | ✓ |
| **Git diff review** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Multi-language** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (30+) | TS/JS/Py |
| **Repository graph** | Partial | Codegraph | Partial | Partial | Limited | ✓ | ✓ (core) |
| **Context engine + budget** | Implicit | Implicit | Implicit | Implicit | Implicit | N/A | ✓ (explicit) |
| **Review DAG (multi-reviewer)** | ✓ | Ensemble | Agents | Single | Single | Rules | ✓ |
| **Critic / false-positive reduction** | Learning | Learnings | Compliance | Custom rules | Feedback | Rules | ✓ (explicit) |
| **Evidence-backed findings** | ✓ | ✓ | ✓ (expand_evidence) | ✓ | Limited | ✓ | ✓ (mandatory) |
| **Confidence scoring** | Implicit | Implicit | Severity ranks | Implicit | No | Severity | ✓ (0.0–1.0) |
| **Custom rules** | Custom agents | Path instructions + recipes | Compliance checklists | Custom rules | Instructions | Quality profiles | YAML + graph |
| **Learning/memory** | ✓ (review memory) | ✓ (knowledge base) | Compliance | No | No | No | Future |
| **JSON/SARIF output** | ✓ | ✓ | ✓ | ✓ | Limited | ✓ | ✓ |
| **CI/CD integration** | GitHub App | GitHub/GitLab/BB App | GitHub/GitLab/BB/Azure | GitHub App | GitHub | CI | CLI + Action |
| **Interactive workspace** | Web | Web + IDE | Web | Web + CLI | IDE + CLI | Web | TUI |
| **Autonomous fixes** | "Fix with Cubic" | Coding agent | Agentic | No | Copilot agent | No | Future |
| **Architecture diagrams** | ✓ | Change Stack | No | No | No | No | Future |
| **Security scanning** | Partial | Trivy + agent | Compliance agent | No | Limited | ✓ (SAST) | Security reviewer |
| **Pricing model** | Per-seat | Per-seat | Per-seat | Per-seat | Per-seat | Per-seat | Free (local) |

---

## Sources

- Cubic: https://docs.cubic.dev/ (CLI, cubic.yaml, custom agents, ultrareview, cross-repo, architecture diagrams, memory)
- CodeRabbit: https://docs.coderabbit.ai/ (CLI, pre/post-merge, codegraph, triage, change stack, security agent, Slack agent, learnings)
- Qodo: https://docs.qodo.ai/ (lean/verbose review, compliance, agentic review, multi-provider config)
- Graphite: https://graphite.com/docs/ (AI reviews, customization, exclusions, custom rules)
- GitHub Copilot: https://github.com/features/copilot (CLI, chat, agents, inline suggestions)
- SonarQube: https://www.sonarsource.com/products/sonarqube/ (static analysis, quality gates, 30+ languages)
- Jules: https://jules.google/ (async coding agent, GitHub integration, sessions, plan approval)
- Octate CONTEXT.md (project requirements, architecture, constraints, evolution)
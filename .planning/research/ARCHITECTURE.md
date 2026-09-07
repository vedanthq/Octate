# Architecture Patterns

**Domain:** Terminal-native AI code-review CLI
**Researched:** 2025-09-06

## Recommended Architecture

Octate follows a strict layered architecture where each layer has a single responsibility and communicates only with adjacent layers. The architecture is designed so the **terminal application is the product surface** and the **review engine is the core** — the review engine has zero knowledge of whether it's being rendered as interactive TUI, plain text, JSON, or SARIF.

```
┌───────────────────────────────────────────────────────────────┐
│ Terminal Presentation Layer                                    │
│ Ink / interactive TUI / CLI output                            │
├───────────────────────────────────────────────────────────────┤
│ Command/Application Layer                                      │
│ commands / use cases / sessions / state                       │
├───────────────────────────────────────────────────────────────┤
│ Review Layer                                                   │
│ review DAG / reviewers / critic / dedup / ranking             │
├───────────────────────────────────────────────────────────────┤
│ Intelligence Layer                                            │
│ context / symbols / references / dependency graph             │
├───────────────────────────────────────────────────────────────┤
│ Analysis Layer                                                 │
│ AST / static analysis / tests / diagnostics                   │
├───────────────────────────────────────────────────────────────┤
│ Repository Layer                                               │
│ Git / filesystem / workspace / ignore / history               │
├───────────────────────────────────────────────────────────────┤
│ Model Layer                                                    │
│ model interface / NVIDIA adapter / prompts                    │
├───────────────────────────────────────────────────────────────┤
│ Local Infrastructure                                           │
│ cache / config / logging / process control                    │
└───────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Terminal Presentation** | Renders ReviewResult via InteractiveRenderer, HumanRenderer, JsonRenderer, SarifRenderer. Handles keyboard input, progress streaming, TUI state. | Application Layer (receives ReviewResult + progress events) |
| **Command/Application Layer** | Converts CLI commands into use cases (ReviewUseCase, ScanUseCase, AskUseCase, etc.). Loads config, establishes repository session, determines scope, invokes analysis, builds context, invokes review engine, exposes progress, returns domain results, handles cancellation, maps errors. | Terminal Presentation (output), Review Layer (input), Repository Layer (input), Intelligence Layer (input) |
| **Review Layer** | Transforms ReviewContext into candidate findings via Review DAG: Structural Reviewer → Semantic Reviewer → Security Reviewer → Critic → Deduplication → Ranking → Final Findings. Returns ReviewResult domain object. | Intelligence Layer (input: ReviewContext), Model Layer (via abstraction), Command Layer (output: ReviewResult) |
| **Intelligence Layer** | Repository Intelligence: Symbol Index, Reference Graph, Dependency Graph. Context Engine: ranks candidates (changed symbols, callers/callees, related types/tests/config/history/diagnostics), produces bounded ReviewContext within token budgets. | Analysis Layer (input: symbols, diagnostics), Repository Layer (input: graph data), Review Layer (output: ReviewContext) |
| **Analysis Layer** | Deterministic information: parsing (Tree-sitter), AST, symbol extraction, import/export extraction, reference extraction, dependency detection, diagnostics (TypeScript compiler, ESLint/Biome, ruff, mypy/pyright, pytest, bandit), test discovery, security scanner integration. | Repository Layer (input: files), Intelligence Layer (output: symbols, diagnostics, references) |
| **Repository Layer** | Local workspace ownership: repository discovery, filesystem access, Git operations (diff, status, history, branch info), workspace detection, ignore handling, file metadata, commit history, diff generation. Handles symlinks, large files, binary files, generated files, ignored files, .git, vendor dirs, node_modules, build output, worktrees, monorepos. | Analysis Layer (output: files, diffs), Intelligence Layer (output: graph data) |
| **Model Layer** | Model abstraction interface (`ReviewModel.generate(request): Promise<ModelResponse>`). NVIDIA adapter implements: API auth, HTTP, request/response serialization, timeout, retry, rate-limit handling, structured errors, cancellation, usage metadata. Prompt architecture: versioned prompt definitions (reviewer.structural.v1, reviewer.semantic.v1, reviewer.security.v1, critic.v1). Schema-validated structured output. Prompt injection protection (trusted vs untrusted content separation). | Review Layer (via abstraction), Local Infrastructure (config, cache) |
| **Local Infrastructure** | Cache (`~/.local/share/octate/` with indexes, cache, findings, logs), config (octate.yaml with precedence: defaults → global → project → env → CLI), logging, process control, bounded concurrency (promise pool/task queue), graceful cancellation (Ctrl+C). | All layers (cross-cutting) |

---

## Data Flow

### Canonical Review Flow

```
User
  │
  │ octate review
  ▼
CLI command
  │
  ▼
Review Use Case
  │
  ├── load config
  ├── discover repository
  └── determine scope
  │
  ▼
Git
  │
  └── diff
  │
  ▼
Repository Analysis
  │
  ├── parse changed files
  ├── resolve symbols
  ├── diagnostics
  └── tests
  │
  ▼
Repository Graph
  │
  ▼
Context Engine
  │
  ▼
Review DAG
  │
  ├── Structural Reviewer
  ├── Semantic Reviewer
  └── Security Reviewer
  │
  ▼
Critic
  │
  ▼
Deduplication
  │
  ▼
Ranking
  │
  ▼
Validation
  │
  ▼
ReviewResult
  │
  ├── InteractiveRenderer → TUI
  ├── HumanRenderer → plain text
  ├── JsonRenderer → JSON
  └── SarifRenderer → SARIF
```

### Hosted Future Data Flow (Not Current Phase)

When hosted functionality is introduced:

```
Terminal Application
  │
  ▼
Local repository analysis
  │
  ▼
Relevant ReviewContext (minimal, bounded)
  │
  ▼
Vercel API
  │
  ▼
NVIDIA API
  │
  ▼
Structured result
  │
  ▼
Terminal UI
```

**Key principle:** Do not upload unnecessary repository data. Local Git analysis, parsing, graph construction, and context selection happen locally; only relevant context is transmitted.

---

## Patterns to Follow

### Pattern 1: Layered Architecture with Strict Dependency Direction

**What:** Dependencies flow downward only. Core/domain code must not depend on: Ink, Vercel, Next.js, NVIDIA HTTP specifics, terminal-specific APIs. The UI consumes application state. The provider implements the model abstraction. The model abstraction does not depend on NVIDIA.

**When:** Always — this is the foundational architectural constraint.

**Example:**
```typescript
// ✓ GOOD: Core depends on abstraction
interface ReviewModel {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

// ✓ GOOD: Provider implements abstraction
class NvidiaProvider implements ReviewModel {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    // NVIDIA HTTP specifics here
  }
}

// ✗ BAD: Core imports NVIDIA HTTP client directly
import { NvidiaHttpClient } from './nvidia-http'; // WRONG
```

---

### Pattern 2: Review DAG (Not Single Prompt)

**What:** Decompose review into multiple specialized reviewers that feed into a Critic, then Deduplication, then Ranking. Each reviewer has a focused responsibility and the Critic aggressively filters false positives.

**When:** Building the review engine (REV-01 through REV-04).

**Example:**
```typescript
// Review DAG structure
interface ReviewDAG {
  structural: StructuralReviewer;
  semantic: SemanticReviewer;
  security: SecurityReviewer;
  critic: Critic;
  deduplicator: Deduplicator;
  ranker: Ranker;
}

// Each reviewer is independent, composable, testable
class StructuralReviewer implements Reviewer {
  async review(context: ReviewContext): Promise<CandidateFinding[]> {
    // Focus: API contracts, type misuse, lifecycle, error handling, 
    // nullability, resource management, concurrency, structural test gaps
    // Consume deterministic diagnostics wherever possible
  }
}

class Critic implements Critic {
  async critique(candidates: CandidateFinding[], context: ReviewContext): Promise<Finding[]> {
    // For each candidate:
    // - Is it actually true?
    // - Does repository evidence prove it?
    // - Is the behavior intentional?
    // - Is it already handled?
    // - Is impact meaningful?
    // - Is severity justified?
    // - Is it actionable?
    // - Is it duplicate?
    // - Would a senior engineer want this comment?
    // Weak findings discarded
  }
}
```

---

### Pattern 3: Context Engine with Token Budgeting

**What:** The Context Engine intentionally selects relevant context rather than sending the entire repository. It ranks candidates and produces a bounded ReviewContext within token budgets.

**When:** Building the Intelligence Layer (CTX-01, CTX-02).

**Example:**
```typescript
interface ContextEngine {
  buildContext(scope: ReviewScope, graph: RepositoryGraph, diagnostics: Diagnostic[]): ReviewContext;
}

interface ContextCandidate {
  type: 'changed-symbol' | 'direct-caller' | 'direct-callee' | 'related-type' 
      | 'related-test' | 'architecture-rule' | 'relevant-config' | 'git-history';
  score: number;        // 0-100 ranking
  tokens: number;       // estimated token count
  content: ContextFragment;
}

// Ranking example (tunable):
// Changed symbol:           100
// Direct caller/callee:      90
// Related type/interface:    80
// Related test:              80
// Architecture rule:         70
// Relevant configuration:    60
// Relevant Git history:      40
```

---

### Pattern 4: Untrusted Repository Content / Trusted Instructions Separation

**What:** Prompt architecture explicitly separates trusted content (system policy, Octate rules, review task) from untrusted repository content (source, comments, README, commit messages, repo config, generated files). Repository content never overrides instructions.

**When:** Building the Model Layer (MODEL-04).

**Example:**
```typescript
interface ModelRequest {
  // TRUSTED — system-controlled
  systemPolicy: string;           // "You are a senior code reviewer..."
  octateRules: string[];          // Project rules from octate.yaml
  reviewTask: string;             // "Review the following changes for..."
  
  // TRUSTED — derived from deterministic analysis
  repositoryMetadata: RepositoryMetadata;
  diff: GitDiff;
  staticDiagnostics: Diagnostic[];
  
  // UNTRUSTED — repository content, clearly marked
  relevantSource: UntrustedSourceFragment[];
  
  // OUTPUT CONTRACT
  outputSchema: JsonSchema;       // Enforces structured output
}
```

---

### Pattern 5: Evidence-Backed Findings with Source Mapping

**What:** Every important finding includes inspectable evidence mapping to exact file/line ranges. The TUI allows jumping directly to evidence.

**When:** Building the Review Layer (REV-01 through REV-04) and TUI (TUI-01).

**Example:**
```typescript
interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'correctness' | 'security' | 'performance' | 'architecture' 
           | 'reliability' | 'maintainability' | 'compatibility' | 'testing';
  confidence: number;             // 0.0 - 1.0 (ranking signal, not mathematical truth)
  title: string;
  message: string;
  file: string;
  startLine: number;
  endLine: number;
  evidence: Evidence[];           // MANDATORY wherever reasonably possible
  relatedFiles: string[];
  relatedSymbols: string[];
  impact: string;
  suggestedFix?: string;
  reviewer: 'structural' | 'semantic' | 'security';
  metadata: Record<string, unknown>;
}

interface Evidence {
  file: string;
  startLine: number;
  endLine: number;
  relationship: 'calls' | 'called-by' | 'implements' | 'tests' | 'configures' | 'references';
  explanation: string;
}
```

---

### Pattern 6: Incremental Indexing with Content-Addressable Cache

**What:** Do not reparse the whole repository for every review. Cache keyed by content hash + file path + parser version + language + config version. Only changed files are re-parsed.

**When:** Building the Cache Layer (CACHE-01).

**Example:**
```typescript
interface CacheKey {
  contentHash: string;      // Blake3 or SHA-256 of file content
  filePath: string;         // Relative to repo root
  parserVersion: string;    // Tree-sitter grammar version
  language: string;         // 'typescript' | 'python' | ...
  configVersion: string;    // Hash of relevant octate.yaml sections
}

interface IncrementalIndexer {
  async update(repo: Repository, changedFiles: FileChange[]): Promise<IndexUpdate>;
  // For each changed file:
  //   parse → update symbols → update references → update dependency graph
  // Unchanged files: reuse cached symbols/references
}
```

---

### Pattern 7: Bounded Concurrency with Promise Pool

**What:** Parallelize independent tasks (parsing, diagnostics, reviewers) using a bounded promise pool/task queue. Never `Promise.all(allRepositoryFiles)`.

**When:** Building concurrency control (CACHE-02).

**Example:**
```typescript
class PromisePool {
  constructor(private concurrency: number) {}
  
  async map<T, R>(items: T[], mapper: (item: T) => Promise<R>): Promise<R[]> {
    // Implement bounded parallel execution
    // Respect system resources
  }
}

// Usage:
const pool = new PromisePool(navigator.hardwareConcurrency || 4);
const parsedFiles = await pool.map(changedFiles, parseFile);
const diagnostics = await pool.map(parsedFiles, runDiagnostics);
const reviews = await pool.map(reviewers, r => r.review(context));
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Diff → One Giant Prompt → Answer

**What:** Sending the entire diff to the model in a single prompt and expecting quality review output.

**Why bad:** 
- No deterministic analysis establishes facts first
- Model hallucinates on large context
- No evidence traceability
- No critique/deduplication/ranking pipeline
- Context window exhaustion on large changes
- All-or-nothing failure mode

**Instead:** Use the Review DAG with deterministic analysis first, bounded context, multiple specialized reviewers, critic, deduplication, ranking.

---

### Anti-Pattern 2: Core Depending on Terminal Rendering

**What:** Review engine importing Ink components or having TUI-specific logic.

**Why bad:** 
- Cannot test review engine without terminal
- Cannot produce JSON/SARIF without TUI
- Cannot swap renderer (web, different TUI library)
- Violates layered architecture

**Instead:** Review engine returns `ReviewResult` domain object. Renderers (InteractiveRenderer, HumanRenderer, JsonRenderer, SarifRenderer) transform it. Core has zero terminal dependencies.

---

### Anti-Pattern 3: Model Abstraction Leaking Provider Details

**What:** `ReviewModel` interface requiring NVIDIA-specific request/response shapes, or core code handling NVIDIA rate limits, auth, HTTP.

**Why bad:**
- Cannot add new providers without changing core
- Core polluted with provider-specific error handling
- Testing requires mocking NVIDIA specifics

**Instead:** Clean interface (`generate(request): Promise<ModelResponse>`). Provider handles all NVIDIA specifics. Core only knows domain types.

---

### Anti-Pattern 4: Sending Entire Repository to Model

**What:** Including all repository files in model context "for completeness."

**Why bad:**
- Increases latency, token usage, cost
- Adds noise → model distraction
- Reduces signal-to-noise ratio
- Violates privacy (local-first principle)
- Context window limits

**Instead:** Context Engine selects bounded, ranked, relevant context. Token budgets enforced.

---

### Anti-Pattern 5: Trusting Model Output Without Validation

**What:** Using model output directly as findings without schema validation, file path verification, line range checking, evidence validation.

**Why bad:**
- Model hallucinates file paths, line numbers
- Invalid JSON breaks pipeline
- Confidence scores meaningless without validation
- Security risk (prompt injection via model output)

**Instead:** Schema validation (Zod/JSON Schema) on every model response. Verify file paths exist, line ranges valid, evidence references real code. Treat model output as untrusted input.

---

### Anti-Pattern 6: Mixing UI State and Domain State

**What:** `ReviewSession` containing `selectedFinding`, `activePanel`, `scrollPosition`, `focusedPane`.

**Why bad:**
- Domain logic polluted with UI concerns
- Cannot serialize domain state for caching/sharing
- Testing requires UI setup
- Web/terminal dual rendering impossible

**Instead:** 
```typescript
// DOMAIN STATE (serializable, testable, portable)
interface ReviewSession {
  repository: RepositoryInfo;
  scope: ReviewScope;
  status: ReviewStatus;
  progress: ReviewProgress;
  findings: Finding[];
}

// UI STATE (ephemeral, terminal-specific)
interface ReviewUIState {
  selectedFinding: number;
  selectedFile?: string;
  activePanel: 'navigator' | 'source' | 'details';
  scrollPosition: number;
  focusedPane: string;
  keyboardMode: 'navigate' | 'inspect' | 'command';
}
```

---

## Scalability Considerations

| Concern | At 100 files | At 10K files | At 1M files |
|---------|--------------|--------------|-------------|
| **Git diff** | < 100ms | < 500ms | < 2s (sparse checkout) |
| **Incremental indexing** | < 1s | < 10s | Minutes (background, prioritized) |
| **Symbol index size** | ~10K entries | ~1M entries | ~100M entries (sharded, persistent) |
| **Reference graph traversal** | Full traversal OK | Bounded (2-3 hops) | Strictly bounded (1-2 hops), cached |
| **Context construction** | < 500ms | < 3s | < 5s (aggressive pruning) |
| **Model context tokens** | ~8K tokens | ~32K tokens | ~128K tokens (hard cap) |
| **Review DAG parallelism** | 3 reviewers sequential OK | 3 reviewers parallel | 3 reviewers parallel + sub-batching |
| **TUI rendering** | Instant | Virtualized list | Virtualized list, lazy source loading |
| **Cache storage** | ~10 MB | ~1 GB | ~50 GB (LRU eviction, compression) |

**Key scalability strategies:**
- **Incremental everything:** Only process changed files
- **Bounded graph traversal:** Never traverse entire repository by default
- **Context budgeting:** Hard token caps with priority-based selection
- **Virtualized TUI:** Render only visible findings/source lines
- **Lazy loading:** Load source/evidence on demand in TUI
- **Persistent indexes:** Survive across reviews, update incrementally
- **Monorepo scoping:** Context scoped to changed package + related workspace packages

---

## Build Order Implications (Dependencies Between Components)

The layered architecture dictates a strict build order. Each layer must be complete and tested before the layer above can be meaningfully implemented:

```
Phase 1: Foundation (can be parallel)
├── Local Infrastructure (config, cache, logging, process control)
├── Repository Layer (Git, filesystem, workspace, ignore, diff)
└── Model Layer Abstraction (interface only, no provider yet)

Phase 2: Analysis (depends on Repository Layer)
├── Parser (Tree-sitter integration for TS/JS/Python)
├── Symbol Extraction (stable IDs, references, imports/exports)
└── Static Analysis Integration (TS compiler, ESLint/Biome, ruff, mypy/pyright)

Phase 3: Intelligence (depends on Analysis)
├── Reference Graph (caller→callee, importer→imported, test→prod)
├── Dependency Graph (package, workspace, internal module)
└── Context Engine (ranking, token budgeting, serialization)

Phase 4: Model Provider (depends on Model Abstraction)
├── NVIDIA Adapter (auth, HTTP, retry, rate-limit, validation)
├── Prompt Definitions (versioned: structural.v1, semantic.v1, security.v1, critic.v1)
└── Schema Validation (Zod schemas for ModelResponse)

Phase 5: Review Engine (depends on Intelligence + Model)
├── Structural Reviewer
├── Semantic Reviewer
├── Security Reviewer
├── Critic
├── Deduplication
└── Ranking

Phase 6: Application Layer (depends on Review Engine)
├── ReviewUseCase (orchestrates full pipeline)
├── Progress Streaming
├── Error Mapping
└── Cancellation Handling

Phase 7: Terminal Presentation (depends on Application Layer)
├── InteractiveRenderer (TUI workspace, navigator, source view, details)
├── HumanRenderer (plain text)
├── JsonRenderer
├── SarifRenderer
├── Keyboard Handling
└── Progress Streaming UI

Phase 8: CLI Integration & Polish
├── Command Routing (octate review, --staged, --json, --sarif, --quiet)
├── Exit Codes
├── Configuration (octate.yaml, precedence)
├── Doctor Command
└── Evaluation Fixtures (golden reviews, regression suite)
```

**Critical path:** Repository → Analysis → Intelligence → Model Provider → Review Engine → Application → Presentation. No shortcuts — each layer's domain concepts must be stable before the next layer consumes them.

---

## Sources

- **Primary:** Octate CONTEXT.md (§1–§130) — Complete architectural specification with layered architecture, component boundaries, data flows, patterns, and anti-patterns
- **Primary:** Octate PROJECT.md — Validated requirements mapping to architectural layers
- **Context7:** Tree-sitter documentation for generalized parser layer patterns
- **Context7:** Ink documentation for TUI renderer patterns (implementation detail only)
- **Context7:** NVIDIA API documentation for provider integration patterns
- **Industry Reference:** Cubic architecture (repository intelligence + context assembly + ensemble review)
- **Industry Reference:** CodeRabbit Codegraph (deterministic dependency map per change)
- **Industry Reference:** SARIF specification for output format compliance
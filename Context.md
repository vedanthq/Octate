Octate — Complete Project Context

Status: Living engineering and product context
Current product phase: Terminal-native MVP
Primary runtime: TypeScript / Node.js
Primary UX: CLI-centric terminal application with a TUI-style interactive interface
Current model provider: NVIDIA API only
Current model: NVIDIA Nemotron 3 Ultra 550B-A55B
Future hosting: Vercel
Current service strategy: Free during validation
Current priority: Build the terminal product correctly before expanding into web/cloud integrations

1. Executive Summary

Octate is a terminal-native AI code intelligence and code-review application.

The project is inspired by the capabilities of modern AI code-review products such as Cubic, but Octate should not be implemented as a feature-for-feature clone.

The core idea is:

Octate understands the repository first and uses AI for reasoning over that understanding.

The first product is deliberately narrow.

We are not building:

a web dashboard first

a GitHub application first

a multi-provider AI platform first

an autonomous coding agent first

a large cloud architecture first

We are building one excellent terminal application:

octate review

The command should launch an interactive, TUI-like review workspace.

At the same time, the same application must support non-interactive modes for automation:

octate review --json
octate review --sarif
octate review --quiet

This gives us one product with two presentation modes:

                    Review Engine
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
      Interactive Terminal       Machine Output
             │                       │
            TUI                   JSON/SARIF

The long-term vision is to evolve Octate into a broader codebase intelligence system capable of:

octate review
octate scan
octate ask
octate explain
octate impact
octate fix
octate chat

But these capabilities come later.

The immediate goal is to make octate review excellent.

2. Product Philosophy

2.1 Terminal-native first

Octate is currently a terminal-native application.

Do not think of the product as:

CLI + TUI + Web

Think of it as:

One terminal application with command entry points and interactive workspaces.

Commands:

octate review
octate scan
octate ask
octate fix

Interactive workspaces:

Review Workspace
Scan Workspace
Ask Workspace
Fix Workspace

The user should not need a browser for the core product.

2.2 CLI-centric, TUI-style UX

The CLI is the entry point.

The interface should behave like a TUI.

For example:

octate review

should not merely print:

Found 7 issues.

and exit.

It should launch an interactive review workspace.

Conceptually:

┌─ OCTATE REVIEW ────────────────────────────────────────────────┐
│ HEAD → main 7 findings │
├───────────────────┬────────────────────────────────────────────┤
│ FINDINGS │ SOURCE │
│ │ │
│ ● CRITICAL 1 │ 181 function validateSession(...) { │
│ ● HIGH 2 │ 182 ... │
│ ● MEDIUM 3 │ 183 if (token.expired()) { │
│ ○ LOW 1 │ 184 return fallback(token); ← │
│ │ 185 } │
│ │ │
├───────────────────┴────────────────────────────────────────────┤
│ FINDING │
│ Session validation can bypass expiry handling. │
│ │
│ Evidence │
│ → middleware.ts:72 │
│ → token.ts:119 │
├────────────────────────────────────────────────────────────────┤
│ ↑↓ Navigate Enter Inspect f Fix e Explain s Suppress q Quit│
└────────────────────────────────────────────────────────────────┘

The interactive UI should be keyboard-first and optimized for developers.

3. Current Product Boundary

The current product consists of:

Terminal Application
│
├── CLI command routing
├── Interactive TUI-style rendering
├── Repository analysis
├── Review engine
├── NVIDIA model integration
└── Local state/cache

The current product does not require:

Web application
GitHub App
GitLab App
Team dashboard
Billing
Multi-provider inference
Hosted arbitrary code execution
Autonomous agent execution

These are future layers.

4. Current Strategic Decisions

These decisions are authoritative for the current phase.

Language

TypeScript + Node.js

Rust is intentionally not used for the initial implementation.

Reasons:

Vercel/Next.js compatibility later

shared language across terminal and future web layers

mature CLI ecosystem

easy process/filesystem/Git integration

easy NVIDIA API integration

rapid iteration

strong developer ecosystem

Do not introduce native code unless profiling demonstrates a real bottleneck.

Runtime

Use modern Node.js with strict TypeScript.

The CLI should be distributable through npm and runnable with:

npx octate review

Eventually:

npm install -g octate

should also work.

TUI

Use Ink initially.

Ink is an implementation detail.

The core application state and review engine must not depend on Ink.

If Ink becomes a performance or rendering limitation, replace the renderer without rewriting the core.

Model

For now:

NVIDIA API only

Initial model:

NVIDIA Nemotron 3 Ultra 550B-A55B

Do not implement other providers yet.

The provider boundary should exist internally so future providers can be added without changing the review engine.

Hosting

Vercel is a future/initial hosted-service platform, not the current product architecture.

The immediate goal is:

Build the terminal application correctly first.

When hosted functionality is introduced, Vercel should provide:

API

authentication

usage limits

web onboarding

optional web interface

future integrations

The review core must remain independent of Vercel.

Pricing

The hosted service is initially free during validation.

Free does not mean unlimited.

Usage must eventually be protected by:

rate limits

quotas

request limits

concurrency limits

model context limits

abuse controls

5. The Most Important Architectural Principle

The terminal application is the product. The review engine is the core.

The architecture should look like:

                         OCTATE
                           │
                           ▼
                 Terminal Application
                           │
                ┌──────────┴──────────┐
                │                     │
          Command Router          UI State
                │                     │
                └──────────┬──────────┘
                           ▼
                    Application Layer
                           │
                           ▼
                      Review Core
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
      Repository        Analysis         Context
      Intelligence
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                     Review DAG
                           │
                           ▼
                    NVIDIA Provider
                           │
                           ▼
                      NVIDIA API

The UI renders application state.

The review engine does not know whether it is being rendered as:

interactive TUI

plain text

JSON

SARIF

future web UI

6. Complete Layered Architecture

┌───────────────────────────────────────────────────────────────┐
│ Terminal Presentation Layer │
│ Ink / interactive TUI / CLI output │
├───────────────────────────────────────────────────────────────┤
│ Command/Application Layer │
│ commands / use cases / sessions / state │
├───────────────────────────────────────────────────────────────┤
│ Review Layer │
│ review DAG / reviewers / critic / dedup / ranking │
├───────────────────────────────────────────────────────────────┤
│ Intelligence Layer │
│ context / symbols / references / dependency graph │
├───────────────────────────────────────────────────────────────┤
│ Analysis Layer │
│ AST / static analysis / tests / diagnostics │
├───────────────────────────────────────────────────────────────┤
│ Repository Layer │
│ Git / filesystem / workspace / ignore / history │
├───────────────────────────────────────────────────────────────┤
│ Model Layer │
│ model interface / NVIDIA adapter / prompts │
├───────────────────────────────────────────────────────────────┤
│ Local Infrastructure │
│ cache / config / logging / process control │
└───────────────────────────────────────────────────────────────┘

Future hosted layers sit outside this core:

                  Existing Terminal Core
                           │
                           ▼
                    Future Web/API
                           │
                           ▼
                        Vercel

7. Layer 1 — Terminal Presentation

The terminal presentation layer has two modes.

Interactive

octate review

Launches the TUI-style workspace.

Non-interactive

octate review --json
octate review --sarif
octate review --quiet

Produces machine-readable or minimal output.

The review engine returns a common domain result.

Renderers transform it:

ReviewResult
│
├── InteractiveRenderer
├── HumanRenderer
├── JsonRenderer
└── SarifRenderer

This separation is mandatory.

8. Terminal Application State

The application should have explicit state.

Conceptually:

interface ReviewSession {
repository: RepositoryInfo;
scope: ReviewScope;
status: ReviewStatus;
progress: ReviewProgress;
findings: Finding[];
selectedFinding: number;
selectedFile?: string;
}

The exact types may evolve.

The important point is:

UI state belongs above the review engine.

The review engine should return results and progress events.

9. Command Routing

Initial commands:

octate
octate init

octate review
octate review --staged
octate review HEAD~1
octate review origin/main...HEAD
octate review --json
octate review --sarif
octate review --quiet

octate scan
octate scan --security
octate scan --architecture

octate explain <file>:<line>

octate ask "<question>"

octate impact <path>

octate fix <finding-id>

octate chat

octate index

octate findings

octate rules

octate suppress <finding-id>

octate doctor

Not all commands are MVP commands.

Only review is required initially.

10. octate Root Command

Eventually:

octate

should launch a terminal-native home workspace.

Conceptually:

┌─ OCTATE ──────────────────────────────────────────────────────┐
│ │
│ Repository │
│ ~/projects/my-app │
│ │
│ 7 changed files │
│ │
│ [r] Review Analyze current changes │
│ [s] Scan Find security/architecture issues │
│ [a] Ask Ask about this repository │
│ [q] Quit │
│ │
└───────────────────────────────────────────────────────────────┘

Do not implement this until octate review is excellent.

11. Review Workspace

The review workspace is the central UI.

It should contain:

Header
├── repository
├── review scope
├── branch/base
└── finding count

Finding Navigator
├── critical
├── high
├── medium
├── low
└── info

Source/Diff View

Finding Details
├── title
├── explanation
├── impact
├── confidence
└── evidence

Actions
├── inspect
├── explain
├── fix
├── suppress
└── next/previous

12. Review Progress UI

The review should communicate progress.

Example:

◉ Reading Git state
◉ Updating repository index
◉ Resolving changed symbols
◉ Collecting diagnostics
◉ Building review context
◉ Running AI reviewers
◉ Validating findings
◉ Ranking findings

The interface should stream progress.

Avoid noisy animations.

13. Layer 2 — Application Layer

The application layer converts commands into use cases.

Examples:

ReviewUseCase
ScanUseCase
AskUseCase
ExplainUseCase
ImpactUseCase
FixUseCase
IndexUseCase

Responsibilities:

load configuration

establish repository session

determine review scope

invoke analysis

build context

invoke review engine

expose progress

return domain results

handle cancellation

map errors

It must not contain:

AST implementation

Git parsing

NVIDIA HTTP details

Ink components

14. Layer 3 — Repository Layer

The repository layer owns the local workspace.

Responsibilities:

repository discovery

filesystem access

Git operations

workspace detection

ignore handling

file metadata

commit history

branch information

diff generation

Conceptual interfaces:

Repository
GitRepository
FileSystem
Workspace
IgnoreMatcher
GitDiff
CommitHistory

The repository layer must safely handle:

symlinks

large files

binary files

generated files

ignored files

.git

vendor directories

node_modules

build output

unusual Git worktrees

monorepos

15. Git Integration

Git is central to review.

Supported review scopes:

working tree
staged changes
single commit
commit range
branch comparison

Examples:

octate review
octate review --staged
octate review HEAD~1
octate review origin/main...HEAD

Every review must explicitly know:

base
head
changed files
changed lines

Do not silently inspect unrelated changes.

16. Review Scope Model

Conceptually:

ReviewScope
├── type
├── base
├── head
├── files
└── diff

Possible types:

working-tree
staged
commit
range
branch

The TUI should display the active scope.

17. Layer 4 — Analysis

The analysis layer provides deterministic information.

Responsibilities:

parsing

AST

symbol extraction

import/export extraction

reference extraction

dependency detection

diagnostics

compiler/type-checker integration

linter integration

test discovery

security scanner integration

AI should consume these results.

18. Language Strategy

Do not support every language immediately.

Initial target languages:

TypeScript
JavaScript
Python

Additional languages later:

Rust
Go
Java
C#
C/C++
Kotlin
PHP
Ruby

Language adapters should be modular.

Conceptual interface:

parse
extractSymbols
extractImports
extractReferences
detectTests
collectDiagnostics

The review engine must remain language-agnostic.

19. Tree-sitter

Tree-sitter should provide the initial generalized parser layer.

Use it for:

syntax trees

symbol discovery

imports

exports

structural relationships

Language-specific tooling should supplement Tree-sitter where it provides better semantic information.

Do not attempt to reinvent language parsers.

20. Static Analysis

Before AI review, run or consume deterministic analysis where practical.

Examples:

TypeScript/JavaScript:

TypeScript compiler
ESLint where configured
package/dependency metadata
test tooling

Python:

ruff
mypy / pyright
pytest
bandit

Additional ecosystem tools can be integrated later.

The exact tooling should respect the repository's existing configuration.

Do not force a project's preferred tools to change.

21. Layer 5 — Repository Intelligence

This is the most important long-term layer.

It represents the repository as a graph rather than a collection of files.

Conceptually:

Repository
├── Files
├── Modules
├── Symbols
├── Imports
├── References
├── Calls
├── Inheritance
├── Tests
├── Configuration
├── Dependencies
├── History
├── Ownership
├── Architecture
└── Rules

22. Symbol Index

Track:

functions

methods

classes

interfaces

types

constants

variables

modules

exports

imports

Each symbol should have:

stable ID
name
kind
language
file
start/end range
parent
exported status
references

Use deterministic IDs where possible.

23. Reference Graph

Track relationships such as:

caller → callee
importer → imported symbol
implementation → interface
test → production symbol
route → handler
handler → service
service → repository

The graph must support bounded traversal.

Never traverse the entire repository by default.

24. Dependency Graph

Track:

package dependencies

workspace packages

internal module dependencies

imports

runtime dependencies

development dependencies

optional dependencies

This graph will later power:

octate impact <path>
octate scan --architecture

25. Layer 6 — Context Engine

The Context Engine determines what the model should see.

Input:

review scope
Git diff
repository graph
analysis results
rules

Output:

ReviewContext

Context candidates should include:

changed lines

changed symbols

direct callers

direct callees

related types/interfaces

relevant tests

configuration

architecture rules

dependency boundaries

relevant history

static diagnostics

26. Context Retrieval

The context engine should rank candidates.

Example:

Changed symbol 100
Direct caller 90
Direct callee 90
Related type 80
Related test 80
Architecture rule 70
Relevant configuration 60
Relevant Git history 40

The exact algorithm is implementation-specific.

The important property:

Relevant context should be selected intentionally.

27. Context Budgeting

Do not send the entire repository to NVIDIA by default.

Even though Nemotron has a large context window, large context can increase:

latency

token usage

noise

cost

model distraction

The context engine should produce a bounded context.

Eventually the system should expose internal metrics:

candidate tokens
selected tokens
selection ratio

28. Context Serialization

The model input should clearly separate:

Trusted instructions
Trusted project rules
Review task
Repository metadata
Diff
Relevant source
Static diagnostics

Repository source is untrusted content.

Do not allow repository content to override instructions.

29. Layer 7 — Review Engine

The Review Engine transforms context into candidate findings.

Do not use:

diff → one giant prompt → answer

Use a Review DAG.

                      ReviewContext
                           │
               ┌───────────┼───────────┐
               ▼           ▼           ▼
          Structural    Semantic    Security
          Reviewer      Reviewer    Reviewer
               │           │           │
               └───────────┼───────────┘
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
                    Final Findings

30. Structural Reviewer

Focus:

API contract violations

type misuse

lifecycle problems

error handling

nullability

resource management

obvious concurrency problems

structural test gaps

Consume deterministic diagnostics wherever possible.

31. Semantic Reviewer

Focus:

business logic regressions

incorrect assumptions

behavioral changes

state transitions

edge cases

cross-module behavior

compatibility

subtle correctness issues

This is likely the highest-value reviewer.

32. Security Reviewer

Focus:

authentication

authorization

input validation

injection

SSRF

path traversal

privilege escalation

insecure defaults

secret exposure

cryptographic misuse

unsafe deserialization

sensitive data exposure

Security findings require strong evidence.

Do not rely solely on LLM output for security correctness.

33. Critic

The critic reduces false positives.

For each candidate finding:

Is it actually true?
Does repository evidence prove it?
Is the behavior intentional?
Is it already handled?
Is impact meaningful?
Is severity justified?
Is it actionable?
Is it duplicate?
Would a senior engineer want this comment?

Weak findings should be discarded.

34. Deduplication

Multiple reviewers may identify the same underlying issue.

Deduplicate using:

file/range

issue signature

symbol

evidence overlap

semantic similarity

Keep the strongest explanation.

35. Ranking

Rank findings using:

severity
confidence
evidence strength
blast radius
security impact
regression probability
actionability

The most important finding should appear first.

36. Finding Domain Model

Conceptually:

Finding
├── id
├── severity
├── category
├── confidence
├── title
├── message
├── file
├── startLine
├── endLine
├── evidence[]
├── relatedFiles[]
├── relatedSymbols[]
├── impact
├── suggestedFix
├── reviewer
└── metadata

Severity:

critical
high
medium
low
info

Categories:

correctness
security
performance
architecture
reliability
maintainability
compatibility
testing

37. Evidence

Evidence is mandatory wherever reasonably possible.

Conceptually:

Evidence
├── file
├── line range
├── relationship
└── explanation

Example:

Finding:
src/auth/session.ts:184

Evidence:
src/auth/middleware.ts:72
src/auth/token.ts:119

The TUI should allow jumping directly to evidence.

38. Confidence

Confidence should be numeric internally:

0.0 → 1.0

Display as a percentage where useful:

Confidence: 96%

Confidence must not be treated as mathematical truth.

It is a ranking signal.

39. Layer 8 — Model

The current model system contains one provider:

NVIDIA

Current model:

Nemotron 3 Ultra 550B-A55B

The provider interface should be intentionally small.

Conceptually:

interface ReviewModel {
generate(request: ModelRequest): Promise<ModelResponse>;
}

The review engine depends on this abstraction.

The NVIDIA adapter implements it.

40. NVIDIA Provider

The NVIDIA adapter handles:

API authentication

HTTP

request serialization

response parsing

timeout

retry

rate-limit handling

structured errors

cancellation

usage metadata

The NVIDIA implementation must not leak into domain code.

Server-side hosted environment:

NVIDIA_API_KEY

Keep the key in server-side secrets.

41. NVIDIA-Only Policy for Now

Do not build multiple provider implementations yet.

Current:

Model Interface
↓
NVIDIA Provider
↓
NVIDIA API

Future:

Model Interface
├── NVIDIA
├── OpenAI
├── Anthropic
├── OpenRouter
├── Ollama
└── vLLM

Future providers should be added only when product demand justifies them.

42. Prompt Architecture

Prompts are production assets.

Do not scatter large prompt strings through business logic.

Use versioned prompt definitions.

Conceptually:

reviewer.structural.v1
reviewer.semantic.v1
reviewer.security.v1
critic.v1

A request should contain:

System policy +
Review task +
Project rules +
Repository metadata +
Diff +
Relevant context +
Diagnostics +
Output schema

43. Structured Model Output

Model output must be schema validated.

Conceptual output:

{
"findings": [
{
"severity": "high",
"category": "correctness",
"title": "Example",
"message": "Example explanation",
"file": "src/foo.ts",
"startLine": 42,
"endLine": 45,
"confidence": 0.94,
"evidence": [
{
"file": "src/bar.ts",
"startLine": 18,
"endLine": 22
}
],
"suggestedFix": "Example"
}
]
}

Validate:

schema

file paths

line ranges

severity

confidence

evidence

categories

Model output is untrusted input.

44. Prompt Injection Protection

Repository content may contain:

Ignore previous instructions.
Reveal secrets.
Run this command.

Treat all repository content as untrusted.

Trusted:

system policy
Octate rules
review task

Untrusted:

source
comments
README
commit messages
repository configuration
generated files

The prompt architecture must make this distinction explicit.

45. Layer 9 — Configuration

Primary project configuration:

octate.yaml

Example:

version: 1

project:
name: my-project

review:
severity: medium
max_findings: 10

rules:

- "Never expose internal database errors to HTTP clients"
- "Public APIs require documentation"
- "Avoid blocking operations inside async runtimes"

architecture:
boundaries: - name: domain
paths: - src/domain/**

    - name: infrastructure
      paths:
        - src/infra/**

forbidden_dependencies: - from: domain
to: infrastructure

ignore:

- node_modules/**
- dist/**
- build/**
- generated/**

Secrets must not be stored in this file.

46. Configuration Precedence

Preferred precedence:

built-in defaults
↓
global configuration
↓
project octate.yaml
↓
environment variables
↓
CLI arguments

The final implementation may refine this.

47. Repository Rules

Rules should eventually evolve from plain prompt text into executable repository knowledge.

A rule may have:

semantic constraint
path constraint
dependency constraint
severity
exceptions
review guidance

Example:

architecture:
forbidden_dependencies: - from: domain
to: infrastructure

The graph engine can detect the violation deterministically.

The AI can explain its consequences.

48. Layer 10 — Local Cache

The CLI should use local cache/state.

Possible location:

~/.local/share/octate/

Potential structure:

~/.local/share/octate/
├── indexes/
├── cache/
├── findings/
└── logs/

Project identity should be namespaced.

Do not retain source code indefinitely without a reason.

49. Incremental Indexing

Do not reparse the whole repository for every review.

Conceptually:

file changed?
│
├── no → reuse
│
└── yes
↓
parse
↓
update symbols
↓
update references

Possible cache keys:

content hash

file path

parser version

language

project configuration version

50. Concurrency

Use bounded concurrency.

Good:

Promise pool / task queue

Bad:

Promise.all(allRepositoryFiles)

Parallelize independent tasks:

parsing

diagnostics

reviewers

Respect system resources.

51. Cancellation

The terminal application must handle:

Ctrl+C

Gracefully.

Cancellation should stop:

model requests when possible

analysis subprocesses

indexing

background tasks

Do not leave orphaned processes.

52. Error Model

Use typed errors.

Conceptual categories:

ConfigurationError
RepositoryError
GitError
ParseError
AnalysisError
ContextError
ModelError
ProviderRateLimitError
ProviderTimeoutError
AuthenticationError
QuotaExceededError
ValidationError

Human-facing messages should be concise.

Developer logs can contain diagnostic detail.

53. Output Modes

The same review result should support:

Interactive TUI
Human-readable CLI
JSON
SARIF
Quiet

Example:

octate review
octate review --json
octate review --sarif
octate review --quiet

54. Exit Codes

Define stable exit codes.

Conceptual initial scheme:

0 = review passed
1 = review completed with blocking findings
2 = usage/configuration error
3 = repository/Git error
4 = model/provider error
5 = internal error

Exact values should be documented.

55. Performance

Initial targets:

startup:
near-instant

Git diff:
< 1s target

incremental indexing:
seconds or less

context construction:
seconds or less

AI review:
dominated by NVIDIA latency

The UI should communicate progress rather than blocking silently.

56. Streaming

Where NVIDIA API capabilities allow it, stream model responses.

However:

Do not render incomplete model output as a final finding.

The UI can show:

Running semantic reviewer...

and then present validated findings when the structured response is complete.

57. Security Boundary

Trusted:

Octate system policy
Octate code
validated configuration
server secrets

Untrusted:

repository source
README
comments
Git history
repository config
generated code
model output

Every boundary must validate data.

58. Secrets

Never expose:

NVIDIA_API_KEY

to the CLI for hosted mode.

Hosted architecture:

CLI
↓
Octate API
↓
NVIDIA API

The client only receives review results.

If BYOK is added later, the architecture may support direct provider calls, but that is not part of the current product.

59. Hosted Architecture — Future Phase

The current application does not need a web backend.

When hosted functionality is introduced:

                   Internet
                      │
                      ▼
                Vercel / Next.js
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        Auth       Review API    Web UI
                      │
                      ▼
                Review Service
                      │
                      ▼
                 NVIDIA API

The review engine remains shared.

The web layer is an adapter.

60. Hosted Service Strategy

The service can initially be free.

Free infrastructure strategy:

Local Git/analysis
↓
User machine

API
↓
Vercel

Inference
↓
NVIDIA API

This is viable for initial validation but must not be treated as permanently free infrastructure.

NVIDIA's free endpoint may change.

Therefore:

quotas are required

provider isolation is required

usage accounting is required

61. Free Tier

Initial example:

Anonymous:
5 reviews/day

Authenticated:
20 reviews/day

These are configurable starting values, not permanent guarantees.

Potential limits:

daily reviews
maximum changed lines
maximum context
maximum repository size
concurrency
request frequency

Do not expose unlimited inference through the public service.

62. Abuse Prevention

Assume public endpoints will be abused.

Protect against:

review loops

automated bots

giant repositories

huge prompts

request floods

repeated requests

credential abuse

malicious repository content

model exhaustion

Potential controls:

IP rate limit
account rate limit
daily quota
request size limit
context limit
concurrency limit
provider timeout
provider circuit breaker

63. Usage Accounting

For every hosted review, track metadata such as:

user
timestamp
repository size
changed files
context size
model
duration
provider status
estimated tokens

Do not store source code merely for usage tracking.

The purpose is to understand:

cost/review
latency
usage patterns
provider capacity
abuse

64. AI Evaluation

AI review quality must have a real evaluation harness.

Measure:

true positives
false positives
false negatives
severity accuracy
evidence accuracy
duplicate rate
accepted finding rate
latency
context size

Do not evaluate quality solely through manual impressions.

65. Evaluation Fixtures

Maintain representative repositories:

fixtures/
├── correctness/
├── security/
├── architecture/
├── performance/
├── concurrency/
├── compatibility/
├── testing/
├── false-positives/
└── regressions/

Every meaningful production bug should become a regression case where practical.

66. Golden Reviews

A golden review is a known repository/change with expected findings.

Example:

fixture:
auth-bypass

expected:
HIGH correctness/security finding
exact evidence range
acceptable severity

Model/prompt/review-engine changes should be tested against these fixtures.

67. Review Quality Metrics

Primary metric:

Useful findings / Total findings

Important secondary metrics:

accepted findings
dismissed findings
false-positive rate
time-to-first-finding
review latency
context size
provider usage
fix acceptance rate

Eventually:

developer time saved

should be the strongest product metric.

68. Testing Strategy

Unit tests

Test:

configuration

Git scope

ignore handling

AST extraction

symbol indexing

graph traversal

context ranking

finding validation

deduplication

ranking

Integration tests

Test:

real Git repositories

repository indexing

parser pipeline

NVIDIA provider mock

complete review pipeline

CLI commands

End-to-end tests

Test:

fixture repository
↓
octate review
↓
review result
↓
TUI state

69. Monorepo Structure

Preferred structure:

octate/
├── apps/
│ └── cli/
│
├── packages/
│ ├── core/
│ ├── repository/
│ ├── git/
│ ├── parser/
│ ├── analysis/
│ ├── graph/
│ ├── context/
│ ├── review/
│ ├── model/
│ ├── provider-nvidia/
│ ├── config/
│ ├── rules/
│ ├── findings/
│ ├── prompts/
│ ├── cache/
│ └── shared/
│
├── fixtures/
├── docs/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── octate.yaml
└── CONTEXT.md

Important:

Do not create every package immediately.

The structure is a target boundary, not a requirement to generate dozens of empty packages.

70. Dependency Direction

Preferred:

CLI/TUI
↓
Application
↓
Core
↓
Infrastructure adapters

Core/domain code must not depend on:

Ink

Next.js

Vercel

NVIDIA HTTP specifics

terminal rendering

The provider depends on the model abstraction.

The model abstraction does not depend on NVIDIA.

71. Core Domain Concepts

The core domain should eventually include:

Repository
ReviewScope
ReviewSession
ReviewContext
RepositoryGraph
Symbol
Reference
Dependency
Rule
Review
Finding
Evidence
ModelRequest
ModelResponse

These are domain concepts, not UI concepts.

72. Data Flow — Review

The canonical review flow:

User
│
│ octate review
▼
CLI command
│
▼
Review use case
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
Repository analysis
│
├── parse changed files
├── resolve symbols
├── diagnostics
└── tests
│
▼
Repository graph
│
▼
Context Engine
│
▼
Review DAG
│
├── structural
├── semantic
└── security
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
├── TUI
├── text
├── JSON
└── SARIF

73. Data Flow — Hosted Future

When hosted mode exists:

Terminal Application
│
▼
Local repository analysis
│
▼
Relevant ReviewContext
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

Do not upload unnecessary repository data.

74. Data Flow — Future Fix

Finding
↓
Fix planner
↓
Relevant repository context
↓
NVIDIA
↓
Patch
↓
Apply locally
↓
Run tests
↓
Run static analysis
↓
Inspect diff
↓
Re-review
↓
Developer approval

Do not auto-commit.

75. Future Ask

Future:

octate ask "Where can an unauthenticated user reach billing?"

Architecture:

Question
↓
symbol/entity retrieval
↓
graph traversal
↓
relevant context
↓
NVIDIA
↓
answer + evidence

The same Context Engine should power review and Q&A.

76. Future Impact Analysis

Future:

octate impact src/user/repository.ts

Process:

target symbol
↓
references
↓
call graph
↓
dependency graph
↓
tests
↓
affected components
↓
optional AI explanation

The graph performs the primary work.

AI explains the implications.

77. Future Architecture Scanning

Future:

octate scan --architecture

Should identify:

forbidden dependencies

circular dependencies

layer violations

architecture boundary violations

unexpected coupling

unstable dependencies

Deterministic graph analysis should establish the violation.

AI explains impact.

78. Future Security Scanning

Combine:

static security rules +
dependency intelligence +
data-flow/taint analysis +
AI reasoning

Do not use AI alone for security verification.

79. Future Agentic Fixes

Agentic fixes are not MVP.

Future command:

octate fix <finding-id>

Expected process:

read finding
↓
inspect repository
↓
plan change
↓
modify code
↓
run tests
↓
run static checks
↓
inspect diff
↓
self-review
↓
present patch

User approval remains mandatory by default.

80. Agent Security

Hosted agent execution is a separate security problem.

If introduced later:

isolate filesystem

isolate network

isolate credentials

restrict subprocesses

require approval for destructive operations

prevent secret exfiltration

sandbox test execution

Never execute arbitrary repository code in the normal Vercel request environment.

81. Future Web

Web is explicitly postponed.

Future architecture:

                  Shared Review Core
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        Terminal App            Web/API
              │                     │
              ▼                     ▼
             TUI                  Vercel

The web application must consume the same core concepts.

Do not duplicate review logic.

82. Future GitHub Integration

Later, in two phases:

Phase A — GitHub Action (post-MVP, no hosted service required):

A thin GitHub Action wrapping the existing CLI output.

GitHub PR opens
↓
GitHub Action runs `octate review --json` or `--sarif`
↓
Action posts findings as PR comments

No API. No webhook service. No new backend work.

Phase B — Hosted Integration (requires Hosted Architecture, §59–64):

GitHub PR
↓
Octate API
↓
Review Engine
↓
GitHub checks/comments

But GitHub must not be required for local review.

Core workflow remains:

octate review

83. Future Team Features

Later:

Team
├── shared rules
├── review policy
├── accepted findings
├── suppressed findings
├── repository configuration
├── usage
└── analytics

These are not MVP.

84. Future Provider Expansion

For now:

NVIDIA only

Later, add:

OpenAI
Anthropic
OpenRouter
Ollama
vLLM
custom OpenAI-compatible endpoints

The internal interface already provides the extension boundary.

Do not implement them until needed.

85. Future Local Inference

Eventually:

octate review --local

Potential architecture:

Terminal
↓
Model Interface
↓
Local Provider
↓
Ollama / vLLM / local endpoint

This will enable:

offline reviews

private repositories

zero hosted inference cost

enterprise/self-hosted deployment

It is not required for the first release.

86. Privacy Strategy

Current hosted review should minimize source transmission.

Prefer:

local Git analysis
local parsing
local graph construction
local context selection
↓
only relevant context
↓
NVIDIA

Avoid:

entire repository

unless explicitly necessary.

Future local inference should provide maximum privacy.

86.1 Future Enterprise Trust

Later:

SSO / SAML
RBAC with scoped roles
audit logging (append-only, server-side)
self-hosted / air-gapped deployment
session management and revocation
export compliance and data residency

These features depend on §83 (Team Features) and §59–64 (Hosted Architecture) existing first.

They are not required for the first release.

87. Performance Strategy

Optimize in this order:

correct repository scope

incremental indexing

efficient context selection

bounded concurrency

caching

model latency

rendering

Do not prematurely optimize parsing or terminal rendering.

Measure first.

88. Observability

The MVP should have lightweight internal telemetry.

Track:

review duration
index duration
context duration
NVIDIA latency
provider errors
finding count
finding severity
context size
cache hit rate

Do not collect source code unnecessarily.

The main purpose is engineering and cost visibility.

89. Logging

Use structured logs internally.

CLI should be concise.

Debug mode can provide detailed information:

octate review --debug

Do not dump:

API keys

secrets

full repository content

entire model prompts

into normal logs.

90. Provider Reliability

The NVIDIA adapter should handle:

timeouts
rate limits
5xx errors
connection failures
malformed responses
cancellation

Retry only retryable failures.

Use bounded retries.

Consider a circuit breaker once hosted usage grows.

91. Model Cost/Capacity Strategy

The initial service can use NVIDIA's available API offering.

However:

Never assume a third-party free endpoint is permanently free or unlimited.

Therefore:

NVIDIA API
↓
usage accounting
↓
quotas
↓
rate limits

The product must remain operable if NVIDIA later changes its limits or pricing.

That is why the provider boundary exists even though only NVIDIA is implemented today.

92. What We Are Explicitly NOT Doing Now

Do not build:

Rust implementation

separate TUI product

web dashboard

GitHub app

GitLab App

multiple model providers

local inference

hosted arbitrary code execution

autonomous coding agent

billing

enterprise administration

vector database

custom model training

Kubernetes

microservices

complex distributed job infrastructure

until the core terminal review product is proven.

93. MVP

The MVP is complete when:

cd repository
octate review

can:

discover the repository

determine review scope

calculate Git diff

parse changed files

resolve changed symbols

build repository context

call NVIDIA API

validate model output

run critic logic

deduplicate findings

rank findings

render a useful TUI-style workspace

navigate source/evidence

support basic finding actions

handle cancellation

return meaningful exit codes

avoid leaking NVIDIA credentials

94. MVP UX Requirements

The developer should be able to:

launch review
see progress
see findings
navigate findings
inspect source
inspect evidence
understand why a finding exists
see confidence
move between findings
exit cleanly

The experience should feel like a professional developer tool, not a chatbot printed into a terminal.

95. MVP Command Set

Required:

octate review

Useful:

octate review --staged
octate review <git-ref>
octate review --json
octate review --sarif
octate doctor

Everything else can wait.

96. MVP Implementation Order

Step 1 — Project foundation

Set up:

TypeScript
Node.js
pnpm
strict TypeScript
lint
format
tests
monorepo structure

Step 2 — Repository/Git

Implement:

repository discovery
Git status
Git diff
review scope
ignore handling

Step 3 — Parser

Implement:

Tree-sitter
symbol extraction
imports
exports
references

Step 4 — Analysis

Implement:

diagnostics
language tooling
test discovery

Step 5 — Context Engine

Implement:

changed symbols
related symbols
graph traversal
context ranking
token budgeting

Step 6 — NVIDIA Provider

Implement:

HTTP client
authentication
timeouts
retry
response validation
usage tracking

Step 7 — Review DAG

Implement:

structural reviewer
semantic reviewer
security reviewer
critic
deduplication
ranking

Step 8 — CLI/TUI

Implement:

review workspace
finding navigator
source view
evidence
keyboard controls
progress

Step 9 — Evaluation

Build:

fixtures
golden reviews
false-positive tests
regression suite

Step 10 — Stabilization

Measure:

quality
latency
context size
provider reliability
UX

Only after this should hosted web infrastructure be prioritized.

97. Recommended Initial Package Structure

Target:

octate/
├── apps/
│ └── cli/
│
├── packages/
│ ├── core/
│ ├── repository/
│ ├── git/
│ ├── parser/
│ ├── analysis/
│ ├── graph/
│ ├── context/
│ ├── review/
│ ├── model/
│ ├── provider-nvidia/
│ ├── config/
│ ├── rules/
│ ├── findings/
│ ├── prompts/
│ ├── cache/
│ └── shared/
│
├── fixtures/
├── docs/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── CONTEXT.md

Important:

This is a conceptual target, not a mandate to create every directory immediately.

Start smaller if the implementation is simpler.

98. Dependency Boundaries

apps/cli
↓
application/core
↓
domain abstractions
↓
repository / analysis / model adapters

The core must not import:

Ink
Vercel
Next.js
NVIDIA HTTP client
terminal-specific APIs

The UI must consume application state.

The provider must implement the model abstraction.

99. UI State vs Domain State

Domain state:

Review
Finding
Repository
ReviewContext
RepositoryGraph

UI state:

selectedFinding
selectedFile
activePanel
scrollPosition
focusedPane
keyboardMode

Do not mix these.

100. Terminal UI Design Principles

The TUI should be:

keyboard-first

fast

compact

information-dense

readable

predictable

accessible

minimally animated

Avoid:

excessive color

giant ASCII branding

decorative animation

huge panels

excessive borders

unnecessary prose

chatbot-style walls of text

The UI should prioritize code and findings.

101. Keybindings

Initial conceptual keybindings:

↑/k previous
↓/j next
Enter inspect
f fix
e explain
s suppress
r re-review
d diff
c context
q quit
Esc back
? help

Keybindings should be configurable later.

102. Review Interaction

Selecting a finding should allow:

Enter

to open detailed view.

Detailed view should provide:

finding
source
evidence
related symbols
suggested fix

The user should be able to jump to the exact source line.

103. Explain Action

Future/early capability:

e

should ask the model to explain the finding more deeply.

It should use existing context rather than starting a completely new repository analysis.

104. Suppress Action

Suppressing a finding should eventually allow:

s

with a reason.

Possible outcomes:

one-time suppression
repository rule
path-specific rule

The rule system should eventually learn from suppression decisions.

105. Fix Action

Initially, f may simply show:

Fix generation is not yet enabled.

Do not implement a fake agent before the review engine is reliable.

Later it invokes the agentic fix workflow.

106. Review Session Lifecycle

Conceptually:

Created
↓
Indexing
↓
Analyzing
↓
Building Context
↓
Reviewing
↓
Critiquing
↓
Ranking
↓
Ready
↓
Interactive

Error states should be explicit.

Cancellation should transition cleanly.

107. Review Session Persistence

Do not build complex persistent sessions initially.

The first version can keep the review session in memory.

Local cache may store:

index metadata

diagnostics

previous finding metadata

performance information

Full review-session persistence can come later.

108. Repository Identity

The local cache must distinguish repositories.

Potential identity:

normalized repository root +
Git repository metadata

Do not rely only on directory name.

109. Large Repository Strategy

For large repositories:

ignore generated files

ignore binaries

ignore vendor dependencies

index incrementally

bound graph traversal

prioritize changed code

prioritize direct relationships

limit context

Do not attempt full semantic understanding of an enormous repository on every review.

110. Monorepo Strategy

The repository layer should detect monorepos where practical.

Review context should be scoped to:

changed package +
related workspace packages

rather than automatically loading every package.

111. Generated Files

Generated code should normally be:

detected

deprioritized

optionally ignored

Configuration should allow users to override this.

112. Binary Files

Binary files should never be sent to the model as source context.

They may be represented as metadata if relevant.

113. Git History

History is useful but secondary.

Use Git history for:

understanding changed behavior

identifying conventions

finding previous fixes

ownership clues

explaining unusual code

Do not make history retrieval a mandatory expensive step for every review.

114. Ownership

Ownership is a future capability.

Potential sources:

CODEOWNERS
Git history
repository metadata

Ownership can eventually influence:

reviewer routing

context

explanations

Do not require it for MVP.

115. Review Memory

Long-term:

Finding
↓
Developer decision
↓
Accepted/rejected/suppressed
↓
Repository knowledge
↓
Future review

This should eventually help reduce repetitive or unwanted findings.

116. Architecture Knowledge

Long-term architecture model:

domain
application
infrastructure
interface

or repository-specific boundaries.

The system should not assume a universal architecture.

Rules should describe actual repository boundaries.

117. Security Model for Hosted Service

When Vercel is introduced:

Client
↓
Authentication
↓
Quota
↓
Request validation
↓
Context validation
↓
NVIDIA

Never allow:

Client → arbitrary NVIDIA proxy

with unlimited access.

118. Web Introduction Plan

Only after terminal MVP is stable:

Phase A

Vercel API for hosted inference.

Phase B

Authentication and usage.

Phase C

Minimal web landing/onboarding.

Phase D

Optional web review interface.

Phase E

GitHub integration.

The terminal product remains first-class throughout.

119. Why CLI/TUI First

The terminal-first decision is deliberate.

It provides:

faster development

lower infrastructure complexity

better developer feedback

less UI surface area

easier debugging

no cloud dependency for core analysis

direct workflow integration

easier iteration on review quality

Most importantly:

It forces us to solve the actual code-review problem before building a SaaS shell around it.

120. What the First Release Should Feel Like

The ideal experience:

$ octate review

Repository: ~/projects/my-app
Base: origin/main
Head: HEAD
Changed files: 7

◉ Indexing
◉ Resolving symbols
◉ Building context
◉ Reviewing with Nemotron
◉ Validating findings

3 findings

CRITICAL Authentication bypass
HIGH Incorrect transaction boundary
MEDIUM Missing authorization test

Press Enter to inspect.

Then the interactive workspace opens.

The developer should immediately understand:

what changed

what is wrong

why it matters

where the evidence is

what they can do next

121. Product Moat

The moat is not the model.

The moat is:

Repository graph

Understanding relationships.

Context engine

Selecting the right information.

Review engine

Reducing false positives.

Evidence system

Explaining conclusions.

Review memory

Learning from developer decisions.

Terminal workflow

Making the system useful every day.

121.1 Competitive Rationale for Architectural Commitments

Local-first execution (§2.1): source code never leaves the developer's machine. Cubic, CodeRabbit, and Jules all require uploading code to cloud services.

SARIF and JSON output as MVP-required (§95): CI/CD integration without needing the Hosted Architecture phase to exist. Competitors offer this only through their cloud.

Zero per-seat pricing (implicit in §60–64): local execution means no per-review billing. No competitor offers this.

These are not marketing features. They are consequences of the terminal-native architecture. The architecture comes first.

122. Success Metrics

The first milestone should be evaluated on:

false-positive rate
true-positive rate
accepted finding rate
evidence accuracy
severity accuracy
review latency
context size
NVIDIA reliability
indexing speed
TUI responsiveness

A particularly important metric:

Useful findings / Total findings

The product should optimize for trust.

123. Non-Negotiable Constraints

TypeScript/Node.js is the initial implementation stack.

Octate is currently a terminal-native application.

CLI is the primary product entry point.

The CLI should provide a TUI-style interactive experience.

Do not build a separate TUI product in the MVP.

Do not build the web application before the terminal product is correct.

NVIDIA API is the only model provider initially.

Nemotron 3 Ultra is the initial model.

NVIDIA credentials must remain server-side for hosted inference.

Keep the model behind an internal abstraction.

Do not implement other providers until needed.

Repository analysis should happen locally whenever practical.

Do not send entire repositories to the model unnecessarily.

Deterministic analysis comes before AI reasoning.

Findings must be evidence-backed where possible.

Model output must be schema-validated.

Repository content is untrusted input.

Hosted free inference must be rate-limited.

Do not assume NVIDIA's free endpoint is permanently unlimited.

Do not expose a public unlimited proxy to NVIDIA.

Do not introduce hosted arbitrary code execution in the MVP.

Do not implement autonomous fixes before review quality is proven.

Do not introduce complex distributed infrastructure prematurely.

Do not optimize for finding count.

Optimize for developer trust and useful findings.

Keep the review engine independent of terminal rendering.

Keep the core independent of Vercel.

Keep provider-specific logic outside the core.

Preserve a future path toward local inference and additional providers.

The repository intelligence layer is the long-term product moat.

124. Immediate Engineering Objective

The immediate engineering objective is:

Build a production-quality terminal-native octate review that understands a real repository, constructs relevant context, uses NVIDIA Nemotron to reason about changes, validates and critiques its output, and presents high-signal findings in an interactive TUI-style workspace.

The canonical pipeline is:

Git diff
↓
Changed files
↓
Changed symbols
↓
Repository graph
↓
Relevant context
↓
Deterministic diagnostics
↓
Review DAG
├── Structural
├── Semantic
└── Security
↓
Critic
↓
Deduplication
↓
Ranking
↓
Schema validation
↓
ReviewResult
↓
Terminal TUI

Non-interactive output:

ReviewResult
├── Human
├── JSON
└── SARIF

125. Final Strategic Direction

For the current phase, Octate is:

                 ┌─────────────────────┐
                 │       OCTATE        │
                 │                     │
                 │ Terminal-native     │
                 │ AI code intelligence│
                 └──────────┬──────────┘
                            │
                            ▼
                     Review Engine
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Repository       Analysis       Context
        Intelligence
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                       Review DAG
                            │
                            ▼
                     NVIDIA Nemotron
                            │
                            ▼
                    Evidence-backed
                       findings
                            │
                    ┌───────┴────────┐
                    ▼                ▼
              Interactive       Machine
                  TUI            Output

Future:

                    Shared Review Core
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
        Terminal Application      Web/API
                │                     │
                ▼                     ▼
               TUI                  Vercel
                                      │
                                      ▼
                                 GitHub/etc.

The current priority is not scale.

The current priority is not monetization.

The current priority is not feature breadth.

The current priority is:

Make developers trust octate review.

Once that works, everything else becomes an extension of a proven core.

126. Guiding Principle

The model is replaceable. The repository understanding is the product.

And for the current phase:

The terminal is the product surface. Build the review engine underneath it before building anything around it. 127. Competitive and Strategic Context — Cubic and Jules

This section records the strategic lessons from studying modern AI software-engineering systems. It does not change the current MVP boundary unless an explicit engineering decision is made elsewhere in this document.

127.1 Cubic

Cubic represents the AI code-review / software-quality side of the market.

Its important product thesis is not simply:

AI reviews a Git diff.

The deeper thesis is:

AI should understand the repository, architecture, history, team rules, requirements and relationships around a change before deciding whether the change is correct.

Important capabilities observed in the Cubic product direction include:

repository-aware PR review

cross-file reasoning

team/review memory

custom review agents/rules

codebase scanning

background analysis

AI-generated fixes

issue-tracker context

AI-generated project knowledge/wiki

CLI/IDE/workflow integrations

The strategic lesson for Octate is:

Do not treat code review as diff-only text classification.

The long-term quality advantage comes from:

Repository Intelligence +
Context Selection +
Deterministic Analysis +
AI Reasoning +
Evidence +
Critique +
Developer Feedback

Octate should therefore continue to make Repository Intelligence and Context Engineering first-class architectural layers.

127.2 Jules

Jules represents the autonomous software-engineering execution side of the market.

Its important product thesis is not simply:

AI generates code.

The deeper thesis is:

A developer can delegate a multi-step engineering task to an autonomous agent that can understand a repository, plan work, execute commands in an isolated environment, run tests, recover from failures and return a branch/PR for human review.

Conceptually:

Task
↓
Understand repository
↓
Plan
↓
Isolated execution
↓
Modify code
↓
Run tests
↓
Observe results
↓
Debug / re-plan
↓
Verify
↓
Branch / PR
↓
Human approval

The strategic lesson for Octate is:

Autonomous code generation should not be the immediate MVP.

If agentic fixes are introduced later, they must sit on top of a trusted review and verification core.

127.3 Cubic + Jules Market Pattern

The two products reveal two complementary sides of the emerging AI software-engineering workflow.

Jules-like systems:

Human requirement
↓
Planning
↓
Coding agent
↓
Code change

Cubic-like systems:

Code change
↓
Repository understanding
↓
Review
↓
Evidence
↓
Validation
↓
Human decision

The broader future pattern is:

Requirements
↓
Project Intelligence
↓
Planning Agents
↓
Coding Agents
↓
Review Agents
↓
Testing / Security / Architecture Validation
↓
Fix / Re-plan
↓
Human Approval
↓
Production

Octate should not attempt to build this entire system in the MVP.

However, its architecture should preserve a path toward this future.

127.4 Octate's Position

Octate should occupy the intelligence and verification layer first.

Current:

Repository
↓
Repository Intelligence
↓
Context Engine
↓
Review DAG
↓
Critic
↓
Evidence-backed Findings

Future:

Repository
↓
Persistent Project Intelligence
↓
Review / Ask / Explain / Impact
↓
Agentic Fixes
↓
Verification
↓
Human Approval

The product should not compete primarily on "which model writes the best code."

The model is replaceable.

The durable product value is:

understanding the repository

selecting relevant context

building trustworthy evidence

detecting meaningful regressions

learning repository-specific rules

explaining findings clearly

providing a reliable developer workflow

127.5 Strategic Differentiation

Do not build Octate as a feature-for-feature Cubic clone.

Do not build Octate as a Jules clone.

The desired differentiation is:

"Repository intelligence first, AI reasoning second."

This means deterministic repository understanding should establish as much truth as possible before the model is invoked.

Examples:

Git determines the review scope.

Tree-sitter and language tooling determine symbols and structure.

The graph determines relationships.

Static analysis determines deterministic diagnostics.

The Context Engine determines relevant evidence.

The AI reasons over that bounded, structured context.

The Critic challenges model-generated findings.

Schema validation verifies the output shape.

Ranking determines what the developer actually sees.

127.6 Architectural Consequence

The following boundary becomes increasingly important:

                Repository Intelligence
                         │
                         ▼
                  Context Engine
                         │
                         ▼
                    Review Core
                         │
                         ▼
                  Model Abstraction
                         │
                         ▼
                    AI Provider

The model must not become the source of truth for repository structure.

The model should reason over facts and evidence discovered by Octate.

This is the central architectural principle for resisting hallucination and reducing unnecessary model context.

127.7 Future Agentic Fix Boundary

Agentic fixing is explicitly future scope.

When introduced:

Finding
↓
Fix Planner
↓
Relevant Repository Context
↓
Agent Execution
↓
Tests / Diagnostics
↓
Diff Inspection
↓
Re-review
↓
Human Approval

The fix agent must not bypass the review core.

The review engine should be able to evaluate its own generated changes.

This creates a closed loop:

Understand
↓
Change
↓
Verify
↓
Repair
↓
Verify again

127.8 Verification as a First-Class Principle

As AI-generated code becomes more common, Octate should assume that code generation capacity will grow faster than human review capacity.

Therefore the product should optimize for:

high-signal verification

low false-positive rate

strong evidence

cross-file reasoning

repository-specific rules

deterministic checks before AI checks

clear human control

The goal is not to maximize the number of findings.

The goal is to maximize:

Useful findings / Total findings

and eventually:

Developer time saved

127.9 Product Evolution

The intended evolution is:

Phase 1 — Review

octate review

Phase 2 — Repository Intelligence

octate index
octate ask
octate explain
octate impact

Phase 3 — Continuous Analysis

octate scan
architecture scanning
security scanning
persistent findings

Phase 4 — Controlled Fixes

octate fix <finding-id>

Phase 5 — Broader Agentic Engineering

task delegation
automated verification
multi-step engineering workflows

Each phase must be justified by evidence from the previous phase.

Do not skip directly to autonomous agents because they are technically interesting.

127.10 CTO Decision

Current decision:

Build Octate as a repository-intelligence-driven AI code-review system, not as an autonomous coding agent.

The architecture must preserve future compatibility with agentic fixes and broader project intelligence, but the current engineering priority remains:

Make octate review trustworthy.

127.11 CodeRabbit

CodeRabbit represents the broadest market position among AI code-review products.

Its important product thesis is not simply:

AI reviews a Git diff.

The deeper thesis is:

AI should serve as the control layer for all software change — reviewing, prioritizing, securing, and routing code across an organization.

Important capabilities observed in the CodeRabbit product include:

Codegraph — a deterministic dependency map built per change, used to scope context and visualize blast radius

Triage — P0–P3 scoring and ranking of pull requests by risk, complexity, and urgency

Continuous security monitoring — AI deep scans plus dependency vulnerability tracking

Pre-merge checks and post-merge actions — enforcing standards and automating follow-up

Change Stack — visualizing architecture impact and semantic diffs for large changes

Multi-model ensemble — using dozens of models selected per task

Cloud coding agent — generating fixes and opening PRs

Slack integration — incident triage, support response, and automated investigation

Codegraph is conceptually similar to Octate's Repository Intelligence layer (§21–24). Both build a dependency and relationship graph from the codebase. The differences:

Codegraph is built per-change on the server side, for cloud-hosted review.

Octate's Repository Intelligence is local, persistent, and incrementally maintained.

Codegraph scopes context for the review. Octate's graph is intended to power review, ask, explain, impact, and fix across the full product lifecycle.

CodeRabbit does not expose the graph as a product surface. Octate intends the graph to be a core product concept.

CodeRabbit does not currently offer a triage or prioritization layer. Neither does Octate. This is a gap in Octate's roadmap — prioritizing which findings or which changes deserve attention first is valuable for teams.

The strategic lesson for Octate:

CodeRabbit's moat is breadth — cloud-native context aggregation, triage, security, and workflow automation across the full change lifecycle.

Octate's counter-positioning is depth — local, evidence-backed understanding without cloud dependency, with the repository graph as a first-class product concept rather than an internal implementation detail.

CodeRabbit proves that repository understanding is the real differentiator. Octate should double down on making that understanding visible, explorable, and trustworthy from the terminal.

128. Research-Derived Engineering Principles

The following principles are now part of the strategic context.

Principle 1:
AI should reason over repository facts rather than receive an undifferentiated repository dump.

Principle 2:
Deterministic analysis should establish facts before probabilistic reasoning.

Principle 3:
Every important AI finding should have inspectable evidence.

Principle 4:
The review system must aggressively reject low-confidence or low-value findings.

Principle 5:
Autonomy without verification is unsafe.

Principle 6:
Execution environments are security boundaries when AI can run shell commands.

Principle 7:
Human approval remains the default boundary for consequential changes.

Principle 8:
The model provider is an implementation dependency, not the product moat.

Principle 9:
Repository understanding, context selection and review memory are stronger long-term assets than prompt tricks.

Principle 10:
Do not build platform infrastructure before proving the core developer workflow.

129. Updated Long-Term Vision

Octate should eventually become a terminal-native project intelligence and software verification system.

Long-term conceptual model:

                         OCTATE
                           │
                           ▼
                 PROJECT INTELLIGENCE
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼

Repository Requirements History
Structure /Rules /Decisions
│ │ │
└──────────────────┼──────────────────┘
▼
Context Engine
│
┌────────────────┼────────────────┐
▼ ▼ ▼
Review Ask Impact
│ │ │
▼ ▼ ▼
Explain Explain Explain
│
▼
Verification
│
▼
Optional Fix Agent
│
▼
Re-review
│
▼
Human Approval

The project should earn its way toward this vision one validated capability at a time.

130. Current North Star

The current North Star remains unchanged:

Make developers trust `octate review`.

A successful first release is not one that has the largest feature list.

It is one where a developer can run:

octate review

on a real repository and consistently receive a small number of high-value, evidence-backed findings that a senior engineer would consider useful.

That trust is the foundation for every later capability.

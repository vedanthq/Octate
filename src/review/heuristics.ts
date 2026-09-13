/**
 * Deterministic AST diff parsing and heuristic triggers for the Review Engine.
 * Evaluates whether Semantic and Security reviewers should execute without invoking LLMs.
 */

import path from 'node:path';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ModelFinding } from '../model/types.js';

/**
 * Line interval representing a contiguous range of changed lines.
 */
export interface LineInterval {
  start: number;
  end: number;
}

/**
 * Parses unified diff text into line intervals per modified file.
 * Handles unified diff format headers (`+++ b/path/to/file` and `@@ -X,Y +newStart,newLen @@`).
 *
 * @param diff - Unified git diff string
 * @returns Map of normalized file paths to array of line intervals
 */
export function parseDiffRanges(diff: string): Map<string, LineInterval[]> {
  const result = new Map<string, LineInterval[]>();
  if (!diff?.trim()) {
    return result;
  }

  const lines = diff.split('\n');
  let currentFile: string | null = null;

  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const rawPath = line.slice(4).trim();
      if (rawPath === '/dev/null') {
        currentFile = null;
      } else {
        // Strip leading 'a/' or 'b/' prefix from git diff output
        const cleanPath = rawPath.replace(/^[ab]\//, '');
        currentFile = path.normalize(cleanPath);
        if (!result.has(currentFile)) {
          result.set(currentFile, []);
        }
      }
      continue;
    }

    if (currentFile && line.startsWith('@@ ')) {
      // Format: @@ -oldStart,oldLen +newStart,newLen @@
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (match?.[1]) {
        const start = parseInt(match[1], 10);
        const len = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const end = len === 0 ? start : start + len - 1;
        const ranges = result.get(currentFile);
        if (ranges) {
          ranges.push({ start, end });
        }
      }
    }
  }

  return result;
}

const EXECUTABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.mjs',
  '.cjs',
  '.php',
]);

const CONTROL_FLOW_REGEX =
  /\b(if|else|switch|case|for|while|do|try|catch|finally|throw|return|yield|await|async|def|lambda|match)\b/;

/**
 * Determines whether the Semantic Reviewer should be triggered based on modified executable AST logic.
 *
 * @param params - Diff, changed file list, and repository symbol index
 * @returns True if executable function/method logic or control flow was altered
 */
export function shouldTriggerSemanticReviewer(params: {
  diff: string;
  changedFiles: string[];
  symbolIndex: SymbolIndex;
}): boolean {
  const { diff, changedFiles, symbolIndex } = params;

  if (!diff?.trim() || changedFiles.length === 0) {
    return false;
  }

  // Filter to executable source code files
  const codeFiles = changedFiles.filter((f) =>
    EXECUTABLE_EXTENSIONS.has(path.extname(f).toLowerCase())
  );

  if (codeFiles.length === 0) {
    return false;
  }

  const diffRanges = parseDiffRanges(diff);

  // 1. Check if any function or method AST range intersects diff hunks
  for (const file of codeFiles) {
    const normFile = path.normalize(file);
    const ranges = diffRanges.get(normFile);
    if (!ranges || ranges.length === 0) {
      continue;
    }

    const fileSymbols = symbolIndex.getFileSymbols(normFile);
    for (const sym of fileSymbols) {
      if (sym.kind === 'function' || sym.kind === 'method') {
        const symStart = sym.range.startLine;
        const symEnd = sym.range.endLine;
        const intersects = ranges.some((r) => symStart <= r.end && symEnd >= r.start);
        if (intersects) {
          return true;
        }
      }
    }
  }

  // 2. Fallback: inspect added/modified lines for control flow keywords
  const addedLines = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');

  return CONTROL_FLOW_REGEX.test(addedLines);
}

const DEPENDENCY_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'cargo.toml',
  'composer.json',
  'composer.lock',
]);

const SECURITY_PATTERN = new RegExp(
  [
    // Auth & Tokens
    '\\b(auth|authenticate|authorization|jwt|bearer|token|oauth|session|cookie|password|credential|secret|api[_-]?key)\\b',
    // Crypto
    '\\b(crypto|cipher|hash|hmac|encrypt|decrypt|randomBytes|subtle|sha256|sha512|md5|aes|rsa|salt)\\b',
    // Injection & Sinks
    '\\b(exec|spawn|eval|system|child_process|shell|query|sql|raw|dangerouslySetInnerHTML|innerHTML|xpath)\\b',
    // Endpoints & Deserialization
    '\\breq\\.(body|query|params|headers)\\b',
    '\\b(bodyParser|multipart|upload|unserialize|pickle|deserialize)\\b',
    '\\bJSON\\.parse\\b',
    // SSRF & Traversal
    '\\bfetch\\s*\\(',
    '\\baxios\\b',
    '\\bhttps?\\.request\\b',
    '\\bpath\\.(resolve|join)\\b',
    '\\.\\./',
    // Privilege & Roles
    '\\b(admin|role|permission|acl|rbac|sudo|privilege|isAuthorized|isAdmin)\\b',
  ].join('|'),
  'i'
);

/**
 * Splits camelCase, snake_case, or dot-separated identifier into space-separated words.
 */
function splitIdentifier(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1 $2')
    .replace(/[_\-.]/g, ' ');
}

/**
 * Determines whether the Security Reviewer should be triggered based on dependency changes,
 * sensitive patterns, or referenced security symbols.
 *
 * @param params - Diff, changed file list, and repository symbol index
 * @returns True if security-sensitive code or dependencies were touched
 */
export function shouldTriggerSecurityReviewer(params: {
  diff: string;
  changedFiles: string[];
  symbolIndex: SymbolIndex;
}): boolean {
  const { diff, changedFiles, symbolIndex } = params;

  if (changedFiles.length === 0 && !diff?.trim()) {
    return false;
  }

  // 1. Dependency or environment file modifications
  for (const file of changedFiles) {
    const base = path.basename(file).toLowerCase();
    if (DEPENDENCY_FILES.has(base) || base.startsWith('.env')) {
      return true;
    }
  }

  // 2. Diff text keyword analysis
  if (diff && SECURITY_PATTERN.test(diff)) {
    return true;
  }

  // 3. Referenced symbol names in changed files
  for (const file of changedFiles) {
    const normFile = path.normalize(file);
    const symbols = symbolIndex.getFileSymbols(normFile);
    for (const sym of symbols) {
      const splitName = splitIdentifier(sym.name);
      if (SECURITY_PATTERN.test(splitName) || SECURITY_PATTERN.test(sym.name)) {
        return true;
      }
    }
  }

  return false;
}

const INTENT_COMMENT_REGEX =
  /(@deprecated|@ts-ignore|@ts-expect-error|eslint-disable|octate:ignore|#\s*noqa)/i;

/**
 * Helper to escape regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a finding occurs in intentional test/mock harness code or contains deliberate
 * suppression comments.
 *
 * @param params - Finding, optional diff text, and optional repo root
 * @returns True if the finding reflects deliberate intent or test mock code
 */
export function isDeliberateIntentOrMock(params: {
  finding: ModelFinding;
  diff?: string | undefined;
  repoRoot?: string | undefined;
}): boolean {
  const { finding, diff } = params;
  const normFile = path.normalize(finding.file).toLowerCase();

  // 1. Detect test/mock directories and test naming conventions
  if (
    normFile.includes('__tests__') ||
    normFile.includes('tests/mocks') ||
    normFile.includes('__mocks__') ||
    normFile.includes('/mocks/') ||
    normFile.endsWith('.test.ts') ||
    normFile.endsWith('.spec.ts') ||
    normFile.endsWith('.test.js') ||
    normFile.endsWith('.spec.js') ||
    normFile.endsWith('.test.tsx') ||
    normFile.endsWith('.spec.tsx') ||
    normFile.endsWith('_test.py') ||
    path.basename(normFile).startsWith('test_') ||
    normFile.includes('dummy_') ||
    normFile.includes('fixture') ||
    normFile.includes('fixtures')
  ) {
    return true;
  }

  // 2. Detect intent comments in finding text
  if (
    INTENT_COMMENT_REGEX.test(finding.title) ||
    INTENT_COMMENT_REGEX.test(finding.message) ||
    INTENT_COMMENT_REGEX.test(finding.suggestedFix)
  ) {
    return true;
  }

  // 3. Detect intent comments in diff context
  if (diff && INTENT_COMMENT_REGEX.test(diff)) {
    // If diff has file boundaries, search in hunk for this file
    if (diff.includes('+++ ') || diff.includes('diff --git')) {
      const escapedFile = escapeRegex(path.normalize(finding.file));
      const fileSectionRegex = new RegExp(
        `(?:diff --git [^\n]*${escapedFile}|\\+\\+\\+ [ab]?/?${escapedFile})([\\s\\S]*?)(?=(?:diff --git|\\+\\+\\+ [ab]?/?|$))`,
        'i'
      );
      const match = fileSectionRegex.exec(diff);
      if (match?.[1] && INTENT_COMMENT_REGEX.test(match[1])) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
}

const DOC_EXTENSIONS = new Set(['.md', '.markdown', '.rst', '.txt', '.adoc']);

/**
 * Checks whether a file path points to documentation.
 */
export function isDocumentationFile(filePath: string): boolean {
  const norm = path.normalize(filePath).toLowerCase().replace(/\\/g, '/');
  const ext = path.extname(norm);
  const base = path.basename(norm);
  if (DOC_EXTENSIONS.has(ext)) {
    return true;
  }
  if (base === 'license' || base === 'readme' || base === 'changelog' || base === 'notice') {
    return true;
  }
  if (norm.startsWith('docs/') || norm.includes('/docs/')) {
    return true;
  }
  return false;
}

/**
 * Checks whether a file path points to test/spec code or fixtures.
 */
export function isTestFile(filePath: string): boolean {
  const norm = path.normalize(filePath).toLowerCase().replace(/\\/g, '/');
  const base = path.basename(norm);
  if (
    norm.includes('__tests__/') ||
    norm.includes('tests/mocks/') ||
    norm.includes('__mocks__/') ||
    norm.includes('/mocks/') ||
    norm.includes('/fixtures/') ||
    norm.startsWith('test/') ||
    norm.startsWith('tests/') ||
    base.startsWith('test_') ||
    base.endsWith('_test.py') ||
    base.endsWith('.test.ts') ||
    base.endsWith('.spec.ts') ||
    base.endsWith('.test.js') ||
    base.endsWith('.spec.js') ||
    base.endsWith('.test.tsx') ||
    base.endsWith('.spec.tsx')
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a finding points to code ranges directly touched by the diff.
 */
export function isFindingInDiffRanges(
  finding: ModelFinding,
  diffRanges: Map<string, LineInterval[]>
): boolean {
  if (diffRanges.size === 0) return true;
  const normFindingFile = path.normalize(finding.file);

  let targetRanges: LineInterval[] | undefined = diffRanges.get(normFindingFile);
  if (!targetRanges) {
    for (const [diffFile, ranges] of diffRanges.entries()) {
      if (
        normFindingFile.endsWith(diffFile) ||
        diffFile.endsWith(normFindingFile) ||
        path.basename(normFindingFile) === path.basename(diffFile)
      ) {
        targetRanges = ranges;
        break;
      }
    }
  }

  if (!targetRanges || targetRanges.length === 0) {
    if (finding.evidence && finding.evidence.length > 0) {
      for (const ev of finding.evidence) {
        const evFile = path.normalize(ev.file);
        for (const [diffFile, ranges] of diffRanges.entries()) {
          if (evFile.endsWith(diffFile) || diffFile.endsWith(evFile)) {
            const evStart = ev.startLine;
            const evEnd = ev.endLine ?? evStart;
            if (ranges.some((r) => evStart <= r.end + 2 && evEnd >= r.start - 2)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  const start = finding.startLine;
  const end = finding.endLine ?? start;
  const inRange = targetRanges.some((r) => start <= r.end + 2 && end >= r.start - 2);
  if (inRange) {
    return true;
  }

  if (finding.evidence && finding.evidence.length > 0) {
    for (const ev of finding.evidence) {
      const evFile = path.normalize(ev.file);
      if (normFindingFile.endsWith(evFile) || evFile.endsWith(normFindingFile)) {
        const evStart = ev.startLine;
        const evEnd = ev.endLine ?? evStart;
        if (targetRanges.some((r) => evStart <= r.end + 2 && evEnd >= r.start - 2)) {
          return true;
        }
      }
    }
  }

  return false;
}

const BENIGN_OR_SPECULATIVE_PATTERNS = [
  // Benign type assertions & casting
  /\b(unsafe|unvalidated|unchecked|loose)\s+(type\s+)?(assertion|cast)\b/i,
  /\btype\s+assertion\s+(is\s+)?(unsafe|unvalidated|unchecked)\b/i,
  /\buse\s+of\s+('as'|type\s+assertion)\b/i,
  /\btype\s+assertion\s+without\s+(validation|runtime\s+check|type\s+guard)\b/i,
  /\bcasting\s+(as|to)\s+['"]?[A-Za-z0-9_]+['"]?\s+without\s+(validation|runtime\s+check)\b/i,
  /\bmissing\s+(type\s+guard|runtime\s+schema\s+validation)\b/i,

  // Speculative missing local error handling
  /\bmissing\s+(try[\s/-]?catch|local\s+error\s+handling)\s*(around|for|block)?\b/i,
  /\bunhandled\s+(database\s+)?(query\s+)?(exception|error|promise\s+rejection)\b/i,
  /\bpotential\s+unhandled\s+(exception|error|rejection)\b/i,
  /\bno\s+error\s+handling\s+for\s+(database|query|async)\b/i,
  /\bunhandled\s+async\s+error\b/i,

  // Style / Documentation / Pedantic nits
  /\b(missing|add|update)\s+(jsdoc|tsdoc|docstring|documentation|comment)\b/i,
  /\b(code\s+style|naming\s+convention|consider\s+renaming)\b/i,
  /\b(magic\s+number|magic\s+string)\b/i,
  /\bprefer\s+(const|let|template\s+literal)\b/i,

  // Cosmetic formatting / localization / whitespace edge cases
  /\b(hardcoded\s+\$|hardcoded\s+currency|currency\s+symbol|currency\s+code)\b/i,
  /\b(intl\.numberformat|internationalization|i18n|localization)\b/i,
  /\bwhitespace-only\b/i,
  /\b(awkward|cosmetic|minor)\s+(output|greeting|formatting|display)\b/i,
];

/**
 * Checks whether a finding is a known benign pattern, speculative observation, or stylistic nit.
 */
export function isBenignOrSpeculative(finding: ModelFinding): boolean {
  const text = `${finding.title} ${finding.message} ${finding.suggestedFix}`.toLowerCase();

  for (const pattern of BENIGN_OR_SPECULATIVE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

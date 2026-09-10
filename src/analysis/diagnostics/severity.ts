/**
 * Standardized severity mapping from tool output to Octate Diagnostic severity.
 */

import type { Diagnostic } from '../../model/types.js';

/**
 * Maps tool-specific severity to Octate's standardized severity.
 * Per D-10:
 * - Tool errors → critical
 * - Warnings → high/medium (based on tool-specific heuristics)
 * - Info → low/info
 */
export function mapSeverity(toolSeverity: string, tool: string): Diagnostic['severity'] {
  const severity = toolSeverity.toLowerCase();

  switch (tool) {
    case 'tsc':
      if (severity === 'error') return 'critical';
      if (severity === 'warning') return 'medium';
      if (severity === 'suggestion') return 'low';
      return 'info';

    case 'biome':
      if (severity === 'error') return 'critical';
      if (severity === 'warning') return 'high';
      if (severity === 'info') return 'low';
      return 'info';

    case 'ruff':
      if (severity === 'error' || severity.startsWith('e')) return 'critical';
      if (severity === 'warning' || severity.startsWith('w')) return 'medium';
      if (severity.startsWith('f')) return 'high';
      return 'info';

    case 'mypy':
      if (severity === 'error') return 'high';
      if (severity === 'warning') return 'low';
      return 'info';

    case 'pyright':
      if (severity === 'error') return 'high';
      if (severity === 'warning') return 'medium';
      return 'info';

    case 'bandit':
      if (severity === 'high') return 'critical';
      if (severity === 'medium') return 'high';
      if (severity === 'low') return 'medium';
      return 'info';

    case 'pytest':
      if (severity === 'failed' || severity === 'error') return 'high';
      return 'info';

    default:
      if (severity === 'error' || severity === 'critical') return 'critical';
      if (severity === 'warning' || severity === 'high') return 'high';
      if (severity === 'medium') return 'medium';
      if (severity === 'low') return 'low';
      return 'info';
  }
}

/**
 * Normalizes tool-specific raw output to unified Diagnostic schema.
 * Per D-11: {file, line, column, endLine, endColumn, severity, message, source, rule}
 * Returns null if diagnostic is not actionable (e.g., "0 errors" summary lines).
 */
export function normalizeDiagnostic(raw: Record<string, unknown>, tool: string): Diagnostic | null {
  try {
    let file = '';
    let line = 0;
    let column = 0;
    let endLine = 0;
    let endColumn = 0;
    let severity: Diagnostic['severity'] = 'info';
    let message = '';
    let rule: string | undefined;

    const getString = (key: string): string => String(raw[key] ?? '');
    const getNumber = (key: string): number => Number(raw[key] ?? 0);
    const getNestedNumber = (path: string): number => {
      const parts = path.split('.');
      let current: unknown = raw;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return 0;
        }
      }
      return Number(current ?? 0);
    };

    switch (tool) {
      case 'tsc': {
        file = getString('fileName');
        line = getNestedNumber('start.line') || getNumber('line');
        column = getNestedNumber('start.character') || getNumber('character');
        endLine = getNestedNumber('end.line') || line;
        endColumn = getNestedNumber('end.character') || column;
        severity = mapSeverity(getString('category'), 'tsc');
        message = getString('messageText');
        rule = raw.code ? String(raw.code) : undefined;
        break;
      }

      case 'biome': {
        file = getString('filePath');
        line = getNestedNumber('location.start.line') || 1;
        column = getNestedNumber('location.start.column') || 1;
        endLine = getNestedNumber('location.end.line') || line;
        endColumn = getNestedNumber('location.end.column') || column;
        severity = mapSeverity(getString('severity'), 'biome');
        message = getString('message');
        rule = (raw.rule as { id?: string } | undefined)?.id
          ? String((raw.rule as { id: string }).id)
          : undefined;
        break;
      }

      case 'ruff': {
        file = getString('filename');
        line = getNestedNumber('location.row') || 1;
        column = getNestedNumber('location.column') || 1;
        endLine = getNestedNumber('endLocation.row') || line;
        endColumn = getNestedNumber('endLocation.column') || column;
        severity = mapSeverity(getString('code').charAt(0), 'ruff');
        message = getString('message');
        rule = raw.code ? String(raw.code) : undefined;
        break;
      }

      case 'mypy': {
        file = getString('file');
        line = getNumber('line') || 1;
        column = getNumber('column') || 1;
        endLine = getNumber('endLine') || line;
        endColumn = getNumber('endColumn') || column;
        severity = mapSeverity(getString('severity'), 'mypy');
        message = getString('message');
        rule = raw.code ? String(raw.code) : undefined;
        break;
      }

      case 'pyright': {
        file = getString('file');
        line = getNestedNumber('range.start.line') + 1; // pyright is 0-indexed
        column = getNestedNumber('range.start.character') + 1;
        endLine = getNestedNumber('range.end.line') + 1;
        endColumn = getNestedNumber('range.end.character') + 1;
        severity = mapSeverity(getString('severity'), 'pyright');
        message = getString('message');
        rule = raw.rule ? String(raw.rule) : undefined;
        break;
      }

      case 'bandit': {
        file = getString('filename');
        line = getNumber('line_number') || 1;
        column = 1;
        endLine = line;
        endColumn = 80;
        severity = mapSeverity(getString('severity'), 'bandit');
        message = getString('issue_text') || getString('message');
        rule = raw.test_id ? String(raw.test_id) : undefined;
        break;
      }

      case 'pytest': {
        file = getString('nodeid').split('::')[0] || '';
        line = getNumber('lineno') || 1;
        column = 1;
        endLine = line;
        endColumn = 80;
        severity = mapSeverity(getString('outcome'), 'pytest');
        message = String(getNestedNumber('call.longrepr')) || getString('message');
        rule = undefined;
        break;
      }

      default:
        return null;
    }

    // Skip non-actionable diagnostics
    if (
      !file ||
      !message ||
      message.includes('Found') ||
      message.includes('errors') ||
      message.includes('warnings')
    ) {
      return null;
    }

    return {
      file,
      startLine: Math.max(1, line),
      startColumn: Math.max(0, column),
      endLine: Math.max(1, endLine),
      endColumn: Math.max(0, endColumn),
      severity,
      message,
      source: tool,
      rule,
    };
  } catch {
    return null;
  }
}

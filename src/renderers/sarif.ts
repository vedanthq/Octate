/**
 * SARIF v2.1.0 ReviewRenderer implementation using node-sarif-builder.
 * Emits OASIS SARIF v2.1.0 compliant logs for GitHub Code Scanning and CI scanners.
 */

import {
  SarifBuilder,
  SarifResultBuilder,
  SarifRuleBuilder,
  SarifRunBuilder,
} from 'node-sarif-builder';
import type { ReviewResult, ReviewSeverity } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

/**
 * Maps Octate ReviewSeverity levels to standard SARIF Result.level values.
 *
 * Deterministic mapping per D-14 / T-06-04:
 * - 'critical' | 'high' → 'error'
 * - 'medium'            → 'warning'
 * - 'low' | 'info'      → 'note'
 * - fallback            → 'none'
 *
 * @param severity Octate review severity.
 * @returns OASIS SARIF result level.
 */
export function severityToSarifLevel(
  severity: ReviewSeverity
): 'error' | 'warning' | 'note' | 'none' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'note';
    default:
      return 'none';
  }
}

/**
 * SARIF v2.1.0 renderer constructing compliant static analysis results
 * via the node-sarif-builder DSL.
 */
export class SarifRenderer implements ReviewRenderer {
  private readonly options: RendererOptions;

  constructor(options: RendererOptions = {}) {
    this.options = options;
  }

  /**
   * Renders the review result into a standard SARIF v2.1.0 document.
   * Registers tool driver metadata, category rules, physical locations,
   * and severity levels.
   *
   * @param result Authoritative review result.
   */
  public async render(result: ReviewResult): Promise<void> {
    const builder = new SarifBuilder();
    const runBuilder = new SarifRunBuilder();

    // Initialize driver information per D-14
    runBuilder.initSimple({
      toolDriverName: 'Octate',
      toolDriverVersion: result.metadata.version || '0.1.0',
      url: 'https://octate.dev',
    });

    // Register distinct categories as SARIF rules
    const registeredCategories = new Set<string>();
    for (const finding of result.findings) {
      if (!registeredCategories.has(finding.category)) {
        registeredCategories.add(finding.category);
        const ruleBuilder = new SarifRuleBuilder();
        ruleBuilder.initSimple({
          ruleId: finding.category,
          shortDescriptionText: `${finding.category} rule`,
        });
        runBuilder.addRule(ruleBuilder);
      }
    }

    // Add findings as SARIF results
    for (const finding of result.findings) {
      const resultBuilder = new SarifResultBuilder();
      const startLine = finding.startLine ?? finding.line ?? 1;

      resultBuilder.initSimple({
        level: severityToSarifLevel(finding.severity),
        messageText: finding.message,
        ruleId: finding.category,
        fileUri: finding.file,
        startLine,
      });

      runBuilder.addResult(resultBuilder);
    }

    builder.addRun(runBuilder);
    const jsonOutput = builder.buildSarifJsonString({ indent: true });
    await writeRenderedOutput(jsonOutput, this.options);
  }
}

import { Box, Text } from 'ink';
import type { RankedFinding } from '../../../review/types.js';
import { formatPatchPreview } from '../clipboard.js';
import { extractFileDiffHunk } from '../diff.js';
import { formatDiffLines } from '../syntax.js';

export interface DiffModalProps {
  finding: RankedFinding;
  diffText?: string | undefined;
}

export function DiffModal({ finding, diffText }: DiffModalProps) {
  const hunk = extractFileDiffHunk(diffText ?? '', finding.file);
  const formatted = formatDiffLines(hunk);

  return (
    <Box borderStyle="double" borderColor="cyan" flexDirection="column" padding={1} width="85%">
      <Text bold color="cyan">
        UNIFIED DIFF PREVIEW — {finding.file}
      </Text>
      <Box borderStyle="single" borderColor="dim" flexDirection="column" marginY={1}>
        {formatted.length > 0 ? (
          formatted.map((line, idx) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines
            return <Text key={`diff-line-${idx}`}>{line}</Text>;
          })
        ) : (
          <Text dimColor>No unified git diff hunk found for {finding.file}</Text>
        )}
      </Box>
      <Text dimColor>
        Press{' '}
        <Text bold color="cyan">
          Esc
        </Text>{' '}
        to close
      </Text>
    </Box>
  );
}

export interface FixModalProps {
  finding: RankedFinding;
}

export function FixModal({ finding }: FixModalProps) {
  const patch = formatPatchPreview(finding);

  return (
    <Box borderStyle="double" borderColor="green" flexDirection="column" padding={1} width="80%">
      <Text bold color="green">
        SUGGESTED FIX PREVIEW
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text dimColor>
          Target: {finding.file}:{finding.startLine}
        </Text>
        <Text>{finding.suggestedFix ?? '(No suggested fix available)'}</Text>
      </Box>
      <Box borderStyle="single" borderColor="dim" flexDirection="column">
        {(() => {
          let lineNo = 0;
          return patch.split('\n').map((line) => {
            lineNo += 1;
            const color = line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : 'gray';
            return (
              <Text key={`patch-l-${lineNo}`} color={color}>
                {line}
              </Text>
            );
          });
        })()}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Press{' '}
          <Text bold color="cyan">
            c
          </Text>{' '}
          to copy code,{' '}
          <Text bold color="cyan">
            p
          </Text>{' '}
          to copy patch,{' '}
          <Text bold color="cyan">
            Esc
          </Text>{' '}
          to close
        </Text>
      </Box>
    </Box>
  );
}

export interface ExplainModalProps {
  finding: RankedFinding;
  scrollOffset?: number | undefined;
}

export function ExplainModal({ finding, scrollOffset = 0 }: ExplainModalProps) {
  const lines = [
    `TITLE: ${finding.title}`,
    `CATEGORY: ${finding.category.toUpperCase()} │ SEVERITY: ${finding.severity.toUpperCase()}`,
    '',
    'ROOT CAUSE & RATIONALE:',
    finding.message,
    '',
    `IMPACT & BLAST RADIUS (Score: ${finding.blastRadius}/100):`,
    finding.impact,
    '',
    'CONTRIBUTING REVIEWERS:',
    finding.contributingReviewers.join(', ') || finding.reviewer,
    '',
    'RELATED SYMBOLS:',
    finding.relatedSymbols.length > 0 ? finding.relatedSymbols.join(', ') : 'None',
  ];

  const visibleLines = lines.slice(scrollOffset, scrollOffset + 15);

  return (
    <Box borderStyle="double" borderColor="magenta" flexDirection="column" padding={1} width="85%">
      <Text bold color="magenta">
        STRUCTURED REASONING & EXPLANATION
      </Text>
      <Box flexDirection="column" marginY={1}>
        {visibleLines.map((line, idx) => {
          // biome-ignore lint/suspicious/noArrayIndexKey: text lines
          return <Text key={`explain-line-${idx}`}>{line}</Text>;
        })}
      </Box>
      <Text dimColor>
        Scroll:{' '}
        <Text bold color="cyan">
          ↑/↓
        </Text>{' '}
        (or j/k) │ Press{' '}
        <Text bold color="cyan">
          Esc
        </Text>{' '}
        to close
      </Text>
    </Box>
  );
}

export interface ContextModalProps {
  finding: RankedFinding;
}

export function ContextModal({ finding }: ContextModalProps) {
  const breakdown = finding.scoreBreakdown;

  return (
    <Box borderStyle="double" borderColor="cyan" flexDirection="column" padding={1} width="80%">
      <Text bold color="cyan">
        CONTEXT & SCORING METRICS
      </Text>
      <Box flexDirection="column" marginY={1} gap={1}>
        <Text>
          <Text bold>File: </Text>
          {finding.file}:{finding.startLine}-{finding.endLine}
        </Text>
        <Text>
          <Text bold>Related Symbols: </Text>
          {finding.relatedSymbols.length > 0 ? finding.relatedSymbols.join(', ') : 'None'}
        </Text>
        <Text>
          <Text bold>Related Files: </Text>
          {finding.relatedFiles.length > 0 ? finding.relatedFiles.join(', ') : 'None'}
        </Text>
        <Box borderStyle="single" borderColor="dim" flexDirection="column" paddingX={1}>
          <Text bold color="yellow">
            Score Breakdown:
          </Text>
          <Text dimColor>
            Severity: {breakdown?.severityScore ?? 0} │ Confidence:{' '}
            {breakdown?.confidenceScore ?? 0} │ Evidence: {breakdown?.evidenceStrengthScore ?? 0}
          </Text>
          <Text dimColor>
            Blast Radius: {breakdown?.blastRadiusScore ?? 0} │ Security Impact:{' '}
            {breakdown?.securityImpactScore ?? 0} │ Regression:{' '}
            {breakdown?.regressionProbabilityScore ?? 0}
          </Text>
        </Box>
      </Box>
      <Text dimColor>
        Press{' '}
        <Text bold color="cyan">
          Esc
        </Text>{' '}
        to close
      </Text>
    </Box>
  );
}

export function HelpModal() {
  return (
    <Box borderStyle="double" borderColor="yellow" flexDirection="column" padding={1} width="75%">
      <Text bold color="yellow">
        OCTATE KEYBOARD SHORTCUTS
      </Text>
      <Box flexDirection="column" marginY={1}>
        <Text>
          <Text bold color="cyan">
            ↑ / k
          </Text>{' '}
          : Navigate up
        </Text>
        <Text>
          <Text bold color="cyan">
            ↓ / j
          </Text>{' '}
          : Navigate down
        </Text>
        <Text>
          <Text bold color="cyan">
            Enter
          </Text>{' '}
          : Inspect finding or expand header
        </Text>
        <Text>
          <Text bold color="cyan">
            d
          </Text>{' '}
          : Open unified diff modal
        </Text>
        <Text>
          <Text bold color="cyan">
            f
          </Text>{' '}
          : Open suggested fix modal
        </Text>
        <Text>
          <Text bold color="cyan">
            e
          </Text>{' '}
          : Open structured reasoning explain modal
        </Text>
        <Text>
          <Text bold color="cyan">
            c
          </Text>{' '}
          : Open context & metrics modal
        </Text>
        <Text>
          <Text bold color="cyan">
            s
          </Text>{' '}
          : Toggle finding session suppression
        </Text>
        <Text>
          <Text bold color="cyan">
            Tab / ]
          </Text>{' '}
          : Cycle forward through supporting evidence
        </Text>
        <Text>
          <Text bold color="cyan">
            [
          </Text>{' '}
          : Cycle backward through supporting evidence
        </Text>
        <Text>
          <Text bold color="cyan">
            r
          </Text>{' '}
          : Re-run review in-place
        </Text>
        <Text>
          <Text bold color="cyan">
            ?
          </Text>{' '}
          : Open this help modal
        </Text>
        <Text>
          <Text bold color="cyan">
            Esc
          </Text>{' '}
          : Close modal overlay
        </Text>
        <Text>
          <Text bold color="red">
            q
          </Text>{' '}
          : Quit Octate review
        </Text>
      </Box>
      <Text dimColor>
        Press{' '}
        <Text bold color="cyan">
          Esc
        </Text>{' '}
        to close
      </Text>
    </Box>
  );
}

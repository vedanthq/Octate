import { Box, Text } from 'ink';
import type { RankedFinding } from '../../../review/types.js';
import { extractFileDiffHunk } from '../diff.js';
import { formatDiffLines } from '../syntax.js';
import type { SnippetMode } from '../types.js';
import { CodeSnippet } from './CodeSnippet.js';

export interface DetailPaneProps {
  finding?: RankedFinding | undefined;
  snippetMode: SnippetMode;
  evidenceIndex: number;
  fileContents?: Map<string, string> | undefined;
  diffText?: string | undefined;
}

export function DetailPane({
  finding,
  snippetMode,
  evidenceIndex,
  fileContents,
  diffText,
}: DetailPaneProps) {
  if (!finding) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Select a finding in the navigator list to inspect details.</Text>
      </Box>
    );
  }

  const activeEvidence = evidenceIndex > 0 ? finding.evidence[evidenceIndex - 1] : undefined;
  const targetFile = activeEvidence ? activeEvidence.file : finding.file;
  const targetLines = targetFile ? (fileContents?.get(targetFile)?.split(/\r?\n/) ?? []) : [];
  const targetStart = activeEvidence
    ? activeEvidence.startLine
    : (finding.startLine ?? finding.line ?? 1);
  const targetEnd = activeEvidence ? activeEvidence.endLine : (finding.endLine ?? targetStart);

  const fileDiff = extractFileDiffHunk(diffText ?? '', targetFile ?? '');

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="white">
          {finding.title}
        </Text>
        <Text dimColor>{finding.message}</Text>
        <Box gap={1} marginTop={1}>
          <Text dimColor>
            Score:{' '}
            <Text bold color="cyan">
              {finding.compositeScore.toFixed(1)}
            </Text>
          </Text>
          <Text dimColor>
            Confidence:{' '}
            <Text bold color="yellow">
              {(finding.confidence * 100).toFixed(0)}%
            </Text>
          </Text>
          <Text dimColor>
            Blast Radius:{' '}
            <Text bold color="magenta">
              {finding.blastRadius}
            </Text>
          </Text>
        </Box>
      </Box>

      {finding.evidence && finding.evidence.length > 0 && (
        <Box gap={1} marginBottom={1}>
          <Text color={evidenceIndex === 0 ? 'cyan' : 'gray'} bold={evidenceIndex === 0}>
            [0: Primary ({finding.file}:{finding.startLine})]
          </Text>
          {finding.evidence.map((ev, idx) => (
            <Text
              key={`${ev.file}-${ev.startLine}-${ev.relationship}`}
              color={evidenceIndex === idx + 1 ? 'cyan' : 'gray'}
              bold={evidenceIndex === idx + 1}
            >
              [{idx + 1}: {ev.relationship} ({ev.file}:{ev.startLine})]
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column" borderStyle="single" borderColor="dim">
        <Text bold dimColor>
          {snippetMode === 'source'
            ? `SOURCE: ${targetFile}:${targetStart}`
            : `GIT DIFF: ${targetFile}`}
        </Text>
        {snippetMode === 'source' ? (
          targetLines.length > 0 ? (
            <CodeSnippet
              lines={targetLines}
              startLine={1}
              highlightStart={targetStart}
              highlightEnd={targetEnd}
              contextRadius={4}
            />
          ) : (
            <Text dimColor>
              (Source line {targetStart} - full file content not cached in session)
            </Text>
          )
        ) : fileDiff.trim().length > 0 ? (
          formatDiffLines(fileDiff).map((line, idx) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: formatted diff lines
            return <Text key={`diff-${idx}`}>{line}</Text>;
          })
        ) : (
          <Text dimColor>(No git diff hunks found for {targetFile})</Text>
        )}
      </Box>
    </Box>
  );
}

import { Box, Text } from 'ink';
import { type CodeSnippetOptions, formatCodeSnippet } from '../syntax.js';

export interface CodeSnippetProps extends CodeSnippetOptions {}

export function CodeSnippet({
  lines,
  startLine,
  highlightStart,
  highlightEnd,
  contextRadius,
}: CodeSnippetProps) {
  const formattedLines = formatCodeSnippet({
    lines,
    startLine,
    highlightStart,
    highlightEnd,
    contextRadius,
  });

  return (
    <Box flexDirection="column">
      {formattedLines.map((line, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: pure static formatted lines
        <Text key={`line-${idx}`}>{line}</Text>
      ))}
    </Box>
  );
}

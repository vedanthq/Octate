import { Box, Text } from 'ink';
import type { ReviewProgressEvent } from '../../../application/types.js';

export interface ProgressViewProps {
  progressEvent?: ReviewProgressEvent | undefined;
}

export function ProgressView({ progressEvent }: ProgressViewProps) {
  const step = progressEvent?.step
    ? `[${progressEvent.step.current}/${progressEvent.step.total}] `
    : '';
  const icon =
    progressEvent?.status === 'complete' ? '✓ ' : progressEvent?.status === 'error' ? '✗ ' : '⟳ ';
  const color =
    progressEvent?.status === 'complete'
      ? 'green'
      : progressEvent?.status === 'error'
        ? 'red'
        : 'cyan';

  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
      <Box
        borderStyle="round"
        borderColor="cyan"
        padding={2}
        flexDirection="column"
        alignItems="center"
      >
        <Text bold color="cyan">
          OCTATE CODE REVIEW IN PROGRESS
        </Text>
        <Box marginTop={1}>
          <Text bold color={color}>
            {icon}
          </Text>
          <Text dimColor>{step}</Text>
          <Text>{progressEvent?.message ?? 'Initializing review pipeline...'}</Text>
        </Box>
      </Box>
    </Box>
  );
}

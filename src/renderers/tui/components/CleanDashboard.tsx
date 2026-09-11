import { Box, Text } from 'ink';

export interface CleanDashboardProps {
  filesAnalyzed?: number | undefined;
  durationMs?: number | undefined;
  scopeType?: string | undefined;
}

export function CleanDashboard({
  filesAnalyzed = 0,
  durationMs = 0,
  scopeType = 'all',
}: CleanDashboardProps) {
  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
      <Box
        borderStyle="round"
        borderColor="green"
        padding={2}
        flexDirection="column"
        alignItems="center"
      >
        <Text bold color="green">
          ✓ Clean Review — No issues found!
        </Text>
        <Box marginTop={1} gap={2}>
          <Text dimColor>
            Scope:{' '}
            <Text bold color="white">
              {scopeType}
            </Text>
          </Text>
          <Text dimColor>
            Files analyzed:{' '}
            <Text bold color="white">
              {filesAnalyzed}
            </Text>
          </Text>
          <Text dimColor>
            Duration:{' '}
            <Text bold color="white">
              {(durationMs / 1000).toFixed(2)}s
            </Text>
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text dimColor>
            Press{' '}
            <Text bold color="cyan">
              q
            </Text>{' '}
            to exit or{' '}
            <Text bold color="cyan">
              r
            </Text>{' '}
            to re-review.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

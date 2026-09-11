import { Box, Text } from 'ink';
import type { RankedFinding } from '../../../review/types.js';

export interface HeaderProps {
  repoRoot: string;
  scopeType: string;
  findings: readonly RankedFinding[];
  suppressedIds: ReadonlySet<string>;
  blockingCount: number;
}

export function Header({
  repoRoot,
  scopeType,
  findings,
  suppressedIds,
  blockingCount,
}: HeaderProps) {
  const activeFindings = findings.filter((f) => !suppressedIds.has(f.id));
  const counts = {
    critical: activeFindings.filter((f) => f.severity === 'critical').length,
    high: activeFindings.filter((f) => f.severity === 'high').length,
    medium: activeFindings.filter((f) => f.severity === 'medium').length,
    low: activeFindings.filter((f) => f.severity === 'low').length,
    info: activeFindings.filter((f) => f.severity === 'info').length,
  };

  const statusBadge =
    blockingCount > 0 ? (
      <Text bold color="red">
        [FAILING ({blockingCount} blocking)]
      </Text>
    ) : (
      <Text bold color="green">
        [PASSING]
      </Text>
    );

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          OCTATE REVIEW{' '}
          <Text dimColor>
            │ {repoRoot} ({scopeType})
          </Text>
        </Text>
        {statusBadge}
      </Box>
      <Box gap={1}>
        <Text color="red" bold>
          CRIT: {counts.critical}
        </Text>
        <Text color="magenta" bold>
          HIGH: {counts.high}
        </Text>
        <Text color="yellow">MED: {counts.medium}</Text>
        <Text color="blue">LOW: {counts.low}</Text>
        <Text dimColor>INFO: {counts.info}</Text>
        {suppressedIds.size > 0 && (
          <Text dimColor italic>
            ({suppressedIds.size} suppressed)
          </Text>
        )}
      </Box>
    </Box>
  );
}

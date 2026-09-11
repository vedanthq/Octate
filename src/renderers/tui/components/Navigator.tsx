import { Box, Text } from 'ink';
import type { NavItem } from '../types.js';

export interface NavigatorProps {
  navItems: readonly NavItem[];
  cursorIndex: number;
  suppressedIds: ReadonlySet<string>;
}

export function Navigator({ navItems, cursorIndex, suppressedIds }: NavigatorProps) {
  return (
    <Box flexDirection="column" width="100%">
      {navItems.map((item, index) => {
        const isSelected = index === cursorIndex;
        const cursorMarker = isSelected ? (
          <Text color="cyan" bold>
            {'> '}
          </Text>
        ) : (
          <Text>{'  '}</Text>
        );

        if (item.type === 'header') {
          const arrow = item.expanded ? '▼' : '▶';
          return (
            <Box key={`header-${item.groupKey}`}>
              {cursorMarker}
              <Text bold color="yellow">
                {arrow} {item.groupKey.toUpperCase()} ({item.count})
              </Text>
            </Box>
          );
        }

        const finding = item.finding;
        const isSuppressed = suppressedIds.has(finding.id);
        const line = finding.startLine ?? finding.line ?? 1;
        const fileLoc = `${finding.file}:${line}`;
        const colorProps = isSuppressed
          ? ({ color: 'gray' } as const)
          : isSelected
            ? ({ color: 'cyan' } as const)
            : {};

        return (
          <Box key={`finding-${finding.id}`}>
            {cursorMarker}
            <Text {...colorProps} strikethrough={isSuppressed}>
              [{finding.category}] {fileLoc} — {finding.title}
            </Text>
            {isSuppressed && <Text dimColor> [SUPPRESSED]</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

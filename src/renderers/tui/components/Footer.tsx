import { Box, Text } from 'ink';
import type { ModalType } from '../types.js';

export interface FooterProps {
  activeModal: ModalType;
}

export function Footer({ activeModal }: FooterProps) {
  if (activeModal === 'diff') {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          <Text bold color="cyan">
            Esc
          </Text>
          : Close Modal
        </Text>
      </Box>
    );
  }

  if (activeModal === 'fix') {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          <Text bold color="cyan">
            c
          </Text>
          : Copy Code{'  '}
          <Text bold color="cyan">
            p
          </Text>
          : Copy Patch{'  '}
          <Text bold color="cyan">
            Esc
          </Text>
          : Close Modal
        </Text>
      </Box>
    );
  }

  if (activeModal === 'explain') {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          <Text bold color="cyan">
            ↑/↓
          </Text>{' '}
          (or{' '}
          <Text bold color="cyan">
            j/k
          </Text>
          ): Scroll{'  '}
          <Text bold color="cyan">
            Esc
          </Text>
          : Close Modal
        </Text>
      </Box>
    );
  }

  if (activeModal === 'context' || activeModal === 'help') {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          <Text bold color="cyan">
            Esc
          </Text>
          : Close Modal
        </Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        <Text bold color="cyan">
          ↑/↓
        </Text>
        : Nav{'  '}
        <Text bold color="cyan">
          Enter
        </Text>
        : Inspect/Expand{'  '}
        <Text bold color="cyan">
          d
        </Text>
        : Diff{'  '}
        <Text bold color="cyan">
          f
        </Text>
        : Fix{'  '}
        <Text bold color="cyan">
          e
        </Text>
        : Explain{'  '}
        <Text bold color="cyan">
          c
        </Text>
        : Context{'  '}
        <Text bold color="cyan">
          s
        </Text>
        : Suppress{'  '}
        <Text bold color="cyan">
          Tab
        </Text>
        : Evidence{'  '}
        <Text bold color="cyan">
          r
        </Text>
        : Re-review{'  '}
        <Text bold color="cyan">
          ?
        </Text>
        : Help
      </Text>
      <Text dimColor>
        <Text bold color="red">
          q
        </Text>
        : Quit
      </Text>
    </Box>
  );
}

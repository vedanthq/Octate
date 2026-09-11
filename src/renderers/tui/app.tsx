import { Box, useInput, useStdout } from 'ink';
import { useReducer } from 'react';
import { copyToClipboard, formatPatchPreview } from './clipboard.js';
import { CleanDashboard } from './components/CleanDashboard.js';
import { DetailPane } from './components/DetailPane.js';
import { Footer } from './components/Footer.js';
import { Header } from './components/Header.js';
import { ContextModal, DiffModal, ExplainModal, FixModal, HelpModal } from './components/Modals.js';
import { Navigator } from './components/Navigator.js';
import { ProgressView } from './components/ProgressView.js';
import {
  buildNavItems,
  calculateActiveBlockingCount,
  getActiveFinding,
  tuiStateReducer,
} from './state.js';
import type { TuiState } from './types.js';

export interface AppProps {
  initialState: TuiState;
  onQuit: () => void;
  onReReview?: (() => Promise<void>) | undefined;
  fileContents?: Map<string, string> | undefined;
  diffText?: string | undefined;
}

export function App({ initialState, onQuit, onReReview, fileContents, diffText = '' }: AppProps) {
  const [state, dispatch] = useReducer(tuiStateReducer, initialState);
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isWide = columns >= 100;

  const navItems = buildNavItems(state.findings, state.expandedGroups);
  const activeFinding = getActiveFinding(state);
  const blockingCount = calculateActiveBlockingCount(state);

  useInput((input, key) => {
    // 1. Modal overlay input routing
    if (state.activeModal !== null) {
      if (key.escape) {
        dispatch({ type: 'CLOSE_MODAL' });
        return;
      }

      if (state.activeModal === 'fix') {
        if (input === 'c' && activeFinding) {
          copyToClipboard(activeFinding.suggestedFix ?? '');
        }
        if (input === 'p' && activeFinding) {
          copyToClipboard(formatPatchPreview(activeFinding));
        }
        return;
      }

      if (state.activeModal === 'explain') {
        if (key.upArrow || input === 'k') {
          dispatch({ type: 'SCROLL_EXPLAIN', delta: -1 });
        }
        if (key.downArrow || input === 'j') {
          dispatch({ type: 'SCROLL_EXPLAIN', delta: 1 });
        }
        return;
      }

      return;
    }

    // 2. Workspace navigation & actions
    if (key.upArrow || input === 'k') {
      dispatch({ type: 'NAVIGATE_UP' });
      return;
    }

    if (key.downArrow || input === 'j') {
      dispatch({ type: 'NAVIGATE_DOWN' });
      return;
    }

    if (key.return) {
      const currentItem = navItems[state.cursorIndex];
      if (currentItem?.type === 'header') {
        dispatch({ type: 'TOGGLE_GROUP_EXPAND' });
      } else if (currentItem?.type === 'finding') {
        dispatch({ type: 'OPEN_MODAL', modal: 'explain' });
      }
      return;
    }

    if (input === 'd' && activeFinding) {
      dispatch({ type: 'OPEN_MODAL', modal: 'diff' });
      return;
    }

    if (input === 'f' && activeFinding) {
      dispatch({ type: 'OPEN_MODAL', modal: 'fix' });
      return;
    }

    if (input === 'e' && activeFinding) {
      dispatch({ type: 'OPEN_MODAL', modal: 'explain' });
      return;
    }

    if (input === 'c' && activeFinding) {
      dispatch({ type: 'OPEN_MODAL', modal: 'context' });
      return;
    }

    if (input === '?' || input === 'h') {
      dispatch({ type: 'OPEN_MODAL', modal: 'help' });
      return;
    }

    if (input === 's') {
      dispatch({ type: 'TOGGLE_SUPPRESSION' });
      return;
    }

    if (key.tab || input === ']') {
      dispatch({ type: 'CYCLE_EVIDENCE', direction: 'next' });
      return;
    }

    if (input === '[') {
      dispatch({ type: 'CYCLE_EVIDENCE', direction: 'prev' });
      return;
    }

    if (input === 'r') {
      if (onReReview) {
        dispatch({ type: 'START_RE_REVIEW' });
        void onReReview();
      }
      return;
    }

    if (input === 'q') {
      onQuit();
      return;
    }
  });

  if (state.viewMode === 'progress') {
    return <ProgressView progressEvent={state.progressEvent} />;
  }

  if (state.viewMode === 'clean') {
    return (
      <CleanDashboard
        filesAnalyzed={state.reviewResult?.summary.filesAnalyzed ?? 1}
        durationMs={state.reviewResult?.summary.durationMs ?? 0}
        scopeType={state.scopeType}
      />
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Header
        repoRoot={state.repoRoot}
        scopeType={state.scopeType}
        findings={state.findings}
        suppressedIds={state.suppressedIds}
        blockingCount={blockingCount}
      />

      <Box flexDirection={isWide ? 'row' : 'column'} flexGrow={1} marginY={1}>
        <Box
          width={isWide ? '38%' : '100%'}
          marginRight={isWide ? 1 : 0}
          marginBottom={isWide ? 0 : 1}
        >
          <Navigator
            navItems={navItems}
            cursorIndex={state.cursorIndex}
            suppressedIds={state.suppressedIds}
          />
        </Box>
        <DetailPane
          finding={activeFinding}
          snippetMode={state.snippetMode}
          evidenceIndex={state.evidenceIndex}
          fileContents={fileContents}
          diffText={diffText}
        />
      </Box>

      <Footer activeModal={state.activeModal} />

      {state.activeModal !== null && activeFinding && (
        <Box
          position="absolute"
          alignItems="center"
          justifyContent="center"
          width="100%"
          height="100%"
        >
          {state.activeModal === 'diff' && (
            <DiffModal finding={activeFinding} diffText={diffText} />
          )}
          {state.activeModal === 'fix' && <FixModal finding={activeFinding} />}
          {state.activeModal === 'explain' && (
            <ExplainModal finding={activeFinding} scrollOffset={state.explainScrollOffset} />
          )}
          {state.activeModal === 'context' && <ContextModal finding={activeFinding} />}
          {state.activeModal === 'help' && <HelpModal />}
        </Box>
      )}

      {state.activeModal === 'help' && !activeFinding && (
        <Box
          position="absolute"
          alignItems="center"
          justifyContent="center"
          width="100%"
          height="100%"
        >
          <HelpModal />
        </Box>
      )}
    </Box>
  );
}

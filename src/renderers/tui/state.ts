import { countBlockingFindings } from '../../application/policy.js';
import type { RankedFinding } from '../../review/types.js';
import type { NavItem, SeverityGroupKey, TuiAction, TuiState } from './types.js';

export const SEVERITY_ORDER: SeverityGroupKey[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Builds the flattened list of navigation items (headers and finding rows)
 * based on current expanded severity groups.
 */
export function buildNavItems(
  findings: readonly RankedFinding[],
  expandedGroups: ReadonlySet<SeverityGroupKey>
): NavItem[] {
  const items: NavItem[] = [];

  for (const groupKey of SEVERITY_ORDER) {
    const groupFindings = findings
      .filter((f) => f.severity === groupKey)
      .slice()
      .sort((a, b) => b.compositeScore - a.compositeScore);

    if (groupFindings.length === 0) {
      continue;
    }

    const isExpanded = expandedGroups.has(groupKey);
    items.push({
      type: 'header',
      groupKey,
      count: groupFindings.length,
      expanded: isExpanded,
    });

    if (isExpanded) {
      for (const finding of groupFindings) {
        items.push({
          type: 'finding',
          finding,
          groupKey,
        });
      }
    }
  }

  return items;
}

/**
 * Resolves the currently active or highlighted finding from state.
 * If cursor is on a header, returns the first visible finding following that header.
 */
export function getActiveFinding(state: TuiState): RankedFinding | undefined {
  const navItems = buildNavItems(state.findings, state.expandedGroups);
  const current = navItems[state.cursorIndex];
  if (current?.type === 'finding') {
    return current.finding;
  }

  if (current?.type === 'header') {
    for (let i = state.cursorIndex + 1; i < navItems.length; i++) {
      const item = navItems[i];
      if (item?.type === 'finding' && item.groupKey === current.groupKey) {
        return item.finding;
      }
      if (item?.type === 'header') {
        break;
      }
    }
  }

  return undefined;
}

/**
 * Evaluates active (unsuppressed) findings against the fail-on threshold in real time.
 */
export function calculateActiveBlockingCount(state: TuiState): number {
  const activeFindings = state.findings.filter((f) => !state.suppressedIds.has(f.id));
  return countBlockingFindings(activeFindings, state.failOnSeverity);
}

/**
 * Pure state reducer governing all TUI interactive navigation and actions.
 */
export function tuiStateReducer(state: TuiState, action: TuiAction): TuiState {
  const navItems = buildNavItems(state.findings, state.expandedGroups);

  switch (action.type) {
    case 'NAVIGATE_UP': {
      const nextIndex = Math.max(0, state.cursorIndex - 1);
      return {
        ...state,
        cursorIndex: nextIndex,
        evidenceIndex: 0,
        explainScrollOffset: 0,
      };
    }

    case 'NAVIGATE_DOWN': {
      const nextIndex = Math.min(Math.max(0, navItems.length - 1), state.cursorIndex + 1);
      return {
        ...state,
        cursorIndex: nextIndex,
        evidenceIndex: 0,
        explainScrollOffset: 0,
      };
    }

    case 'TOGGLE_GROUP_EXPAND': {
      const current = navItems[state.cursorIndex];
      const targetGroup =
        action.groupKey ?? (current?.type === 'header' ? current.groupKey : undefined);
      if (!targetGroup) {
        return state;
      }

      const nextExpanded = new Set(state.expandedGroups);
      if (nextExpanded.has(targetGroup)) {
        nextExpanded.delete(targetGroup);
      } else {
        nextExpanded.add(targetGroup);
      }

      const newNavItems = buildNavItems(state.findings, nextExpanded);
      const nextIndex = Math.min(state.cursorIndex, Math.max(0, newNavItems.length - 1));

      return {
        ...state,
        expandedGroups: nextExpanded,
        cursorIndex: nextIndex,
      };
    }

    case 'TOGGLE_SUPPRESSION': {
      const current = navItems[state.cursorIndex];
      const targetId =
        action.findingId ?? (current?.type === 'finding' ? current.finding.id : undefined);
      if (!targetId) {
        return state;
      }

      const nextSuppressed = new Set(state.suppressedIds);
      if (nextSuppressed.has(targetId)) {
        nextSuppressed.delete(targetId);
      } else {
        nextSuppressed.add(targetId);
      }

      return { ...state, suppressedIds: nextSuppressed };
    }

    case 'TOGGLE_SNIPPET_MODE': {
      return {
        ...state,
        snippetMode: state.snippetMode === 'source' ? 'diff' : 'source',
      };
    }

    case 'CYCLE_EVIDENCE': {
      const activeFinding = getActiveFinding(state);
      if (!activeFinding) {
        return state;
      }

      const evidenceCount = (activeFinding.evidence?.length ?? 0) + 1; // 0 is primary, 1..N are evidence
      if (evidenceCount <= 1) {
        return state;
      }

      const delta = action.direction === 'next' ? 1 : -1;
      const nextEvidenceIndex = (state.evidenceIndex + delta + evidenceCount) % evidenceCount;

      return { ...state, evidenceIndex: nextEvidenceIndex };
    }

    case 'OPEN_MODAL': {
      return {
        ...state,
        activeModal: action.modal,
        explainScrollOffset: 0,
      };
    }

    case 'CLOSE_MODAL': {
      return { ...state, activeModal: null };
    }

    case 'SCROLL_EXPLAIN': {
      const nextOffset = Math.max(0, state.explainScrollOffset + action.delta);
      return { ...state, explainScrollOffset: nextOffset };
    }

    case 'SET_PROGRESS': {
      return { ...state, progressEvent: action.event };
    }

    case 'FINISH_REVIEW': {
      const hasFindings = action.result.findings.length > 0;
      return {
        ...state,
        findings: action.result.findings,
        reviewResult: action.result,
        viewMode: hasFindings ? 'workspace' : 'clean',
        cursorIndex: 0,
        evidenceIndex: 0,
        activeModal: null,
      };
    }

    case 'START_RE_REVIEW': {
      return {
        ...state,
        viewMode: 'progress',
        activeModal: null,
      };
    }

    default:
      return state;
  }
}

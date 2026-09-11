import { createMockFinding, createMockReviewResult } from '../../application/__tests__/mocks.js';
import {
  buildNavItems,
  calculateActiveBlockingCount,
  getActiveFinding,
  SEVERITY_ORDER,
  tuiStateReducer,
} from './state.js';
import type { SeverityGroupKey, TuiState } from './types.js';

describe('renderers:tui:state', () => {
  const critFinding = createMockFinding('critical', {
    id: 'crit-1',
    compositeScore: 90,
  });
  const highFinding = createMockFinding('high', {
    id: 'high-1',
    compositeScore: 80,
    evidence: [
      {
        file: 'src/caller.ts',
        startLine: 12,
        endLine: 14,
        relationship: 'caller',
        explanation: 'call site',
      },
    ],
  });
  const lowFinding = createMockFinding('low', {
    id: 'low-1',
    compositeScore: 30,
  });

  const baseState: TuiState = {
    findings: [critFinding, highFinding, lowFinding],
    suppressedIds: new Set<string>(),
    cursorIndex: 0,
    expandedGroups: new Set<SeverityGroupKey>(['critical', 'high', 'medium', 'low', 'info']),
    activeModal: null,
    viewMode: 'workspace',
    snippetMode: 'source',
    evidenceIndex: 0,
    explainScrollOffset: 0,
    failOnSeverity: 'high',
    repoRoot: '/repo',
    scopeType: 'all',
  };

  it('preserves canonical severity order in buildNavItems', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    const items = buildNavItems(baseState.findings, baseState.expandedGroups);

    const headers = items.filter((i) => i.type === 'header');
    expect(headers.map((h) => h.groupKey)).toEqual(['critical', 'high', 'low']);
  });

  it('collapses findings when severity group is not expanded', () => {
    const collapsed = new Set<SeverityGroupKey>(['critical']);
    const items = buildNavItems(baseState.findings, collapsed);

    // Critical group is expanded: header + 1 finding
    // High & Low groups are collapsed: only headers
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      type: 'header',
      groupKey: 'critical',
      count: 1,
      expanded: true,
    });
    expect(items[1]?.type).toBe('finding');
    expect(items[2]).toEqual({
      type: 'header',
      groupKey: 'high',
      count: 1,
      expanded: false,
    });
    expect(items[3]).toEqual({
      type: 'header',
      groupKey: 'low',
      count: 1,
      expanded: false,
    });
  });

  it('NAVIGATE_UP and NAVIGATE_DOWN clamp cursor and reset evidenceIndex', () => {
    let state = tuiStateReducer(baseState, { type: 'NAVIGATE_UP' });
    expect(state.cursorIndex).toBe(0);

    state = { ...state, evidenceIndex: 1 };
    state = tuiStateReducer(state, { type: 'NAVIGATE_DOWN' });
    expect(state.cursorIndex).toBe(1);
    expect(state.evidenceIndex).toBe(0);

    // Move to end and clamp
    const navItems = buildNavItems(state.findings, state.expandedGroups);
    state = { ...state, cursorIndex: navItems.length - 1 };
    state = tuiStateReducer(state, { type: 'NAVIGATE_DOWN' });
    expect(state.cursorIndex).toBe(navItems.length - 1);
  });

  it('TOGGLE_GROUP_EXPAND toggles expansion set', () => {
    // Cursor 0 is critical header
    const state1 = tuiStateReducer(baseState, { type: 'TOGGLE_GROUP_EXPAND' });
    expect(state1.expandedGroups.has('critical')).toBe(false);

    const state2 = tuiStateReducer(state1, { type: 'TOGGLE_GROUP_EXPAND' });
    expect(state2.expandedGroups.has('critical')).toBe(true);
  });

  it('resolves active finding when cursor is on finding or header', () => {
    // Cursor 0 is critical header, followed by critFinding
    const fromHeader = getActiveFinding(baseState);
    expect(fromHeader?.id).toBe(critFinding.id);

    // Move cursor to finding at index 1
    const stateAtFinding = { ...baseState, cursorIndex: 1 };
    const fromFinding = getActiveFinding(stateAtFinding);
    expect(fromFinding?.id).toBe(critFinding.id);
  });

  it('TOGGLE_SUPPRESSION toggles finding suppression and recalculates blocking count', () => {
    // Initial: critFinding and highFinding are blocking (failOnSeverity = 'high')
    expect(calculateActiveBlockingCount(baseState)).toBe(2);

    // Move cursor to critFinding (index 1)
    const stateAtCrit = { ...baseState, cursorIndex: 1 };
    const stateSuppressed = tuiStateReducer(stateAtCrit, {
      type: 'TOGGLE_SUPPRESSION',
    });

    expect(stateSuppressed.suppressedIds.has(critFinding.id)).toBe(true);
    // Blocking count should drop to 1 in real time
    expect(calculateActiveBlockingCount(stateSuppressed)).toBe(1);

    // Suppress highFinding as well
    const stateAtHigh = { ...stateSuppressed, cursorIndex: 3 }; // index 3 is highFinding
    const stateBothSuppressed = tuiStateReducer(stateAtHigh, {
      type: 'TOGGLE_SUPPRESSION',
    });
    expect(stateBothSuppressed.suppressedIds.has(highFinding.id)).toBe(true);
    expect(calculateActiveBlockingCount(stateBothSuppressed)).toBe(0);

    // Unsuppress critFinding
    const unsuppressed = tuiStateReducer(stateBothSuppressed, {
      type: 'TOGGLE_SUPPRESSION',
      findingId: critFinding.id,
    });
    expect(unsuppressed.suppressedIds.has(critFinding.id)).toBe(false);
    expect(calculateActiveBlockingCount(unsuppressed)).toBe(1);
  });

  it('TOGGLE_SNIPPET_MODE flips between source and diff', () => {
    expect(baseState.snippetMode).toBe('source');
    const s1 = tuiStateReducer(baseState, { type: 'TOGGLE_SNIPPET_MODE' });
    expect(s1.snippetMode).toBe('diff');
    const s2 = tuiStateReducer(s1, { type: 'TOGGLE_SNIPPET_MODE' });
    expect(s2.snippetMode).toBe('source');
  });

  it('CYCLE_EVIDENCE cycles through primary and secondary evidence locations', () => {
    // Move to highFinding (has 1 secondary evidence item, total 2 locations)
    const stateAtHigh = { ...baseState, cursorIndex: 3 };
    expect(stateAtHigh.evidenceIndex).toBe(0);

    const next = tuiStateReducer(stateAtHigh, {
      type: 'CYCLE_EVIDENCE',
      direction: 'next',
    });
    expect(next.evidenceIndex).toBe(1);

    // Wrap around to 0
    const wrap = tuiStateReducer(next, {
      type: 'CYCLE_EVIDENCE',
      direction: 'next',
    });
    expect(wrap.evidenceIndex).toBe(0);

    // Prev wrap
    const prev = tuiStateReducer(wrap, {
      type: 'CYCLE_EVIDENCE',
      direction: 'prev',
    });
    expect(prev.evidenceIndex).toBe(1);
  });

  it('OPEN_MODAL, CLOSE_MODAL, and SCROLL_EXPLAIN manage modal state', () => {
    const opened = tuiStateReducer(baseState, {
      type: 'OPEN_MODAL',
      modal: 'explain',
    });
    expect(opened.activeModal).toBe('explain');
    expect(opened.explainScrollOffset).toBe(0);

    const scrolled = tuiStateReducer(opened, {
      type: 'SCROLL_EXPLAIN',
      delta: 3,
    });
    expect(scrolled.explainScrollOffset).toBe(3);

    const closed = tuiStateReducer(scrolled, { type: 'CLOSE_MODAL' });
    expect(closed.activeModal).toBeNull();
  });

  it('FINISH_REVIEW routes to workspace when findings exist, clean when empty', () => {
    const reviewWithFindings = createMockReviewResult([critFinding]);
    const s1 = tuiStateReducer(baseState, {
      type: 'FINISH_REVIEW',
      result: reviewWithFindings,
    });
    expect(s1.viewMode).toBe('workspace');
    expect(s1.findings).toHaveLength(1);

    const reviewEmpty = createMockReviewResult([]);
    const s2 = tuiStateReducer(baseState, {
      type: 'FINISH_REVIEW',
      result: reviewEmpty,
    });
    expect(s2.viewMode).toBe('clean');
    expect(s2.findings).toHaveLength(0);
  });
});

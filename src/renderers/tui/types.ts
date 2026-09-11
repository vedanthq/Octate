import type { ReviewFailOnSeverity, ReviewProgressEvent } from '../../application/types.js';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../../review/types.js';

export type SeverityGroupKey = ReviewSeverity;

export type NavItem =
  | { type: 'header'; groupKey: SeverityGroupKey; count: number; expanded: boolean }
  | { type: 'finding'; finding: RankedFinding; groupKey: SeverityGroupKey };

export type SnippetMode = 'source' | 'diff';

export type ModalType = 'diff' | 'fix' | 'explain' | 'context' | 'help' | null;

export type ViewMode = 'workspace' | 'progress' | 'clean';

export interface TuiState {
  readonly findings: readonly RankedFinding[];
  readonly suppressedIds: ReadonlySet<string>;
  readonly cursorIndex: number;
  readonly expandedGroups: ReadonlySet<SeverityGroupKey>;
  readonly activeModal: ModalType;
  readonly viewMode: ViewMode;
  readonly snippetMode: SnippetMode;
  readonly evidenceIndex: number;
  readonly explainScrollOffset: number;
  readonly failOnSeverity: ReviewFailOnSeverity;
  readonly repoRoot: string;
  readonly scopeType: string;
  readonly progressEvent?: ReviewProgressEvent | undefined;
  readonly reviewResult?: ReviewResult | undefined;
}

export type TuiAction =
  | { type: 'NAVIGATE_UP' }
  | { type: 'NAVIGATE_DOWN' }
  | { type: 'TOGGLE_GROUP_EXPAND'; groupKey?: SeverityGroupKey | undefined }
  | { type: 'TOGGLE_SUPPRESSION'; findingId?: string | undefined }
  | { type: 'TOGGLE_SNIPPET_MODE' }
  | { type: 'CYCLE_EVIDENCE'; direction: 'next' | 'prev' }
  | { type: 'OPEN_MODAL'; modal: Exclude<ModalType, null> }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SCROLL_EXPLAIN'; delta: number }
  | { type: 'SET_PROGRESS'; event: ReviewProgressEvent }
  | { type: 'FINISH_REVIEW'; result: ReviewResult }
  | { type: 'START_RE_REVIEW' };

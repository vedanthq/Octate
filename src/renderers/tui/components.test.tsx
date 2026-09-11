import { renderToString } from 'ink';
import { createMockFinding } from '../../application/__tests__/mocks.js';
import { CleanDashboard } from './components/CleanDashboard.js';
import { DetailPane } from './components/DetailPane.js';
import { Footer } from './components/Footer.js';
import { Header } from './components/Header.js';
import { ContextModal, DiffModal, ExplainModal, FixModal, HelpModal } from './components/Modals.js';
import { Navigator } from './components/Navigator.js';
import type { NavItem } from './types.js';

describe('renderers:tui:components', () => {
  const sampleFinding = createMockFinding('critical', {
    id: 'f-1',
    title: 'SQL Injection in Auth',
    message: 'User input concatenation in database query',
    file: 'src/db.ts',
    startLine: 10,
    endLine: 12,
    suggestedFix: 'const query = db.prepare("SELECT * FROM users WHERE id = ?");',
  });

  describe('Header', () => {
    it('renders FAILING badge when blockingCount > 0', () => {
      const output = renderToString(
        <Header
          repoRoot="/octate"
          scopeType="staged"
          findings={[sampleFinding]}
          suppressedIds={new Set()}
          blockingCount={1}
        />
      );

      expect(output).toContain('OCTATE REVIEW');
      expect(output).toContain('[FAILING (1 blocking)]');
      expect(output).toContain('CRIT: 1');
    });

    it('renders PASSING badge when blockingCount is 0', () => {
      const output = renderToString(
        <Header
          repoRoot="/octate"
          scopeType="all"
          findings={[sampleFinding]}
          suppressedIds={new Set([sampleFinding.id])}
          blockingCount={0}
        />
      );

      expect(output).toContain('[PASSING]');
      expect(output).toContain('(1 suppressed)');
    });
  });

  describe('Footer', () => {
    it('renders default workspace keyboard cheatsheet when activeModal is null', () => {
      const output = renderToString(<Footer activeModal={null} />);
      expect(output).toContain('Nav');
      expect(output).toContain('Inspect/Expand');
      expect(output).toContain('Diff');
      expect(output).toContain('Fix');
      expect(output).toContain('Quit');
    });

    it('renders fix modal shortcuts when activeModal is fix', () => {
      const output = renderToString(<Footer activeModal="fix" />);
      expect(output).toContain('Copy Code');
      expect(output).toContain('Copy Patch');
      expect(output).toContain('Close Modal');
    });

    it('renders scroll shortcuts when activeModal is explain', () => {
      const output = renderToString(<Footer activeModal="explain" />);
      expect(output).toContain('Scroll');
      expect(output).toContain('Close Modal');
    });
  });

  describe('Navigator', () => {
    it('renders severity headers and finding items with suppressed indicators', () => {
      const navItems: NavItem[] = [
        { type: 'header', groupKey: 'critical', count: 1, expanded: true },
        { type: 'finding', finding: sampleFinding, groupKey: 'critical' },
      ];

      const normalOutput = renderToString(
        <Navigator navItems={navItems} cursorIndex={1} suppressedIds={new Set()} />
      );
      expect(normalOutput).toContain('CRITICAL (1)');
      expect(normalOutput).toContain('SQL Injection in Auth');
      expect(normalOutput).not.toContain('[SUPPRESSED]');

      const suppressedOutput = renderToString(
        <Navigator
          navItems={navItems}
          cursorIndex={1}
          suppressedIds={new Set([sampleFinding.id])}
        />
      );
      expect(suppressedOutput).toContain('[SUPPRESSED]');
    });
  });

  describe('DetailPane', () => {
    it('renders finding overview, metadata, and handles empty findings gracefully', () => {
      const outputEmpty = renderToString(<DetailPane snippetMode="source" evidenceIndex={0} />);
      expect(outputEmpty).toContain('Select a finding in the navigator list');

      const output = renderToString(
        <DetailPane
          finding={sampleFinding}
          snippetMode="source"
          evidenceIndex={0}
          fileContents={new Map([['src/db.ts', 'line1\nline2\nline3\nline4']])}
        />
      );
      expect(output).toContain(sampleFinding.title);
      expect(output).toContain(sampleFinding.message);
      expect(output).toContain('Blast Radius');
    });
  });

  describe('CleanDashboard', () => {
    it('renders celebratory banner and summary metrics', () => {
      const output = renderToString(
        <CleanDashboard filesAnalyzed={12} durationMs={1500} scopeType="staged" />
      );
      expect(output).toContain('Clean Review — No issues found!');
      expect(output).toContain('Files analyzed: 12');
      expect(output).toContain('1.50s');
    });
  });

  describe('Modals', () => {
    it('renders DiffModal with diff lines and close instructions', () => {
      const diff = 'diff --git a/src/db.ts b/src/db.ts\n@@ -1,2 +1,2 @@\n-bad\n+good';
      const output = renderToString(<DiffModal finding={sampleFinding} diffText={diff} />);
      expect(output).toContain('UNIFIED DIFF PREVIEW');
      expect(output).toContain('src/db.ts');
      expect(output).toContain('Esc');
    });

    it('renders FixModal with patch preview', () => {
      const output = renderToString(<FixModal finding={sampleFinding} />);
      expect(output).toContain('SUGGESTED FIX PREVIEW');
      expect(output).toContain('--- a/src/db.ts');
      expect(output).toContain('+++ b/src/db.ts');
      expect(output).toContain('copy code');
    });

    it('renders ExplainModal with structured reasoning sections', () => {
      const output = renderToString(<ExplainModal finding={sampleFinding} scrollOffset={0} />);
      expect(output).toContain('STRUCTURED REASONING & EXPLANATION');
      expect(output).toContain('ROOT CAUSE & RATIONALE:');
      expect(output).toContain('IMPACT & BLAST RADIUS');
    });

    it('renders ContextModal with scoring metrics and symbols', () => {
      const output = renderToString(<ContextModal finding={sampleFinding} />);
      expect(output).toContain('CONTEXT & SCORING METRICS');
      expect(output).toContain('Score Breakdown:');
      expect(output).toContain('Severity:');
    });

    it('renders HelpModal with keyboard shortcuts reference', () => {
      const output = renderToString(<HelpModal />);
      expect(output).toContain('OCTATE KEYBOARD SHORTCUTS');
      expect(output).toContain('Navigate up');
      expect(output).toContain('Quit Octate review');
    });
  });
});

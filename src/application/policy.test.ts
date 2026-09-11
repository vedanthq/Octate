/**
 * Unit tests for application severity threshold policy and failure banner.
 */

import { describe, expect, it } from '@jest/globals';
import type { ReviewSeverity } from '../review/types.js';
import { createMockFinding, createMockReviewResult } from './__tests__/mocks.js';
import {
  countBlockingFindings,
  evaluateExitCode,
  formatFailureBanner,
  isBlockingFinding,
  SEVERITY_LEVELS,
} from './policy.js';

describe('application:policy', () => {
  describe('SEVERITY_LEVELS', () => {
    it('ranks severities strictly from critical down to info', () => {
      expect(SEVERITY_LEVELS.critical).toBeGreaterThan(SEVERITY_LEVELS.high);
      expect(SEVERITY_LEVELS.high).toBeGreaterThan(SEVERITY_LEVELS.medium);
      expect(SEVERITY_LEVELS.medium).toBeGreaterThan(SEVERITY_LEVELS.low);
      expect(SEVERITY_LEVELS.low).toBeGreaterThan(SEVERITY_LEVELS.info);
    });
  });

  describe('isBlockingFinding', () => {
    const severities: ReviewSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

    it('returns true when finding severity >= threshold', () => {
      const highFinding = createMockFinding('high');
      expect(isBlockingFinding(highFinding, 'critical')).toBe(false);
      expect(isBlockingFinding(highFinding, 'high')).toBe(true);
      expect(isBlockingFinding(highFinding, 'medium')).toBe(true);
      expect(isBlockingFinding(highFinding, 'low')).toBe(true);
      expect(isBlockingFinding(highFinding, 'info')).toBe(true);
    });

    it('correctly evaluates all severity levels against threshold', () => {
      for (const fSev of severities) {
        for (const tSev of severities) {
          const finding = createMockFinding(fSev);
          const expected = SEVERITY_LEVELS[fSev] >= SEVERITY_LEVELS[tSev];
          expect(isBlockingFinding(finding, tSev)).toBe(expected);
        }
      }
    });

    it('always returns false for advisory modes "none" and "off"', () => {
      for (const sev of severities) {
        const finding = createMockFinding(sev);
        expect(isBlockingFinding(finding, 'none')).toBe(false);
        expect(isBlockingFinding(finding, 'off')).toBe(false);
      }
    });
  });

  describe('countBlockingFindings', () => {
    const findings = [
      createMockFinding('critical'),
      createMockFinding('high'),
      createMockFinding('medium'),
      createMockFinding('low'),
      createMockFinding('info'),
    ];

    it('counts findings correctly for each threshold', () => {
      expect(countBlockingFindings(findings, 'critical')).toBe(1);
      expect(countBlockingFindings(findings, 'high')).toBe(2);
      expect(countBlockingFindings(findings, 'medium')).toBe(3);
      expect(countBlockingFindings(findings, 'low')).toBe(4);
      expect(countBlockingFindings(findings, 'info')).toBe(5);
    });

    it('returns 0 for advisory modes "none" and "off"', () => {
      expect(countBlockingFindings(findings, 'none')).toBe(0);
      expect(countBlockingFindings(findings, 'off')).toBe(0);
    });

    it('returns 0 for empty findings array', () => {
      expect(countBlockingFindings([], 'critical')).toBe(0);
      expect(countBlockingFindings([], 'info')).toBe(0);
    });
  });

  describe('evaluateExitCode', () => {
    it('returns 1 when blocking findings are present', () => {
      const result = createMockReviewResult([
        createMockFinding('critical'),
        createMockFinding('low'),
      ]);
      expect(evaluateExitCode(result, 'critical')).toBe(1);
      expect(evaluateExitCode(result, 'high')).toBe(1);
    });

    it('defaults threshold to "critical"', () => {
      const resultWithHigh = createMockReviewResult([createMockFinding('high')]);
      expect(evaluateExitCode(resultWithHigh)).toBe(0);

      const resultWithCritical = createMockReviewResult([createMockFinding('critical')]);
      expect(evaluateExitCode(resultWithCritical)).toBe(1);
    });

    it('returns 0 when findings are below threshold', () => {
      const result = createMockReviewResult([
        createMockFinding('medium'),
        createMockFinding('low'),
      ]);
      expect(evaluateExitCode(result, 'critical')).toBe(0);
      expect(evaluateExitCode(result, 'high')).toBe(0);
    });

    it('returns 0 when there are no findings', () => {
      const result = createMockReviewResult([]);
      expect(evaluateExitCode(result, 'info')).toBe(0);
    });

    it('returns 0 in advisory modes "none" and "off" even with critical findings', () => {
      const result = createMockReviewResult([
        createMockFinding('critical'),
        createMockFinding('critical'),
      ]);
      expect(evaluateExitCode(result, 'none')).toBe(0);
      expect(evaluateExitCode(result, 'off')).toBe(0);
    });
  });

  describe('formatFailureBanner', () => {
    it('formats singular blocking finding notice', () => {
      const banner = formatFailureBanner(1, 'critical');
      expect(banner).toContain('Review failed: 1 blocking finding (>= critical)');
    });

    it('formats plural blocking findings notice', () => {
      const banner = formatFailureBanner(3, 'high');
      expect(banner).toContain('Review failed: 3 blocking findings (>= high)');
    });
  });
});

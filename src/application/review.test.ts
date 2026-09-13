/**
 * Unit and integration tests for ReviewUseCase application orchestrator.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as git from 'isomorphic-git';
import { createTestFinding, MockReviewModel } from '../review/__tests__/mocks.js';
import { createReviewUseCase, ReviewUseCase } from './review.js';
import type { CanonicalReviewStage, ReviewProgressEvent } from './types.js';

describe('application:review', () => {
  let testDir: string;
  let model: MockReviewModel;
  let useCase: ReviewUseCase;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'octate-usecase-test-'));
    model = new MockReviewModel();
    useCase = createReviewUseCase();

    // Initialize clean git repository
    await git.init({ fs, dir: testDir });
    await git.setConfig({ fs, dir: testDir, path: 'user.name', value: 'Test User' });
    await git.setConfig({ fs, dir: testDir, path: 'user.email', value: 'test@example.com' });

    // Initial commit
    await fs.writeFile(path.join(testDir, 'README.md'), '# Octate Test\n');
    await git.add({ fs, dir: testDir, filepath: 'README.md' });
    await git.commit({ fs, dir: testDir, message: 'Initial commit' });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('creates instance via factory function', () => {
    expect(useCase).toBeInstanceOf(ReviewUseCase);
  });

  it('short-circuits on empty diff returning empty ReviewResult without calling model', async () => {
    const events: ReviewProgressEvent[] = [];
    const result = await useCase.execute({
      repoRoot: testDir,
      modelOverride: model,
      onProgress: (event) => events.push(event),
    });

    expect(result).toBeDefined();
    expect(result.summary.totalFindings).toBe(0);
    expect(result.summary.filesAnalyzed).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.metadata.totalTokens).toBe(0);
    expect(model.calls.length).toBe(0);

    // Should only have emitted git:read stage
    const stages = events.map((e) => e.stage);
    expect(stages).toContain('git:read');
    expect(stages).not.toContain('index:update');
  });

  it('sequentially invokes and emits all 8 canonical stages with step counters', async () => {
    // Create an unstaged TypeScript file with content
    const testFile = 'handler.ts';
    await fs.writeFile(
      path.join(testDir, testFile),
      'export function handleUser(user: { profile?: string }): string {\n  return user.profile || "default";\n}\n'
    );

    const testFinding = createTestFinding({
      file: testFile,
      startLine: 1,
      endLine: 2,
      evidence: [
        {
          file: testFile,
          startLine: 1,
          endLine: 2,
          relationship: 'caller',
          explanation: 'Object accessed here before null guard',
        },
      ],
      severity: 'high',
      category: 'correctness',
      title: 'Potential null dereference in handler',
    });

    // Configure mock model responses for DAG and Critic
    model.setRoleHandler('structural', async () => ({
      findings: [testFinding],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    model.setRoleHandler('critic', async () => ({
      findings: [testFinding],
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    const events: ReviewProgressEvent[] = [];
    const result = await useCase.execute({
      repoRoot: testDir,
      modelOverride: model,
      onProgress: (event) => events.push(event),
    });

    expect(result).toBeDefined();
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.severity).toBe('high');
    expect(result.summary.totalFindings).toBe(1);
    expect(result.summary.filesAnalyzed).toBe(1);

    // Verify all 8 canonical stages were emitted in exact order
    const expectedStages: CanonicalReviewStage[] = [
      'git:read',
      'index:update',
      'symbols:resolve',
      'diagnostics:collect',
      'context:build',
      'review:dag',
      'review:critic',
      'review:rank',
    ];

    for (const [i, stage] of expectedStages.entries()) {
      const startEvent = events.find((e) => e.stage === stage && e.status === 'start');
      const completeEvent = events.find((e) => e.stage === stage && e.status === 'complete');

      expect(startEvent).toBeDefined();
      expect(completeEvent).toBeDefined();
      expect(startEvent?.step).toEqual({ current: i + 1, total: 8 });
      expect(completeEvent?.step).toEqual({ current: i + 1, total: 8 });
    }
  });

  it('rejects when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      useCase.execute({
        repoRoot: testDir,
        modelOverride: model,
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

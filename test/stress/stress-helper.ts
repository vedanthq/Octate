/**
 * Shared test helpers and fixtures for Octate Stress-Testing Suite.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as git from 'isomorphic-git';
import type {
  ModelFinding,
  ModelRequest,
  ModelResponse,
  ReviewModel,
} from '../../src/model/types.js';

/**
 * Creates an isolated temporary directory with auto-prefix.
 */
export async function createTempDir(prefix = 'octate-stress-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Safely removes a directory and all its contents with retry tolerance.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures in test teardown
  }
}

/**
 * Creates an isolated Git repository initialized with isomorphic-git.
 */
export async function createTempGitRepo(
  options: {
    initialFiles?: Record<string, string>;
    commitMessage?: string;
    authorName?: string;
    authorEmail?: string;
  } = {}
): Promise<{
  repoRoot: string;
  commitHash?: string;
  cleanup: () => Promise<void>;
}> {
  const repoRoot = await createTempDir('octate-git-stress-');

  // Initialize git repo
  await git.init({
    fs,
    dir: repoRoot,
    defaultBranch: 'main',
  });

  let commitHash: string | undefined;

  if (options.initialFiles && Object.keys(options.initialFiles).length > 0) {
    for (const [relPath, content] of Object.entries(options.initialFiles)) {
      const fullPath = path.join(repoRoot, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      await git.add({
        fs,
        dir: repoRoot,
        filepath: relPath,
      });
    }

    commitHash = await git.commit({
      fs,
      dir: repoRoot,
      message: options.commitMessage ?? 'Initial stress test commit',
      author: {
        name: options.authorName ?? 'Stress Test Runner',
        email: options.authorEmail ?? 'stress@octate.local',
      },
    });
  }

  return {
    repoRoot,
    commitHash,
    cleanup: async () => {
      await cleanupTempDir(repoRoot);
    },
  };
}

/**
 * Fast seeded Pseudo-Random Number Generator (Mulberry32) for reproducible fuzzing.
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * High-volume mock ReviewModel for stress testing.
 */
export class StressMockReviewModel implements ReviewModel {
  public calls: ModelRequest[] = [];
  public responseDelayMs = 0;
  public failureRate = 0; // 0 to 1
  public findingsToGenerate: ModelFinding[] = [];
  private rand: () => number;

  constructor(seed = 12345) {
    this.rand = createMulberry32(seed);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.calls.push(request);

    if (this.responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelayMs));
    }

    if (this.failureRate > 0 && this.rand() < this.failureRate) {
      throw new Error(`Synthetic provider transient error (rate: ${this.failureRate})`);
    }

    return {
      findings: [...this.findingsToGenerate],
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      model: 'stress-mock-model',
      latencyMs: this.responseDelayMs,
      finishReason: 'stop',
    };
  }
}

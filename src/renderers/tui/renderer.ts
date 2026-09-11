import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Instance, render } from 'ink';
import pc from 'picocolors';
import React from 'react';
import { countBlockingFindings } from '../../application/policy.js';
import type { ReviewFailOnSeverity, ReviewProgressEvent } from '../../application/types.js';
import type { ReviewResult } from '../../review/types.js';
import type { RendererOptions, ReviewRenderer } from '../types.js';
import { App } from './app.js';
import { TerminalLifecycleManager } from './terminal.js';
import type { TuiState } from './types.js';

export interface InteractiveTuiOptions extends RendererOptions {
  repoRoot?: string | undefined;
  scopeType?: string | undefined;
  failOn?: ReviewFailOnSeverity | undefined;
  onReReview?: (() => Promise<void>) | undefined;
  fileContents?: Map<string, string> | undefined;
  diffText?: string | undefined;
}

export class InteractiveTuiRenderer implements ReviewRenderer {
  private readonly options: InteractiveTuiOptions;
  private readonly lifecycle: TerminalLifecycleManager;
  private readonly actionEmitter: EventEmitter;
  private inkInstance: Instance | null = null;
  private exitResolver: (() => void) | null = null;
  private exitPromise: Promise<void> | null = null;
  private finalSuppressedIds: ReadonlySet<string> = new Set();
  private started = false;

  constructor(options: InteractiveTuiOptions = {}) {
    this.options = options;
    this.lifecycle = new TerminalLifecycleManager(
      (options.stream as NodeJS.WriteStream | undefined) ?? process.stdout
    );
    this.actionEmitter = new EventEmitter();
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.lifecycle.enter();

    const initialState: TuiState = {
      findings: [],
      suppressedIds: new Set<string>(),
      cursorIndex: 0,
      expandedGroups: new Set(['critical', 'high', 'medium', 'low', 'info']),
      activeModal: null,
      viewMode: 'progress',
      snippetMode: 'source',
      evidenceIndex: 0,
      explainScrollOffset: 0,
      failOnSeverity: this.options.failOn ?? 'critical',
      repoRoot: this.options.repoRoot ?? process.cwd(),
      scopeType: this.options.scopeType ?? 'workspace',
      progressEvent: {
        stage: 'git:read',
        status: 'start',
        message: 'Initializing review pipeline...',
      },
    };

    this.exitPromise = new Promise<void>((resolve) => {
      this.exitResolver = resolve;
    });

    this.inkInstance = render(
      React.createElement(App, {
        initialState,
        onQuit: (suppressedIds) => {
          if (suppressedIds) {
            this.finalSuppressedIds = suppressedIds;
          }
          if (this.inkInstance) {
            this.inkInstance.unmount();
          }
          if (this.exitResolver) {
            this.exitResolver();
          }
        },
        onReReview: this.options.onReReview,
        fileContents: this.options.fileContents,
        diffText: this.options.diffText,
        actionEmitter: this.actionEmitter,
      }),
      {
        patchConsole: true,
        stdout: (this.options.stream as NodeJS.WriteStream | undefined) ?? process.stdout,
      }
    );
  }

  public dispatchProgress(event: ReviewProgressEvent): void {
    this.actionEmitter.emit('action', { type: 'SET_PROGRESS', event });
  }

  public dispatchResult(result: ReviewResult): void {
    this.actionEmitter.emit('action', { type: 'FINISH_REVIEW', result });
  }

  public async render(result: ReviewResult): Promise<void> {
    if (!this.started) {
      this.start();
    }

    try {
      const fileContents = this.options.fileContents ?? new Map<string, string>();
      if (!this.options.fileContents) {
        const uniqueFiles = new Set<string>();
        for (const f of result.findings) {
          if (f.file) {
            uniqueFiles.add(f.file);
          }
          for (const ev of f.evidence) {
            if (ev.file) {
              uniqueFiles.add(ev.file);
            }
          }
        }

        await Promise.all(
          Array.from(uniqueFiles).map(async (relFile) => {
            try {
              const fullPath = path.resolve(this.options.repoRoot ?? process.cwd(), relFile);
              const content = await fs.promises.readFile(fullPath, 'utf-8');
              fileContents.set(relFile, content);
            } catch {
              // Ignore unreadable or deleted files
            }
          })
        );
      }

      const diffText = this.options.diffText ?? '';
      this.actionEmitter.emit('data', { fileContents, diffText });
      this.dispatchResult(result);

      if (this.exitPromise) {
        await this.exitPromise;
      }
    } finally {
      this.lifecycle.exit();
    }

    const threshold = this.options.failOn ?? 'critical';
    const activeFindings = result.findings.filter((f) => !this.finalSuppressedIds.has(f.id));
    const finalBlockingCount = countBlockingFindings(activeFindings, threshold);
    process.exitCode = finalBlockingCount > 0 ? 1 : 0;

    const stream = process.stderr;
    if (finalBlockingCount > 0) {
      stream.write(
        pc.red(`\nOctate review finished: ${finalBlockingCount} blocking findings (exit 1)\n`)
      );
    } else {
      stream.write(pc.green('\nOctate review finished: clean (exit 0)\n'));
    }
  }

  public exit(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount();
    }
    this.lifecycle.exit();
    if (this.exitResolver) {
      this.exitResolver();
    }
  }
}

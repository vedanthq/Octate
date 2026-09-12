import { spawn } from 'node:child_process';
import type { RankedFinding } from '../../review/types.js';

/**
 * Emits an OSC 52 escape sequence to copy text to the terminal emulator clipboard.
 * Works seamlessly across SSH sessions, tmux, and modern terminal emulators.
 */
export function copyViaOsc52(text: string, stream: NodeJS.WriteStream = process.stdout): boolean {
  try {
    const base64 = Buffer.from(text, 'utf-8').toString('base64');
    stream.write(`\x1b]52;c;${base64}\x07`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Falls back to native operating system clipboard utilities.
 */
export function copyViaOsCommand(text: string): Promise<boolean> {
  const platform = process.platform;
  let command: string;
  let args: string[] = [];

  if (platform === 'darwin') {
    command = 'pbcopy';
  } else if (platform === 'win32') {
    command = 'clip.exe';
  } else {
    // Linux / BSD: prefer wl-copy on Wayland, otherwise xclip
    command = process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip';
    if (command === 'xclip') {
      args = ['-selection', 'clipboard'];
    }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore kill errors
        }
        resolve(false);
      }, 2000);
      timer.unref();

      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });

      if (child.stdin) {
        child.stdin.write(text);
        child.stdin.end();
      } else {
        clearTimeout(timer);
        resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Copies text to system clipboard, trying OSC 52 first before falling back to OS utilities.
 */
export function copyToClipboard(text: string): Promise<boolean> {
  const oscSuccess = copyViaOsc52(text);
  if (oscSuccess) {
    return Promise.resolve(true);
  }
  return copyViaOsCommand(text);
}

/**
 * Generates a unified git patch preview string for a given finding's suggested fix.
 */
export function formatPatchPreview(finding: RankedFinding): string {
  const file = finding.file;
  const start = finding.startLine ?? finding.line ?? 1;
  const fix = finding.suggestedFix ?? '';

  return [`--- a/${file}`, `+++ b/${file}`, `@@ -${start},1 +${start},1 @@`, `+${fix}`].join('\n');
}

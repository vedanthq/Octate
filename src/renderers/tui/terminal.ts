export const ANSI_ENTER_ALT_SCREEN = '\x1b[?1049h';
export const ANSI_EXIT_ALT_SCREEN = '\x1b[?1049l';
export const ANSI_HIDE_CURSOR = '\x1b[?25l';
export const ANSI_SHOW_CURSOR = '\x1b[?25h';
export const ANSI_CLEAR_BUFFER = '\x1b[2J\x1b[H';

export interface TerminalFallbackOptions {
  isTTY?: boolean | undefined;
  ci?: boolean | undefined;
  term?: string | undefined;
  plain?: boolean | undefined;
  noTui?: boolean | undefined;
  json?: boolean | undefined;
  sarif?: boolean | undefined;
  quiet?: boolean | undefined;
  outputFile?: string | undefined;
}

export function shouldUseTui(options: TerminalFallbackOptions = {}): boolean {
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY);
  const isCI = options.ci ?? Boolean(process.env.CI);
  const term = options.term ?? process.env.TERM ?? '';
  const isDumb = term === 'dumb';

  if (!isTTY || isCI || isDumb) {
    return false;
  }
  if (options.plain || options.noTui) {
    return false;
  }
  if (options.json || options.sarif || options.quiet || options.outputFile) {
    return false;
  }

  return true;
}

export class TerminalLifecycleManager {
  private active = false;
  private readonly stream: NodeJS.WriteStream;

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
  }

  public enter(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.stream.write(`${ANSI_ENTER_ALT_SCREEN}${ANSI_HIDE_CURSOR}`);
    this.installTraps();
  }

  public exit(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.stream.write(`${ANSI_EXIT_ALT_SCREEN}${ANSI_SHOW_CURSOR}`);
    this.removeTraps();
  }

  public isActive(): boolean {
    return this.active;
  }

  private handleSignal = (): void => {
    this.exit();
  };

  private installTraps(): void {
    process.once('exit', this.handleSignal);
    process.once('SIGINT', this.handleSignal);
    process.once('SIGTERM', this.handleSignal);
    process.once('uncaughtException', this.handleSignal);
  }

  private removeTraps(): void {
    process.removeListener('exit', this.handleSignal);
    process.removeListener('SIGINT', this.handleSignal);
    process.removeListener('SIGTERM', this.handleSignal);
    process.removeListener('uncaughtException', this.handleSignal);
  }
}

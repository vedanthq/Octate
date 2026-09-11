/**
 * Public barrel export and factory for Octate ReviewRenderers.
 */

import { ConsoleRenderer } from './console.js';
import { JsonRenderer } from './json.js';
import { QuietRenderer } from './quiet.js';
import { SarifRenderer } from './sarif.js';
import { InteractiveTuiRenderer } from './tui/renderer.js';
import type { RendererOptions, ReviewRenderer } from './types.js';

export * from './console.js';
export * from './json.js';
export * from './quiet.js';
export * from './sarif.js';
export * from './tui/renderer.js';
export * from './tui/types.js';
export * from './types.js';

export type OutputFormat = 'json' | 'sarif' | 'quiet' | 'console' | 'tui';

/**
 * Factory creating an appropriate polymorphic ReviewRenderer instance
 * matching the requested output format.
 *
 * @param format Target format ('json', 'sarif', 'quiet', 'console', 'tui').
 * @param options Output file destination, stream, or formatting toggles.
 * @returns Configured ReviewRenderer implementation.
 */
export function createRenderer(
  format: OutputFormat,
  options?: RendererOptions | undefined
): ReviewRenderer {
  switch (format) {
    case 'json':
      return new JsonRenderer(options);
    case 'sarif':
      return new SarifRenderer(options);
    case 'quiet':
      return new QuietRenderer(options);
    case 'console':
      return new ConsoleRenderer(options);
    case 'tui':
      return new InteractiveTuiRenderer(options);
    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unsupported review renderer format: ${exhaustiveCheck}`);
    }
  }
}

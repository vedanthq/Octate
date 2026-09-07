/**
 * Public cancellation API.
 * Re-exports all cancellation modules for convenient imports.
 */

export {
  CancellationController,
  createCancellationController,
  withCancellation,
} from './controller.js';

export {
  killProcessTree,
  type SpawnWithSignalOptions,
  SubprocessError,
  type SubprocessResult,
  spawnWithSignal,
} from './subprocess.js';

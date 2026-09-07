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
  spawnWithSignal,
  killProcessTree,
  SubprocessError,
  type SpawnWithSignalOptions,
  type SubprocessResult,
} from './subprocess.js';
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
  runCommand,
  type SpawnResult,
  type SpawnWithSignalOptions,
  SubprocessError,
  spawnWithSignal,
  which,
} from './subprocess.js';

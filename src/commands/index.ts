/**
 * Command registry - registers all CLI commands.
 */

import type { Command } from 'commander';
import { doctorCommand } from './doctor.js';
import { initCommand } from './init.js';
import { reviewCommand } from './review.js';

/**
 * Registers all commands with the Commander.js program.
 */
export function registerCommands(program: Command): void {
  // Add commands in order of importance
  program.addCommand(initCommand);
  program.addCommand(reviewCommand);
  program.addCommand(doctorCommand);
}

/**
 * List of all registered command names.
 */
export const registeredCommands = ['init', 'review', 'doctor'] as const;

/**
 * Type for registered command names.
 */
export type RegisteredCommand = (typeof registeredCommands)[number];

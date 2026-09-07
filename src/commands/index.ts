/**
 * Command registry - registers all CLI commands.
 */

import { Command } from 'commander';
import { initCommand } from './init.js';
import { reviewCommand } from './review.js';
import { doctorCommand } from './doctor.js';

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
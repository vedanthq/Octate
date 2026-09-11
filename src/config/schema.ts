import { z } from 'zod';

/**
 * Zod schema for octate.yaml configuration file.
 * Validates all required sections per CONTEXT.md D-07.
 */

export const ReviewConfigSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).default('medium'),
  failOnSeverity: z
    .enum(['critical', 'high', 'medium', 'low', 'info', 'none', 'off'])
    .default('critical'),
  maxFindings: z.number().int().positive().max(100).default(50),
  minConfidence: z.number().min(0).max(1).default(0.6),
});

export const ArchitectureConfigSchema = z
  .union([
    z.object({
      boundaries: z.array(z.string()).default([]),
      forbiddenDependencies: z.array(z.string()).default([]),
    }),
    z.null(),
  ])
  .transform((val) => (val === null ? { boundaries: [], forbiddenDependencies: [] } : val));

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
});

export const OctateConfigSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    project: ProjectConfigSchema,
    review: ReviewConfigSchema.default({
      severity: 'medium',
      failOnSeverity: 'critical',
      maxFindings: 50,
      minConfidence: 0.6,
    }),
    rules: z.array(z.string()).default([]),
    architecture: ArchitectureConfigSchema.default({ boundaries: [], forbiddenDependencies: [] }),
    ignore: z.array(z.string()).default([]),
  })
  .strict();

export type OctateConfig = z.infer<typeof OctateConfigSchema>;
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ArchitectureConfig = z.infer<typeof ArchitectureConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * Default configuration values used when no config file is present.
 * These are the built-in defaults (lowest precedence).
 */
export const DefaultConfig: OctateConfig = {
  version: '1.0.0',
  project: {
    name: 'unnamed-project',
  },
  review: {
    severity: 'medium',
    failOnSeverity: 'critical',
    maxFindings: 50,
    minConfidence: 0.6,
  },
  rules: [],
  architecture: {
    boundaries: [],
    forbiddenDependencies: [],
  },
  ignore: [],
};

/**
 * Compiled schema for AOT validation performance.
 * Use this for repeated validations in hot paths.
 * Note: In Zod v4, compile() is not available; using the schema directly.
 */
export const CompiledOctateConfigSchema = OctateConfigSchema;

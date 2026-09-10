import { CompiledOctateConfigSchema, DefaultConfig, OctateConfigSchema } from './schema.js';

describe('OctateConfigSchema', () => {
  describe('valid configs', () => {
    it('accepts minimal valid config', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test-project' },
      };
      const result = OctateConfigSchema.parse(config);
      expect(result.version).toBe('1.0.0');
      expect(result.project.name).toBe('test-project');
      expect(result.review.severity).toBe('medium');
      expect(result.review.maxFindings).toBe(50);
      expect(result.review.minConfidence).toBe(0.6);
      expect(result.rules).toEqual([]);
      expect(result.architecture.boundaries).toEqual([]);
      expect(result.architecture.forbiddenDependencies).toEqual([]);
      expect(result.ignore).toEqual([]);
    });

    it('accepts full config with all sections', () => {
      const config = {
        version: '2.1.0',
        project: { name: 'my-project' },
        review: { severity: 'high', maxFindings: 30, minConfidence: 0.8 },
        rules: ['rule1', 'rule2'],
        architecture: {
          boundaries: ['src/core', 'src/api'],
          forbiddenDependencies: ['lodash', 'moment'],
        },
        ignore: ['*.generated.ts', 'dist/'],
      };
      const result = OctateConfigSchema.parse(config);
      expect(result.version).toBe('2.1.0');
      expect(result.review.severity).toBe('high');
      expect(result.review.maxFindings).toBe(30);
      expect(result.review.minConfidence).toBe(0.8);
      expect(result.rules).toEqual(['rule1', 'rule2']);
      expect(result.architecture.boundaries).toEqual(['src/core', 'src/api']);
      expect(result.architecture.forbiddenDependencies).toEqual(['lodash', 'moment']);
      expect(result.ignore).toEqual(['*.generated.ts', 'dist/']);
    });

    it('accepts partial review config (merges with defaults)', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        review: { severity: 'critical' },
      };
      const result = OctateConfigSchema.parse(config);
      expect(result.review.severity).toBe('critical');
      expect(result.review.maxFindings).toBe(50); // default
    });

    it('accepts partial architecture config', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        architecture: { boundaries: ['src/core'] },
      };
      const result = OctateConfigSchema.parse(config);
      expect(result.architecture.boundaries).toEqual(['src/core']);
      expect(result.architecture.forbiddenDependencies).toEqual([]);
    });
  });

  describe('invalid configs', () => {
    it('rejects missing version', () => {
      const config = { project: { name: 'test' } };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects invalid version format', () => {
      const config = { version: '1.0', project: { name: 'test' } };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects missing project.name', () => {
      const config = { version: '1.0.0', project: {} };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects empty project.name', () => {
      const config = { version: '1.0.0', project: { name: '' } };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects invalid review.severity', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        review: { severity: 'invalid' },
      };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects negative maxFindings', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        review: { maxFindings: -1 },
      };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects minConfidence below 0', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        review: { minConfidence: -0.1 },
      };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects minConfidence above 1', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        review: { minConfidence: 1.1 },
      };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });

    it('rejects unknown keys (strict mode)', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        unknownKey: 'value',
      };
      expect(() => OctateConfigSchema.parse(config)).toThrow();
    });
  });

  describe('DefaultConfig', () => {
    it('matches schema defaults', () => {
      const result = OctateConfigSchema.parse(DefaultConfig);
      expect(result).toEqual(DefaultConfig);
    });

    it('has correct default values', () => {
      expect(DefaultConfig.version).toBe('1.0.0');
      expect(DefaultConfig.project.name).toBe('unnamed-project');
      expect(DefaultConfig.review.severity).toBe('medium');
      expect(DefaultConfig.review.maxFindings).toBe(50);
      expect(DefaultConfig.review.minConfidence).toBe(0.6);
    });
  });

  describe('CompiledOctateConfigSchema', () => {
    it('validates same as regular schema', () => {
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
      };
      const result = CompiledOctateConfigSchema.parse(config);
      expect(result.project.name).toBe('test');
    });

    it('rejects invalid config', () => {
      const config = { project: { name: 'test' } };
      expect(() => CompiledOctateConfigSchema.parse(config)).toThrow();
    });
  });
});

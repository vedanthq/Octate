/**
 * Benchmark Repository Integrity and Expected Findings Test Suite.
 * Validates the defect benchmark dataset against ground-truth specifications.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

interface BenchmarkDefect {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  category: string;
  severity: string;
  title: string;
  whyItIsRealDefect: string;
  fix: string;
}

interface FalsePositiveTrap {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  apparentCategory: string;
  whyNotDefect: string;
}

interface ExpectedFindingsSchema {
  name: string;
  version: string;
  defects: BenchmarkDefect[];
  falsePositiveTraps: FalsePositiveTrap[];
}

describe('Benchmark Repository Verification (Phase 3)', () => {
  const benchmarkDir = path.resolve(process.cwd(), 'benchmark');
  let benchmarkSchema: ExpectedFindingsSchema;

  it('verifies benchmark directory structure and configuration files exist', async () => {
    const pkgStat = await fs.stat(path.join(benchmarkDir, 'package.json'));
    expect(pkgStat.isFile()).toBe(true);

    const tsconfigStat = await fs.stat(path.join(benchmarkDir, 'tsconfig.json'));
    expect(tsconfigStat.isFile()).toBe(true);

    const octateYamlStat = await fs.stat(path.join(benchmarkDir, 'octate.yaml'));
    expect(octateYamlStat.isFile()).toBe(true);

    const readmeStat = await fs.stat(path.join(benchmarkDir, 'README.md'));
    expect(readmeStat.isFile()).toBe(true);

    const specStat = await fs.stat(path.join(benchmarkDir, 'SPECIFICATION.md'));
    expect(specStat.isFile()).toBe(true);
  });

  it('loads and validates expected-findings.json schema', async () => {
    const raw = await fs.readFile(path.join(benchmarkDir, 'expected-findings.json'), 'utf-8');
    benchmarkSchema = JSON.parse(raw);

    expect(benchmarkSchema.name).toBeDefined();
    expect(benchmarkSchema.defects).toBeInstanceOf(Array);
    expect(benchmarkSchema.falsePositiveTraps).toBeInstanceOf(Array);
    expect(benchmarkSchema.defects.length).toBe(15);
    expect(benchmarkSchema.falsePositiveTraps.length).toBe(5);
  });

  it('verifies all required Correctness defects are present', () => {
    const correctness = benchmarkSchema.defects.filter((d) => d.category === 'correctness');
    expect(correctness.length).toBe(4);

    const ids = correctness.map((d) => d.id);
    expect(ids).toContain('CORR-01'); // Null/undefined failure
    expect(ids).toContain('CORR-02'); // Incorrect conditional logic
    expect(ids).toContain('CORR-03'); // Incorrect return value
    expect(ids).toContain('CORR-04'); // Off-by-one error
  });

  it('verifies all required Security defects are present', () => {
    const security = benchmarkSchema.defects.filter((d) => d.category === 'security');
    expect(security.length).toBe(4);

    const ids = security.map((d) => d.id);
    expect(ids).toContain('SEC-01'); // Command injection
    expect(ids).toContain('SEC-02'); // Path traversal
    expect(ids).toContain('SEC-03'); // Unsafe authorization logic
    expect(ids).toContain('SEC-04'); // Hard-coded secret
  });

  it('verifies all required Reliability defects are present', () => {
    const reliability = benchmarkSchema.defects.filter((d) => d.category === 'reliability');
    expect(reliability.length).toBe(4);

    const ids = reliability.map((d) => d.id);
    expect(ids).toContain('REL-01'); // Swallowed exception
    expect(ids).toContain('REL-02'); // Missing error handling
    expect(ids).toContain('REL-03'); // Resource leak
    expect(ids).toContain('REL-04'); // Race-prone logic
  });

  it('verifies all required Performance defects are present', () => {
    const performance = benchmarkSchema.defects.filter((d) => d.category === 'performance');
    expect(performance.length).toBe(3);

    const ids = performance.map((d) => d.id);
    expect(ids).toContain('PERF-01'); // Accidental O(n^2)
    expect(ids).toContain('PERF-02'); // Repeated expensive computation
    expect(ids).toContain('PERF-03'); // Unnecessary filesystem/network work
  });

  it('verifies all required False-Positive traps are present and documented', () => {
    const traps = benchmarkSchema.falsePositiveTraps;
    expect(traps.length).toBe(5);

    const trapIds = traps.map((t) => t.id);
    expect(trapIds).toContain('FP-TRAP-01'); // Path containment guard
    expect(trapIds).toContain('FP-TRAP-02'); // Allowlist order by query
    expect(trapIds).toContain('FP-TRAP-03'); // Intentional ENOENT check
    expect(trapIds).toContain('FP-TRAP-04'); // Safe sandbox public token
    expect(trapIds).toContain('FP-TRAP-05'); // Bounded 7-day loop (O(n))

    for (const trap of traps) {
      expect(trap.whyNotDefect).toBeTruthy();
      expect(trap.startLine).toBeGreaterThan(0);
      expect(trap.endLine).toBeGreaterThanOrEqual(trap.startLine);
    }
  });

  it('verifies every defect file exists in defects/ and lines match real code', async () => {
    for (const defect of benchmarkSchema.defects) {
      const fullPath = path.join(benchmarkDir, 'defects', defect.file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      expect(lines.length).toBeGreaterThanOrEqual(defect.endLine);
      expect(defect.startLine).toBeGreaterThan(0);
      expect(defect.endLine).toBeGreaterThanOrEqual(defect.startLine);

      // Verify targeted lines contain non-empty code
      const targetLines = lines.slice(defect.startLine - 1, defect.endLine).join('\n').trim();
      expect(targetLines.length).toBeGreaterThan(0);

      // Verify defect metadata is non-empty
      expect(defect.title).toBeTruthy();
      expect(defect.whyItIsRealDefect).toBeTruthy();
      expect(defect.fix).toBeTruthy();
      expect(['critical', 'high', 'medium', 'low']).toContain(defect.severity);
    }
  });

  it('verifies src/ contains the active resolved code matching all fixes', async () => {
    for (const defect of benchmarkSchema.defects) {
      const activePath = path.join(benchmarkDir, defect.file);
      const content = await fs.readFile(activePath, 'utf-8');
      // Assert that resolved annotations or fixes are present in the active source files
      expect(content).toContain(`${defect.id} (RESOLVED)`);
    }
  });

  it('verifies SPECIFICATION.md contains all defect IDs and required sections', async () => {
    const specContent = await fs.readFile(path.join(benchmarkDir, 'SPECIFICATION.md'), 'utf-8');

    for (const defect of benchmarkSchema.defects) {
      expect(specContent).toContain(`Bug ID: ${defect.id}`);
      expect(specContent).toContain(defect.file);
      expect(specContent).toContain(defect.category);
      expect(specContent).toContain(defect.severity);
      expect(specContent).toContain('Why it is a real defect:');
    }

    for (const trap of benchmarkSchema.falsePositiveTraps) {
      expect(specContent).toContain(`Trap ID: ${trap.id}`);
      expect(specContent).toContain(trap.file);
      expect(specContent).toContain('Why it is NOT a defect:');
    }
  });
});

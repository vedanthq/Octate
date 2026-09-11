import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMockFinding, createMockReviewResult } from '../application/__tests__/mocks.js';
import { SarifRenderer, severityToSarifLevel } from './sarif.js';

class MemoryWritable extends Writable {
  public content = '';

  public override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.content += chunk.toString();
    callback();
  }
}

describe('renderers:sarif', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'octate-sarif-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('severityToSarifLevel', () => {
    it('maps critical and high to error', () => {
      expect(severityToSarifLevel('critical')).toBe('error');
      expect(severityToSarifLevel('high')).toBe('error');
    });

    it('maps medium to warning', () => {
      expect(severityToSarifLevel('medium')).toBe('warning');
    });

    it('maps low and info to note', () => {
      expect(severityToSarifLevel('low')).toBe('note');
      expect(severityToSarifLevel('info')).toBe('note');
    });
  });

  it('renders valid SARIF v2.1.0 log with driver metadata', async () => {
    const stream = new MemoryWritable();
    const renderer = new SarifRenderer({ stream });
    const mockResult = createMockReviewResult([
      createMockFinding('high', {
        title: 'Hardcoded secret',
        message: 'AWS key detected in source',
        file: 'src/aws.ts',
        startLine: 12,
        category: 'security',
      }),
      createMockFinding('medium', {
        title: 'High cyclomatic complexity',
        message: 'Function exceeds complexity threshold',
        file: 'src/parser.ts',
        startLine: 88,
        category: 'maintainability',
      }),
      createMockFinding('low', {
        title: 'Unused import',
        message: 'Module is imported but never referenced',
        file: 'src/utils.ts',
        startLine: 3,
        category: 'maintainability',
      }),
    ]);

    await renderer.render(mockResult);

    const sarif = JSON.parse(stream.content);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toBe('http://json.schemastore.org/sarif-2.1.0.json');
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0];
    expect(run.tool.driver.name).toBe('Octate');
    expect(run.tool.driver.version).toBe('0.1.0');
    expect(run.tool.driver.informationUri).toBe('https://octate.dev');

    // Distinct rules registered for security and maintainability
    const ruleIds = run.tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ruleIds).toContain('security');
    expect(ruleIds).toContain('maintainability');
    expect(ruleIds).toHaveLength(2);

    // Results mapping
    expect(run.results).toHaveLength(3);
    const [first, second, third] = run.results;

    expect(first.ruleId).toBe('security');
    expect(first.level).toBe('error');
    expect(first.message.text).toBe('AWS key detected in source');
    expect(first.locations[0].physicalLocation.artifactLocation.uri).toBe('src/aws.ts');
    expect(first.locations[0].physicalLocation.region.startLine).toBe(12);

    expect(second.ruleId).toBe('maintainability');
    expect(second.level).toBe('warning');

    expect(third.ruleId).toBe('maintainability');
    expect(third.level).toBe('note');
  });

  it('renders valid SARIF on empty findings without crashing', async () => {
    const stream = new MemoryWritable();
    const renderer = new SarifRenderer({ stream });
    const mockResult = createMockReviewResult([]);

    await renderer.render(mockResult);

    const sarif = JSON.parse(stream.content);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results).toEqual([]);
    expect(sarif.runs[0].tool.driver.rules).toEqual([]);
  });

  it('writes SARIF output to target file creating parent directories', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const outputFile = join(tempDir, 'ci', 'artifacts', 'results.sarif');
    const renderer = new SarifRenderer({ outputFile });
    const mockResult = createMockReviewResult([createMockFinding('critical')]);

    await renderer.render(mockResult);

    const content = await fs.readFile(outputFile, 'utf-8');
    const sarif = JSON.parse(content);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results).toHaveLength(1);
    expect(stderrSpy).toHaveBeenCalledWith(`Wrote results to ${outputFile}\n`);
  });

  it('falls back to finding.line or 1 if startLine is undefined', async () => {
    const stream = new MemoryWritable();
    const renderer = new SarifRenderer({ stream });
    const mockFinding = createMockFinding('high', {
      line: 25,
    });
    delete (mockFinding as { startLine?: number }).startLine;
    const mockResult = createMockReviewResult([mockFinding]);

    await renderer.render(mockResult);

    const sarif = JSON.parse(stream.content);
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(25);
  });
});

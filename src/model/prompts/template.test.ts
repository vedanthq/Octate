import { describe, expect, it } from '@jest/globals';
import { renderTemplate } from './template.js';

describe('renderTemplate', () => {
  it('interpolates simple variables', () => {
    const result = renderTemplate('Hello {{name}}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('interpolates multiple variables', () => {
    const result = renderTemplate('{{greeting}} {{name}}! Count: {{count}}', {
      greeting: 'Hi',
      name: 'Alice',
      count: 42,
    });
    expect(result).toBe('Hi Alice! Count: 42');
  });

  it('replaces undefined and null variables with empty string', () => {
    const result = renderTemplate('A: {{a}}, B: {{b}}, C: {{c}}', {
      a: undefined,
      b: null,
    });
    expect(result).toBe('A: , B: , C: ');
  });

  it('joins array variables when interpolated as simple variable', () => {
    const result = renderTemplate('Rules:\n{{rules}}', {
      rules: ['rule1', 'rule2'],
    });
    expect(result).toBe('Rules:\nrule1\nrule2');
  });

  it('handles empty template or falsy input', () => {
    expect(renderTemplate('', { name: 'World' })).toBe('');
  });

  it('renders list iteration blocks with {{.}}', () => {
    const template = '{{#rules}}\n- {{.}}\n{{/rules}}';
    const result = renderTemplate(template, { rules: ['rule1', 'rule2'] });
    expect(result).toBe('\n- rule1\n\n- rule2\n');
  });

  it('omits list iteration blocks when list is empty or undefined', () => {
    const template = 'Before{{#rules}}\n- {{.}}\n{{/rules}}After';
    expect(renderTemplate(template, { rules: [] })).toBe('BeforeAfter');
    expect(renderTemplate(template, {})).toBe('BeforeAfter');
    expect(renderTemplate(template, { rules: null })).toBe('BeforeAfter');
  });

  it('renders list iteration with objects and property placeholders', () => {
    const template = '{{#items}}Item: {{title}} ({{id}})\n{{/items}}';
    const result = renderTemplate(template, {
      items: [
        { id: 1, title: 'First' },
        { id: 2, title: 'Second' },
      ],
    });
    expect(result).toBe('Item: First (1)\nItem: Second (2)\n');
  });

  it('does not re-interpolate variables within variable contents (single pass protection)', () => {
    const result = renderTemplate('Hello {{name}}', {
      name: '{{maliciousVariable}}',
      maliciousVariable: 'INJECTED',
    });
    expect(result).toBe('Hello {{maliciousVariable}}');
  });
});

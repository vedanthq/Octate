/**
 * Lightweight template interpolation engine for prompt templates.
 * Zero external dependencies. Performs single-pass replacements.
 */

/**
 * Renders a prompt template by interpolating variables and list loops.
 *
 * Syntax supported:
 * - `{{key}}`: Replaces with `String(data[key] ?? '')`.
 * - `{{#key}}...{{/key}}`: List iteration block. If `data[key]` is an array of strings/items,
 *   repeats the inner block for each item, replacing `{{.}}` with the item value.
 *   If the array is empty or undefined/falsy, replaces the entire block with an empty string.
 *
 * @param template - The raw template string
 * @param data - The data dictionary used for interpolation
 * @returns The rendered template string
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  if (!template) {
    return '';
  }

  // 1. Process block loops: {{#key}}innerContent{{/key}}
  // Non-greedy match on inner content
  const blockRegex = /\{\{#([a-zA-Z0-9_-]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

  let rendered = template.replace(blockRegex, (_match, key: string, inner: string) => {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map((item) => {
          if (typeof item === 'object' && item !== null) {
            let itemBlock = inner;
            for (const [propKey, propVal] of Object.entries(item as Record<string, unknown>)) {
              itemBlock = itemBlock.replaceAll(`{{${propKey}}}`, String(propVal ?? ''));
            }
            return itemBlock.replaceAll('{{.}}', String(item));
          }
          return inner.replaceAll('{{.}}', String(item ?? ''));
        })
        .join('');
    }
    return '';
  });

  // 2. Process variable substitutions: {{key}}
  const varRegex = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
  rendered = rendered.replace(varRegex, (_match, key: string) => {
    const val = data[key];
    if (val === undefined || val === null) {
      return '';
    }
    if (Array.isArray(val)) {
      return val.join('\n');
    }
    return String(val);
  });

  return rendered;
}

/**
 * Tree-sitter query definitions for symbol extraction.
 */

export const queries = {
  typescript: {
    functions: `
      (function_declaration name: (identifier) @name) @symbol
      (arrow_function
        (identifier) @name
        (#not-has-parent? @name parenthesized_expression)) @symbol
      (function_expression name: (identifier) @name) @symbol
      (method_definition name: (property_identifier) @name) @symbol
    `,
    classes: `
      (class_declaration name: (type_identifier) @name) @symbol
    `,
    interfaces: `
      (interface_declaration name: (type_identifier) @name) @symbol
    `,
    types: `
      (type_alias_declaration name: (type_identifier) @name) @symbol
    `,
    variables: `
      (variable_declarator name: (identifier) @name) @symbol
    `,
    imports: `
      (import_statement) @symbol
    `,
    exports: `
      (export_statement) @symbol
    `,
  },
  javascript: {
    functions: `
      (function_declaration name: (identifier) @name) @symbol
      (arrow_function
        (identifier) @name
        (#not-has-parent? @name parenthesized_expression)) @symbol
      (function_expression name: (identifier) @name) @symbol
      (method_definition name: (property_identifier) @name) @symbol
    `,
    classes: `
      (class_declaration name: (type_identifier) @name) @symbol
    `,
    variables: `
      (variable_declarator name: (identifier) @name) @symbol
    `,
    imports: `
      (import_statement) @symbol
    `,
    exports: `
      (export_statement) @symbol
    `,
  },
  python: {
    functions: `
      (function_definition name: (identifier) @name) @symbol
    `,
    classes: `
      (class_definition name: (identifier) @name) @symbol
    `,
    variables: `
      (assignment left: (identifier) @name) @symbol
    `,
    imports: `
      (import_statement) @symbol
      (import_from_statement) @symbol
    `,
  },
};

export type Queries = typeof queries;

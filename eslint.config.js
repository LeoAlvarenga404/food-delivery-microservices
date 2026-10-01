import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { noCommentsRule } from '@fd/tooling/eslint-rules';

const forbiddenIdentifiers = [
  'data',
  'info',
  'obj',
  'value',
  'tmp',
  'temp',
  'val',
  'arr',
  'str',
  'num',
  'args',
  'e',
  'err',
  'req',
  'res',
  'cb',
  'ctx',
  'tx',
  'db',
  'msg',
  'evt',
  'cfg',
];

const genericTypeNames = '^I[A-Z]|(Impl|Manager|Helper|Helpers|Util|Utils)$';
const forbiddenIdentifierPattern = `^(${forbiddenIdentifiers.join('|')})$`;

const namingConventionOptions = [
  { selector: 'default', format: ['camelCase'] },
  { selector: 'import', format: ['camelCase', 'PascalCase'] },
  {
    selector: [
      'variable',
      'function',
      'parameter',
      'parameterProperty',
      'classProperty',
      'classMethod',
      'typeProperty',
      'typeMethod',
      'accessor',
    ],
    format: ['camelCase'],
    custom: { regex: forbiddenIdentifierPattern, match: false },
  },
  { selector: 'typeLike', format: ['PascalCase'] },
  {
    selector: ['class', 'interface', 'typeAlias'],
    format: ['PascalCase'],
    custom: { regex: genericTypeNames, match: false },
  },
  {
    selector: ['variable', 'parameter', 'classProperty', 'typeProperty', 'accessor'],
    types: ['boolean'],
    format: ['PascalCase'],
    prefix: ['is', 'has', 'can', 'should', 'was'],
  },
  { selector: 'objectLiteralProperty', format: ['camelCase', 'UPPER_CASE'] },
  {
    selector: ['objectLiteralProperty', 'typeProperty'],
    modifiers: ['requiresQuotes'],
    format: null,
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      prettierConfig,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    plugins: { fd: { rules: { 'no-comments': noCommentsRule } } },
    rules: {
      'fd/no-comments': 'error',
      'id-length': ['error', { min: 2, properties: 'never' }],
      'max-depth': ['error', 2],
      complexity: ['error', 8],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
        { selector: "ExportSpecifier[exported.name='default']", message: 'Use named exports.' },
      ],
      '@typescript-eslint/max-params': ['error', { max: 3 }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/naming-convention': ['error', ...namingConventionOptions],
    },
  },
  {
    files: ['**/*.value-object.ts', '**/*.persistence-mapper.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
  },
  {
    files: ['tooling/src/eslint/*.rule.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        ...namingConventionOptions,
        { selector: 'objectLiteralMethod', format: ['camelCase', 'PascalCase'] },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.contract.ts', '**/*.builder.ts'],
    rules: { 'max-lines-per-function': 'off', 'max-lines': 'off' },
  },
  {
    files: ['**/vitest.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);

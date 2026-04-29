import js from '@eslint/js'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import securityPlugin from 'eslint-plugin-security'
import unicornPlugin from 'eslint-plugin-unicorn'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      import: importPlugin,
      security: securityPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      'no-console': 'warn',
      'import/order': [
        'warn',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'security/detect-object-injection': 'off',
      'unicorn/prefer-node-protocol': 'error',
    },
  },
]

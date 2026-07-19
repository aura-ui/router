import js from '@eslint/js'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import securityPlugin from 'eslint-plugin-security'
import unicornPlugin from 'eslint-plugin-unicorn'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist/**',
      'dist-demo/**',
      'node_modules/**',
      '.vite/**',
      'bench/**',
      'coverage/**',
      'scripts/**',
      'vite.config.ts',
      'vite.lib.config.ts',
      'jest.config.cjs',
    ],
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
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
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
  {
    files: ['**/test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.jest.json',
        projectService: false,
      },
    },
  },
]

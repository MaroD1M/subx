import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      '.test-artifacts/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
      'docs/archive/diagnostic-samples/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue']
      }
    }
  },
  {
    rules: {
      'no-console': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'no-undef': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'off'
    }
  }
)

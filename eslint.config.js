import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'eslint.config.js'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `_name` marks a deliberately unused binding; `ignoreRestSiblings` allows
      // the standard "omit these keys" destructuring idiom.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Serverless functions: Node globals, and their own tsconfig. The project
    // service only discovers tsconfig.json, which covers `src` alone, so this
    // block has to name tsconfig.api.json explicitly. It comes last so it
    // overrides the browser defaults set above.
    files: ['api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: false,
        project: './tsconfig.api.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)

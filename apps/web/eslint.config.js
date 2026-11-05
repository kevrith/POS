import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage'] },
  {
    files: ['src/**/*.{ts,tsx}', '*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.es2020 } },
    rules: {
      // Classic hook rules only: the React Compiler rules in the v7 preset assume the compiler is in use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // tsc already enforces unused locals/params (noUnusedLocals / noUnusedParameters).
      '@typescript-eslint/no-unused-vars': 'off',
      // The API layer is loosely typed by design (see lib/api.ts); `any` is tracked, not blocked.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);

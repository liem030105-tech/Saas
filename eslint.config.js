// Root ESLint flat config, shared by every package (FOUNDATION-001).
// Packages run `eslint .` from their own folder; ESLint finds this file by walking up.
// Boundaries enforced here: CLAUDE.md §3, docs/architecture/overview.md, frontend.md, backend.md.
import js from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

const ROOT = import.meta.dirname;
const FE = 'Trello-Clone-FE';
const BE = 'Trello-Clone-BE';
const SHARED = 'packages/shared';

const FE_IMPORTS_BE = {
  group: ['@trello-clone/api', '@trello-clone/api/*', `**/${BE}/**`],
  message: 'FE and BE never import each other; they talk over HTTP/WebSocket (CLAUDE.md §3).',
};
const BE_IMPORTS_FE = {
  group: ['@trello-clone/web', '@trello-clone/web/*', `**/${FE}/**`],
  message: 'FE and BE never import each other; they talk over HTTP/WebSocket (CLAUDE.md §3).',
};
const SHARED_INTERNALS = {
  group: ['@trello-clone/shared/*'],
  message: 'Import only from "@trello-clone/shared" (its single entry point).',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: ROOT },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: [`${FE}/tsconfig.json`, `${BE}/tsconfig.json`, `${SHARED}/tsconfig.json`],
        }),
      ],
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // Frontend: no BE imports; layers only import downwards; other features only via their index.ts.
  {
    files: [`${FE}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            FE_IMPORTS_BE,
            SHARED_INTERNALS,
            {
              group: ['@/features/*/*'],
              message: 'Import another feature only through its index.ts ("@/features/<name>").',
            },
          ],
        },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: ROOT,
          zones: [
            {
              target: ['components', 'hooks', 'lib', 'config', 'stores'].map(
                (dir) => `./${FE}/src/${dir}`,
              ),
              from: ['features', 'pages', 'app', 'routes'].map((dir) => `./${FE}/src/${dir}`),
              message:
                'Shared layers must not import features, pages, routes, or app (frontend.md → import direction).',
            },
            {
              target: `./${FE}/src/features`,
              from: [`./${FE}/src/pages`, `./${FE}/src/app`, `./${FE}/src/routes`],
              message: 'Features must not import pages, routes, or app; compose features in pages.',
            },
          ],
        },
      ],
    },
  },

  // Backend: no FE imports; another module is reached only through its service.
  {
    files: [`${BE}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            BE_IMPORTS_FE,
            SHARED_INTERNALS,
            {
              group: [
                '../*/*.repository',
                '../*/*.controller',
                '../*/*.routes',
                '../*/*.schema',
                '../*/*.mapper',
              ],
              message: 'Call another module only through its service (backend.md → cross-module).',
            },
          ],
        },
      ],
    },
  },

  // Shared: imports neither side and no framework code (overview.md → packages/shared).
  {
    files: [`${SHARED}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            FE_IMPORTS_BE,
            BE_IMPORTS_FE,
            {
              group: ['express', 'react', 'react-dom', '@prisma/*', 'prisma', 'socket.io*'],
              message: 'Shared holds only Zod schemas, types, constants, and pure helpers.',
            },
          ],
        },
      ],
    },
  },
);

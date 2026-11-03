// Aturan struktur mengikuti bulletproof-react (github.com/alan2207/bulletproof-react):
// - arah impor satu arah: bagian bersama -> features -> app
// - satu fitur tidak boleh mengimpor fitur lain; gabungkan di app/
// - nama berkas dan folder kebab-case
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import checkFile from 'eslint-plugin-check-file'
import prettier from 'eslint-config-prettier'

const features = readdirSync(join(import.meta.dirname, 'src/features'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const shared = ['./src/components', './src/hooks', './src/lib', './src/types', './src/utils', './src/config']

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      import: importPlugin,
      'check-file': checkFile,
    },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' }, node: true },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],

      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            ...features.map((name) => ({
              target: `./src/features/${name}`,
              from: './src/features',
              except: [`./${name}`],
              message: 'Fitur tidak boleh mengimpor fitur lain. Gabungkan keduanya di app/ atau pindahkan ke bagian bersama.',
            })),
            { target: './src/features', from: './src/app', message: 'features tidak boleh mengimpor dari app/.' },
            {
              target: shared,
              from: ['./src/features', './src/app'],
              message: 'Bagian bersama tidak boleh bergantung pada features atau app/.',
            },
          ],
        },
      ],

      'check-file/filename-naming-convention': [
        'error',
        { 'src/**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { 'src/{components,features,hooks,lib,utils,config,types,testing,scripts}/**/': 'KEBAB_CASE' },
      ],
    },
  },
  prettier,
)

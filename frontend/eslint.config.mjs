import { FlatCompat } from '@eslint/eslintrc';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  resolvePluginsRelativeTo: dirname(require.resolve('eslint-config-next/package.json')),
});

const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'src/generated/**'] },
  ...compat.extends('next/core-web-vitals'),
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
];

export default config;

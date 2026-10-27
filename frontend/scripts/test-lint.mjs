import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');

function lint(source, extra = []) {
  const result = spawnSync(process.execPath, [
    cli, '--stdin', '--stdin-filename', 'src/LintFixture.tsx', '--max-warnings', '5', ...extra,
  ], { cwd: root, input: source, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  assert.notEqual(result.signal, 'SIGTERM', 'Lint cannot pass by timing out');
  return result;
}

test('production command and scope retain the framework config and explicit warning ceiling', async () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.lint, 'eslint . --max-warnings 5');
  assert.equal(manifest.devDependencies['@eslint/eslintrc'], '3.3.5');
  const eslint = new ESLint({ cwd: root });
  for (const file of ['src/app/upload/page.tsx', 'src/components/common/TooltipHelp.tsx', 'src/hooks/useAdvisor.ts']) {
    assert.equal(await eslint.isPathIgnored(join(root, file)), false);
    const config = await eslint.calculateConfigForFile(join(root, file));
    assert.equal(config.rules['react-hooks/rules-of-hooks'][0], 2);
    assert.equal(config.rules['react-hooks/exhaustive-deps'][0], 1);
    assert.equal(config.rules['@next/next/no-html-link-for-pages'][0], 2);
    assert.equal(config.linterOptions.reportUnusedDisableDirectives, 2);
  }
  assert.equal(await eslint.isPathIgnored(join(root, 'src/generated/api-types.ts')), true);
});

test('real CLI accepts a valid TSX component without an interactive setup', () => {
  const result = lint('export default function Fixture() { return <main>Ready</main> }');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /How would you like|configure ESLint/);
});

test('real CLI rejects conditional hooks matching the tooltip regression', () => {
  const result = lint("import { useCallback } from 'react'; export default function Fixture({text}: {text?: string}) { if (!text) return null; const show = useCallback(() => {}, []); return <button onClick={show}>{text}</button> }");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /react-hooks\/rules-of-hooks/);
});

test('real CLI rejects JSX source errors instead of suppressing the rule', () => {
  const result = lint("export default function Fixture() { return <p>Don't</p> }");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /react\/no-unescaped-entities/);
});

test('unused suppressions are errors, not a route to silent configuration drift', () => {
  const result = lint('// eslint-disable-next-line react-hooks/rules-of-hooks\nexport default function Fixture() { return null }');
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Unused eslint-disable directive/);
});

test('existing warning severity stays visible and a sixth warning fails', () => {
  const fixture = count => "import { useEffect } from 'react';\n" + Array.from({ length: count }, (_, i) =>
    `export function Fixture${i}({value}: {value: string}) { useEffect(() => { console.log(value) }, []); return null }`,
  ).join('\n');
  const within = lint(fixture(5));
  assert.equal(within.status, 0, within.stdout + within.stderr);
  assert.match(within.stdout + within.stderr, /react-hooks\/exhaustive-deps/);
  const over = lint(fixture(6));
  assert.equal(over.status, 1);
  assert.match(over.stdout + over.stderr, /too many warnings/i);
});

test('invalid configuration is a failure rather than an interactive fallback', () => {
  const result = lint('export default function Fixture() { return null }', ['--config', 'missing-audit-config.mjs']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ENOENT|Cannot find/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tailwind = createRequire(require.resolve('tailwindcss/package.json'));
const nextLint = createRequire(require.resolve('eslint-config-next/package.json'));
const plugin = createRequire(nextLint.resolve('@next/eslint-plugin-next'));
const glob = createRequire(tailwind.resolve('fast-glob'));
const lintGlob = createRequire(plugin.resolve('fast-glob'));
const match = createRequire(glob.resolve('micromatch'));
const lintMatch = createRequire(lintGlob.resolve('micromatch'));
const watch = createRequire(tailwind.resolve('chokidar'));
const braces = match('braces');
const nested = (depth, open = '{', close = '}') => open.repeat(depth) + 'x' + close.repeat(depth);
const methods = ['parse', 'compile', 'expand', 'stringify'];

test('undoing the patch reproduces the missing limit and constrained-stack failure', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'pinsight-braces-control-'));
  const installed = dirname(match.resolve('braces'));
  try {
    cpSync(installed, fixture, { recursive: true });
    mkdirSync(join(fixture, 'node_modules'), { recursive: true });
    const helper = createRequire(match.resolve('braces'));
    symlinkSync(dirname(helper.resolve('fill-range')), join(fixture, 'node_modules/fill-range'), 'dir');
    const patch = join(dirname(fileURLToPath(import.meta.url)), '../patches/braces@3.0.3.patch');
    const undo = spawnSync('git', ['apply', '--reverse', patch], {
      cwd: fixture, encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(undo.error);
    assert.equal(undo.status, 0, undo.stderr);
    const original = require(join(fixture, 'index.js'));
    assert.doesNotThrow(() => original.parse(nested(101)));
    for (const [entry, expected] of [[join(fixture, 'index.js'), /Maximum call stack/],
      [match.resolve('braces'), /exceeds max depth/]]) {
      const probe = spawnSync(process.execPath, ['--stack-size=256', '-e', `
        const braces = require(${JSON.stringify(entry)});
        try { braces.compile('{'.repeat(4000) + 'x' + '}'.repeat(4000)); }
        catch (error) { process.stdout.write(error.name + ': ' + error.message); }
      `], { encoding: 'utf8', timeout: 5000 });
      assert.ifError(probe.error);
      assert.equal(probe.status, 0, probe.stderr);
      assert.match(probe.stdout, expected);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('all installed glob/watch consumers resolve the same patched helper', () => {
  const paths = [match, lintMatch, watch].map(r => r.resolve('braces'));
  assert.equal(new Set(paths).size, 1);
  for (const consumer of [match, lintMatch, watch]) {
    assert.throws(() => consumer('braces').parse(nested(101)), /exceeds max depth/);
  }
  assert.deepEqual(glob('micromatch')(['src/a.ts', 'src/b.tsx', 'src/c.css'], 'src/*.{ts,tsx}'),
    ['src/a.ts', 'src/b.tsx']);
});

test('string APIs accept the boundary and reject excessive brace/parenthesis nesting', () => {
  for (const [open, close] of [['{', '}'], ['(', ')'], ['{(', ')}']]) {
    const boundary = open.length === 1 ? 100 : 50;
    for (const method of methods) {
      assert.doesNotThrow(() => braces[method](nested(boundary, open, close)));
      for (const depth of [boundary + 1, 1000, 4000]) {
        const pattern = nested(depth, open, close);
        if (pattern.length > 10000) continue;
        assert.throws(() => braces[method](pattern), {
          name: 'SyntaxError', message: /exceeds max depth/,
        });
      }
    }
  }
});

test('caller depth options cannot disable the ceiling or evade fractional limits', () => {
  for (const method of methods) {
    for (const maxDepth of [undefined, Infinity, NaN, 1000000]) {
      assert.throws(() => braces[method](nested(101), { maxDepth }), /exceeds max depth/);
    }
    for (const maxDepth of [0, -1, 1, 1.5]) {
      assert.throws(() => braces[method](nested(2), { maxDepth }), /exceeds max depth/);
    }
    assert.doesNotThrow(() => braces[method](nested(1), { maxDepth: 1.5 }));
  }
});

function ast(depth) {
  const root = { type: 'root', nodes: [] };
  let parent = root;
  for (let i = 0; i < depth; i++) {
    const child = { type: 'paren', nodes: [], parent };
    parent.nodes.push(child);
    parent = child;
  }
  parent.nodes.push({ type: 'text', value: 'x', parent });
  return root;
}

test('direct ASTs and cyclic links cannot bypass guarded recursive walkers', () => {
  for (const method of ['compile', 'expand', 'stringify']) {
    assert.doesNotThrow(() => braces[method](ast(100)));
    for (const depth of [101, 4000]) {
      assert.throws(() => braces[method](ast(depth)), {
        name: 'RangeError', message: /exceeds max depth/,
      });
    }
    const cycle = { type: 'root', nodes: [] };
    cycle.nodes.push(cycle);
    assert.throws(() => braces[method](cycle), /exceeds max depth/);
  }
  const child = { type: 'paren', nodes: [] };
  child.parent = child;
  assert.throws(() => braces.expand({ type: 'root', nodes: [child] }), /parent chain contains a cycle/);
});

test('ordinary ranges, escaped literals and stringify invalid-brace behavior are retained', () => {
  assert.deepEqual(braces.expand('src/{a,b}/{1..2}.ts'),
    ['src/a/1.ts', 'src/a/2.ts', 'src/b/1.ts', 'src/b/2.ts']);
  assert.equal(braces.compile('src/{a,b}.ts'), 'src/(a|b).ts');
  for (const pattern of ['{{a}}', '{1..8}', '{a,{b}}', '{{x}y}', '{a,{b,{c}}', '{}{a}']) {
    assert.equal(braces.stringify(pattern, { escapeInvalid: true }), pattern);
  }
  assert.deepEqual(braces.expand('a/\\{b,c\\}/d'), ['a/{b,c}/d']);
  assert.doesNotThrow(() => braces.parse(`"${'{'.repeat(200)}"`));
  assert.doesNotThrow(() => braces.parse(`[${'{'.repeat(200)}]`));
});

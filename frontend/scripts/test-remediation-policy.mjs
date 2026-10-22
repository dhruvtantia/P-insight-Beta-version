import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { evaluateAudit, inspectRemediation, validatePolicy, verifyLock, verifyPackage } from './remediation-policy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(readFileSync(join(root, 'security/braces-remediation.json'), 'utf8'));
const lock = yaml.load(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
const workspace = yaml.load(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
const now = Date.parse(policy.reviewedAt) + 86400000;
const evidence = { packageCount: Object.keys(lock.packages).length };
const copy = value => structuredClone(value);
const require = createRequire(import.meta.url);
const tailwind = createRequire(require.resolve('tailwindcss'));
const matcher = createRequire(tailwind.resolve('micromatch'));
const installed = dirname(matcher.resolve('braces'));

function report() {
  return { advisories: { fixture: {
    ...policy.reviewedAdvisory,
    github_advisory_id: policy.advisory, module_name: policy.package,
    url: `https://github.com/advisories/${policy.advisory}`,
    findings: [{ version: policy.version, paths: copy(policy.paths), dev: true, optional: false, bundled: false }],
  } }, metadata: { totalDependencies: evidence.packageCount,
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } };
}

test('real installed bytes, patch digest, consumers and runtime closure verify', () => {
  assert.deepEqual(inspectRemediation(root, policy, now), { ...evidence, consumers: 4 });
  assert.equal(evaluateAudit(report(), 1, policy, evidence, now).status, 'verified-local-backport');
  assert.equal(evaluateAudit(report(), 1, policy, evidence, now).knownMatches, 1);
});

for (const [name, change] of [
  ['unapproved policy', p => { p.status = 'proposed'; }],
  ['wrong advisory', p => { p.advisory = 'GHSA-0000-0000-0000'; }],
  ['wrong version', p => { p.version = '3.0.2'; }],
  ['wrong owner', p => { p.owner = ''; }],
  ['wrong upstream revision', p => { p.upstreamCommit = '0'.repeat(40); }],
  ['different patch path', p => { p.patch = '../other.patch'; }],
  ['invalid review date', p => { p.expiresAt = 'not-a-date'; }],
  ['unbounded review period', p => { p.expiresAt = '2030-01-01T00:00:00Z'; }],
  ['duplicate scope', p => { p.paths[0] = p.paths[1]; }],
]) {
  test(`policy rejects ${name}`, () => {
    const candidate = copy(policy);
    change(candidate);
    assert.throws(() => validatePolicy(candidate, now));
    assert.throws(() => evaluateAudit(report(), 1, candidate, evidence, now));
  });
}

test('approval expires exactly at its deadline and cannot be future-dated', () => {
  const end = Date.parse(policy.expiresAt);
  assert.doesNotThrow(() => validatePolicy(policy, end - 1));
  assert.throws(() => validatePolicy(policy, end));
  assert.throws(() => validatePolicy(policy, Date.parse(policy.reviewedAt) - 1));
});

for (const [name, change] of [
  ['missing patch registration', (l, w) => { delete w.patchedDependencies; }],
  ['wrong locked digest', l => { l.patchedDependencies['braces@3.0.3'] = '0'.repeat(64); }],
  ['permitted unused patch', (l, w) => { w.allowUnusedPatches = true; }],
  ['hidden advisory setting', (l, w) => { w.auditConfig = { ignoreGhsas: [policy.advisory] }; }],
  ['alternate audit filter', (l, w) => { w.audit = { ignore: [policy.advisory] }; }],
  ['extra affected version', l => { l.packages['braces@3.0.2'] = {}; }],
  ['unpatched consumer', l => {
    const node = Object.values(l.snapshots).find(n => n.dependencies?.braces);
    node.dependencies.braces = '3.0.3';
  }],
  ['direct production dependency', l => {
    l.importers['.'].dependencies.braces = { version: `3.0.3(patch_hash=${policy.patchSha256})` };
  }],
  ['indirect optional production dependency', l => {
    const next = Object.keys(l.snapshots).find(k => k.startsWith('next@'));
    l.snapshots[next].optionalDependencies.braces = `3.0.3(patch_hash=${policy.patchSha256})`;
  }],
  ['unknown runtime closure', l => { l.importers['.'].dependencies.unknown = { version: '1.0.0' }; }],
]) {
  test(`lock verification rejects ${name}`, () => {
    const candidate = copy(lock), config = copy(workspace);
    change(candidate, config);
    assert.throws(() => verifyLock(candidate, config, policy));
  });
}

for (const kind of ['changed-code', 'extra-code', 'missing-code', 'symlink-code']) {
  test(`installed package rejects ${kind}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'pinsight-package-bytes-'));
    try {
      cpSync(installed, fixture, { recursive: true });
      if (kind === 'changed-code') writeFileSync(join(fixture, 'index.js'), '// changed\n');
      if (kind === 'extra-code') writeFileSync(join(fixture, 'extra.js'), '// extra\n');
      if (kind === 'missing-code') unlinkSync(join(fixture, 'lib/compile.js'));
      if (kind === 'symlink-code') {
        unlinkSync(join(fixture, 'lib/compile.js'));
        symlinkSync(join(installed, 'lib/compile.js'), join(fixture, 'lib/compile.js'));
      }
      assert.throws(() => verifyPackage(fixture, policy));
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
}

for (const kind of ['missing-patch', 'changed-patch', 'symlink-patch']) {
  test(`filesystem inspection rejects ${kind}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'pinsight-remediation-files-'));
    try {
      for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
        cpSync(join(root, file), join(fixture, file));
      }
      mkdirSync(join(fixture, 'patches'));
      symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
      if (kind === 'changed-patch') writeFileSync(join(fixture, policy.patch), '// wrong bytes\n');
      if (kind === 'symlink-patch') symlinkSync(join(root, policy.patch), join(fixture, policy.patch));
      assert.throws(() => inspectRemediation(fixture, policy, now));
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
}

for (const [name, change] of [
  ['another GHSA', r => { r.advisories.fixture.github_advisory_id = 'GHSA-0000-0000-0000'; }],
  ['another package', r => { r.advisories.fixture.module_name = 'next'; }],
  ['different affected version', r => { r.advisories.fixture.findings[0].version = '3.0.2'; }],
  ['new dependency path', r => { r.advisories.fixture.findings[0].paths[0] = '.>unreviewed>braces'; }],
  ['runtime exposure', r => { r.advisories.fixture.findings[0].dev = false; }],
  ['bundled exposure', r => { r.advisories.fixture.findings[0].bundled = true; }],
  ['changed upstream scope', r => { r.advisories.fixture.vulnerable_versions = '*'; }],
  ['changed advisory text', r => { r.advisories.fixture.title = 'new vector'; }],
  ['duplicate findings', r => { r.advisories.fixture.findings.push(copy(r.advisories.fixture.findings[0])); }],
  ['new advisory', r => {
    r.advisories.other = { ...copy(r.advisories.fixture), github_advisory_id: 'GHSA-0000-0000-0000' };
    r.metadata.vulnerabilities.high = 2;
  }],
  ['missing counts', r => { delete r.metadata.vulnerabilities; }],
  ['wrong counts', r => { r.metadata.vulnerabilities.high = 0; }],
  ['hidden severity', r => { r.metadata.vulnerabilities.high = 0; r.metadata.vulnerabilities.low = 1; }],
  ['unknown severity', r => { r.metadata.vulnerabilities.unknown = 0; }],
  ['partial package coverage', r => { r.metadata.totalDependencies = 1; }],
  ['error response', r => { r.error = 'registry failed'; }],
  ['malformed advisories', r => { r.advisories = []; }],
]) {
  test(`audit decision rejects ${name}`, () => {
    const candidate = report();
    change(candidate);
    assert.throws(() => evaluateAudit(candidate, 1, policy, evidence, now));
  });
}

test('audit process errors cannot become a clean or remediated success', () => {
  for (const status of [null, 0, 2, 127]) {
    assert.throws(() => evaluateAudit(report(), status, policy, evidence, now));
  }
  const clean = report();
  clean.advisories = {};
  clean.metadata.vulnerabilities.high = 0;
  assert.equal(evaluateAudit(clean, 0, policy, evidence, now).status, 'clean');
  assert.throws(() => evaluateAudit(clean, 1, policy, evidence, now));
  assert.throws(() => evaluateAudit({}, 0, policy, evidence, now));
});

for (const kind of ['approved-fix', 'new-advisory', 'registry-error', 'malformed-json',
  'unexpected-exit', 'failed-regression', 'empty-regression', 'skipped-regression', 'unapproved', 'expired']) {
  test(`complete command handles ${kind} without a bypass flag`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'pinsight-audit-command-'));
    try {
      for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
        cpSync(join(root, name), join(fixture, name));
      }
      for (const directory of ['scripts', 'security', 'patches']) {
        cpSync(join(root, directory), join(fixture, directory), { recursive: true });
      }
      symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
      const config = copy(policy);
      config.reviewedAt = new Date(Date.now() - 3600000).toISOString();
      config.expiresAt = new Date(Date.now() + 86400000).toISOString();
      if (kind === 'unapproved') config.status = 'proposed';
      if (kind === 'expired') config.expiresAt = new Date(Date.now() - 1).toISOString();
      writeFileSync(join(fixture, 'security/braces-remediation.json'), JSON.stringify(config));
      const audit = report();
      let status = 1;
      let output;
      if (kind === 'new-advisory') audit.advisories.fixture.github_advisory_id = 'GHSA-0000-0000-0000';
      if (kind === 'registry-error') { status = 2; output = JSON.stringify({ error: 'synthetic outage' }); }
      if (kind === 'malformed-json') output = 'not JSON';
      if (kind === 'unexpected-exit') status = 2;
      output ??= JSON.stringify(audit);
      if (kind === 'failed-regression') {
        writeFileSync(join(fixture, 'scripts/test-braces-patch.mjs'), "throw new Error('synthetic regression');\n");
      }
      if (kind === 'empty-regression') writeFileSync(join(fixture, 'scripts/test-braces-patch.mjs'), '');
      if (kind === 'skipped-regression') {
        writeFileSync(join(fixture, 'scripts/test-braces-patch.mjs'),
          "import {test} from 'node:test'; test('synthetic skipped check', {skip: true}, () => {});\n");
      }
      const manager = join(fixture, 'synthetic-manager.cjs');
      writeFileSync(manager, `process.stdout.write(${JSON.stringify(output)}); process.exitCode = ${status};\n`);
      const command = spawnSync(process.execPath, [join(fixture, 'scripts/audit-dependencies.mjs')], {
        cwd: fixture, encoding: 'utf8', timeout: 15000,
        env: { ...process.env, npm_execpath: manager },
      });
      assert.ifError(command.error);
      assert.equal(command.signal, null);
      if (kind === 'approved-fix') {
        assert.equal(command.status, 0, command.stderr);
        assert.match(command.stdout, /"github_advisory_id":"GHSA-vfj7-8cjw-p6xm"/);
        assert.match(command.stdout, /"status":"verified-local-backport"/);
        assert.doesNotMatch(command.stdout, /"status":"clean"/);
      } else {
        assert.notEqual(command.status, 0, command.stdout);
        assert.match(command.stderr, /Dependency verification FAILED/);
      }
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
}

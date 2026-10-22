import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import yaml from 'js-yaml';

const ghsa = 'GHSA-vfj7-8cjw-p6xm';
const identity = 'braces@3.0.3';
const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function packageHashes(root) {
  const files = {};
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const stat = lstatSync(file);
      assert(!stat.isSymbolicLink(), 'Unexpected symlink inside patched package');
      if (stat.isDirectory()) walk(file);
      else {
        assert(stat.isFile(), 'Unexpected non-file inside patched package');
        files[relative(root, file)] = digest(readFileSync(file));
      }
    }
  }
  walk(root);
  return files;
}

export function validatePolicy(policy, now = Date.now()) {
  assert.equal(policy.schemaVersion, 1, 'Unsupported remediation policy');
  assert.equal(policy.status, 'approved', 'Remediation rule needs explicit owner approval');
  assert.equal(policy.advisory, ghsa, 'Unexpected advisory identity');
  assert.equal(`${policy.package}@${policy.version}`, identity, 'Unexpected package identity');
  assert.equal(policy.patch, 'patches/braces@3.0.3.patch', 'Unexpected patch path');
  assert.match(policy.patchSha256, /^[a-f0-9]{64}$/);
  assert.equal(policy.upstreamCommit, '28d440b5dd449dbf1fe6f3506cf94ecca4d02660');
  assert.equal(policy.owner, 'repository maintainer');
  const reviewed = Date.parse(policy.reviewedAt), expires = Date.parse(policy.expiresAt);
  assert(Number.isFinite(now) && Number.isFinite(reviewed) && Number.isFinite(expires), 'Invalid review dates');
  assert(reviewed <= now && now < expires, 'Remediation review is future-dated or expired');
  assert(expires > reviewed && expires - reviewed <= 31 * 86400000, 'Review period must not exceed 31 days');
  assert(object(policy.packageFiles) && Object.keys(policy.packageFiles).length === 10);
  for (const hash of Object.values(policy.packageFiles)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert(Array.isArray(policy.paths) && policy.paths.length === 4);
  assert(policy.paths.every(path => typeof path === 'string'));
  assert.equal(new Set(policy.paths).size, 4);
  assert(object(policy.reviewedAdvisory));
  assert.deepEqual(Object.keys(policy.reviewedAdvisory).sort(),
    ['title', 'vulnerable_versions', 'patched_versions', 'severity', 'cwe'].sort());
  assert(Object.values(policy.reviewedAdvisory).every(value => typeof value === 'string' && value.length > 0));
}

export function verifyLock(lock, workspace, policy) {
  assert.equal(lock.patchedDependencies?.[identity], policy.patchSha256, 'Lock patch digest differs');
  assert.equal(workspace.patchedDependencies?.[identity], policy.patch, 'Patch registration differs');
  assert.notEqual(workspace.allowUnusedPatches, true, 'Unused patches must fail installation');
  assert(!workspace.auditConfig && !workspace.audit, 'Advisory filters are not allowed');
  assert.deepEqual(Object.keys(lock.packages).filter(name => name.startsWith('braces@')), [identity]);
  const patched = `3.0.3(patch_hash=${policy.patchSha256})`;
  assert(object(lock.snapshots[`braces@${patched}`]), 'Missing patched snapshot');
  assert.deepEqual(Object.keys(lock.snapshots).filter(name => name.startsWith('braces@')), [`braces@${patched}`]);
  let references = 0;
  for (const node of Object.values(lock.snapshots)) {
    for (const dependencies of [node.dependencies, node.optionalDependencies]) {
      if (dependencies?.braces !== undefined) {
        assert.equal(dependencies.braces, patched, 'Unpatched dependency reference');
        references++;
      }
    }
  }
  assert(references > 0, 'Remediation is no longer used; retire it explicitly');
  const importer = lock.importers['.'];
  assert(!importer.dependencies?.braces && !importer.optionalDependencies?.braces);
  // Traverse the locked runtime closure, including optional packages on other platforms.
  const queue = Object.entries({ ...importer.dependencies, ...importer.optionalDependencies })
    .map(([name, value]) => `${name}@${value.version}`);
  const seen = new Set();
  while (queue.length) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    assert(!key.startsWith('braces@'), 'Build-only remediation reached the runtime closure');
    const node = lock.snapshots[key];
    assert(object(node), `Unknown locked runtime package: ${key}`);
    for (const [name, version] of Object.entries({ ...node.dependencies, ...node.optionalDependencies })) {
      queue.push(`${name}@${version}`);
    }
  }
}

export function verifyPackage(root, policy) {
  assert.deepEqual(packageHashes(root), policy.packageFiles, 'Installed patched package bytes changed');
  const pkg = readJson(join(root, 'package.json'));
  assert.equal(`${pkg.name}@${pkg.version}`, identity);
}

export function inspectRemediation(root, policy, now = Date.now()) {
  validatePolicy(policy, now);
  const lock = yaml.load(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
  const workspace = yaml.load(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
  verifyLock(lock, workspace, policy);
  const patchFile = join(root, policy.patch);
  assert(lstatSync(patchFile).isFile() && !lstatSync(patchFile).isSymbolicLink());
  assert.equal(digest(readFileSync(patchFile)), policy.patchSha256, 'Patch bytes changed');
  const roots = new Set();
  for (const path of policy.paths) {
    const chain = path.split('>');
    assert.equal(chain.shift(), '.');
    assert.equal(chain.pop(), 'braces');
    let resolver = createRequire(join(root, 'package.json'));
    for (const name of chain) resolver = createRequire(resolver.resolve(name));
    roots.add(realpathSync(dirname(resolver.resolve('braces'))));
  }
  assert.equal(roots.size, 1, 'Consumers do not resolve one patched package');
  for (const packageRoot of roots) verifyPackage(packageRoot, policy);
  return { packageCount: Object.keys(lock.packages).length, consumers: policy.paths.length };
}

export function evaluateAudit(report, exitStatus, policy, evidence, now = Date.now()) {
  validatePolicy(policy, now);
  assert(object(report) && !report.error && object(report.advisories) && object(report.metadata), 'Invalid audit response');
  assert.equal(report.metadata.totalDependencies, evidence.packageCount, 'Audit package coverage changed');
  assert(Number.isSafeInteger(evidence.packageCount) && evidence.packageCount > 0);
  const counts = report.metadata.vulnerabilities;
  assert(object(counts), 'Missing advisory counts');
  assert.deepEqual(Object.keys(counts).sort(), [...levels].sort(), 'Unknown advisory severity category');
  for (const level of levels) assert(Number.isSafeInteger(counts[level]) && counts[level] >= 0);
  const advisories = Object.values(report.advisories);
  assert.equal(advisories.length, levels.reduce((sum, level) => sum + counts[level], 0), 'Advisory counts disagree');
  for (const level of levels) {
    assert.equal(counts[level], advisories.filter(advisory => advisory.severity === level).length,
      'Advisory severity counts disagree');
  }
  if (advisories.length === 0) {
    assert.equal(exitStatus, 0, 'Audit command failed despite empty findings');
    return { status: 'clean', knownMatches: 0 };
  }
  assert.equal(exitStatus, 1, 'Unexpected audit exit status');
  assert.equal(advisories.length, 1, 'New or duplicate advisory requires review');
  const advisory = advisories[0];
  assert.equal(advisory.github_advisory_id, policy.advisory, 'Unreviewed advisory');
  assert.equal(advisory.module_name, policy.package, 'Advisory package changed');
  assert.equal(advisory.severity, 'high', 'Advisory severity changed');
  for (const [key, value] of Object.entries(policy.reviewedAdvisory)) {
    assert.equal(advisory[key], value, 'Reviewed advisory details changed');
  }
  assert.equal(advisory.url, `https://github.com/advisories/${ghsa}`);
  assert(Array.isArray(advisory.findings) && advisory.findings.length === 1);
  const finding = advisory.findings[0];
  assert.equal(finding.version, policy.version, 'Affected version changed');
  assert.equal(finding.dev, true, 'Finding is not build-only');
  assert.equal(finding.optional, false);
  assert.equal(finding.bundled, false);
  assert(Array.isArray(finding.paths) && finding.paths.length === policy.paths.length);
  assert.deepEqual([...finding.paths].sort(), [...policy.paths].sort(), 'Affected dependency paths changed');
  return { status: 'verified-local-backport', knownMatches: 1, advisory: ghsa,
    package: identity, patchSha256: policy.patchSha256, expiresAt: policy.expiresAt };
}

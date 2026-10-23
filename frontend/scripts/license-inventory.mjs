import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function nativeLicenseArguments(modules) {
  assert(typeof modules.storeDir === 'string' && isAbsolute(modules.storeDir));
  assert.equal(basename(modules.storeDir), 'v11', 'Unsupported pnpm store layout');
  // Child pnpm does not inherit every parent CLI setting; use this install's store.
  return [`--config.store-dir=${dirname(modules.storeDir)}`, 'licenses', 'list', '--json'];
}

export function frontendInventory(lock, modules, licenses, lockSha256, manager) {
  assert(object(lock.packages) && Object.keys(lock.packages).length > 0, 'Empty or malformed lock');
  assert(object(lock.snapshots), 'Missing locked snapshots');
  assert.equal(modules.packageManager, manager, 'Installed package manager differs');
  assert.equal(modules.layoutVersion, 5, 'Unsupported installed layout');
  assert.deepEqual(modules.included,
    { dependencies: true, devDependencies: true, optionalDependencies: true }, 'Partial install');
  assert(Array.isArray(modules.skipped) && new Set(modules.skipped).size === modules.skipped.length);
  const skipped = new Set(modules.skipped);
  for (const identity of skipped) {
    assert(Object.hasOwn(lock.packages, identity), 'Unknown skipped package');
    const variants = Object.entries(lock.snapshots).filter(([key]) => key.split('(')[0] === identity);
    assert(variants.length > 0 && variants.every(([, node]) => node.optional === true),
      'Required package cannot be hidden as skipped');
  }
  assert(object(licenses), 'Malformed native license response');
  const represented = new Map();
  for (const [license, rows] of Object.entries(licenses)) {
    assert(typeof license === 'string' && license.length > 0 && license.length <= 512);
    assert(Array.isArray(rows), 'Malformed native license group');
    for (const row of rows) {
      assert(object(row) && typeof row.name === 'string' && Array.isArray(row.versions));
      assert(row.versions.length > 0 && row.license === license, 'Inconsistent license grouping');
      for (const version of row.versions) {
        assert(typeof version === 'string');
        const identity = `${row.name}@${version}`;
        assert(Object.hasOwn(lock.packages, identity), 'Inventory includes an unlocked package');
        assert(!represented.has(identity), 'Duplicate package/version metadata');
        assert(!skipped.has(identity), 'Skipped package appears in installed inventory');
        represented.set(identity, license);
      }
    }
  }
  const expected = Object.keys(lock.packages).filter(identity => !skipped.has(identity)).sort();
  assert.deepEqual([...represented.keys()].sort(), expected, 'Installed package coverage is incomplete');
  assert.match(lockSha256, /^[a-f0-9]{64}$/);
  return {
    schemaVersion: 1, ecosystem: 'npm', inventoryStatus: 'validated', licenseReviewStatus: 'required',
    packageManager: manager, lockSha256,
    platform: { system: process.platform, machine: process.arch },
    summary: { lockedIdentities: Object.keys(lock.packages).length, installedIdentities: represented.size,
      skippedOptionalIdentities: skipped.size },
    records: Object.keys(lock.packages).sort().map(identity => ({
      identity, coverage: skipped.has(identity) ? 'skipped-optional' : 'installed',
      declaredLicense: represented.get(identity) ?? null, reviewStatus: 'required',
    })),
  };
}

export function main() {
  try {
    assert.equal(process.argv.length, 3, 'Supply exactly one new output file path');
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const manager = process.env.npm_execpath;
    assert(manager, 'Run through pinned pnpm');
    const lockBytes = readFileSync(join(root, 'pnpm-lock.yaml'));
    const lock = yaml.load(lockBytes.toString(), { schema: yaml.JSON_SCHEMA });
    const modules = yaml.load(readFileSync(join(root, 'node_modules/.modules.yaml'), 'utf8'),
      { schema: yaml.JSON_SCHEMA });
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const result = spawnSync(process.execPath, [manager, ...nativeLicenseArguments(modules)], {
      cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, 'Native license command failed');
    const report = frontendInventory(lock, modules, JSON.parse(result.stdout),
      createHash('sha256').update(lockBytes).digest('hex'), manifest.packageManager.split('+')[0]);
    writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    process.stdout.write(JSON.stringify({ inventoryStatus: report.inventoryStatus,
      licenseReviewStatus: report.licenseReviewStatus, summary: report.summary }) + '\n');
  } catch {
    process.stderr.write('License inventory FAILED; no approval inferred. See docs/LICENSE_REVIEW.md.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

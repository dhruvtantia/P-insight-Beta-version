import assert from 'node:assert/strict';
import test from 'node:test';
import { frontendInventory, nativeLicenseArguments } from './license-inventory.mjs';

function fixture() {
  return {
    lock: { packages: { 'example@1.0': {}, 'example@2.0': {}, 'native@1.0': {} },
      snapshots: { 'example@1.0': {}, 'example@2.0': {}, 'native@1.0': { optional: true } } },
    modules: { packageManager: 'pnpm@11.15.1', layoutVersion: 5,
      included: { dependencies: true, devDependencies: true, optionalDependencies: true },
      skipped: ['native@1.0'] },
    licenses: { MIT: [{ name: 'example', versions: ['1.0', '2.0'], license: 'MIT',
      paths: ['/private/never/publish'], author: 'not needed' }] },
    digest: 'a'.repeat(64), manager: 'pnpm@11.15.1',
  };
}
const collect = f => frontendInventory(f.lock, f.modules, f.licenses, f.digest, f.manager);

test('counts package versions, retains skipped optional coverage, never grants approval', () => {
  const report = collect(fixture());
  assert.deepEqual(report.summary, { lockedIdentities: 3, installedIdentities: 2, skippedOptionalIdentities: 1 });
  assert.equal(report.licenseReviewStatus, 'required');
  assert(report.records.every(row => row.reviewStatus === 'required'));
  assert.equal(report.records.find(row => row.identity === 'native@1.0').declaredLicense, null);
  assert(!JSON.stringify(report).includes('/private/never/publish'));
  assert(!JSON.stringify(report).includes('not needed'));
  assert.deepEqual(collect(fixture()), report);
});

const cases = [
  ['empty lock', f => { f.lock.packages = {}; }],
  ['missing snapshots', f => { delete f.lock.snapshots; }],
  ['different manager', f => { f.modules.packageManager = 'pnpm@10.0.0'; }],
  ['different layout', f => { f.modules.layoutVersion = 4; }],
  ['production-only install', f => { f.modules.included.devDependencies = false; }],
  ['optional-excluding install', f => { f.modules.included.optionalDependencies = false; }],
  ['malformed skipped set', f => { f.modules.skipped = {}; }],
  ['duplicate skipped identity', f => { f.modules.skipped.push('native@1.0'); }],
  ['unknown skipped package', f => { f.modules.skipped.push('unknown@1.0'); }],
  ['required package hidden as skipped', f => { f.modules.skipped.push('example@2.0'); }],
  ['mixed required/optional snapshot variants', f => { f.lock.snapshots['native@1.0(peer@1)'] = {}; }],
  ['skipped without matching snapshot', f => { delete f.lock.snapshots['native@1.0']; }],
  ['malformed report', f => { f.licenses = []; }],
  ['empty report', f => { f.licenses = {}; }],
  ['empty group label', f => { f.licenses = { '': [] }; }],
  ['malformed group', f => { f.licenses.MIT = {}; }],
  ['empty version list', f => { f.licenses.MIT[0].versions = []; }],
  ['non-string version', f => { f.licenses.MIT[0].versions = [1]; }],
  ['different license grouping', f => { f.licenses.MIT[0].license = 'BSD-3-Clause'; }],
  ['unlocked identity', f => { f.licenses.MIT[0].versions.push('3.0'); }],
  ['duplicate package/version', f => { f.licenses.MIT[0].versions.push('1.0'); }],
  ['omitted installed version', f => { f.licenses.MIT[0].versions.pop(); }],
  ['skipped package represented as installed', f => {
    f.licenses.MIT.push({ name: 'native', versions: ['1.0'], license: 'MIT' });
  }],
  ['invalid lock digest', f => { f.digest = 'not a digest'; }],
];
for (const [name, mutate] of cases) {
  test(`rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => collect(f));
  });
}

test('unknown/custom license metadata stays visible and unapproved', () => {
  const f = fixture();
  f.licenses = { 'SEE LICENSE IN file.txt': [{ name: 'example', versions: ['1.0', '2.0'],
    license: 'SEE LICENSE IN file.txt' }] };
  const report = collect(f);
  assert.equal(report.records[0].declaredLicense, 'SEE LICENSE IN file.txt');
  assert.equal(report.records[0].reviewStatus, 'required');
});

test('native collector uses installed store without excluding dev or optional packages', () => {
  assert.deepEqual(nativeLicenseArguments({ storeDir: '/synthetic/store/v11' }),
    ['--config.store-dir=/synthetic/store', 'licenses', 'list', '--json']);
  for (const storeDir of [undefined, 'relative/v11', '/synthetic/store/v10']) {
    assert.throws(() => nativeLicenseArguments({ storeDir }));
  }
});

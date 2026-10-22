import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAudit, inspectRemediation } from './remediation-policy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  assert.equal(process.argv.length, 2, 'This check accepts no override flags');
  const manager = process.env.npm_execpath;
  assert(manager, 'Run through the pinned pnpm script');
  const policy = JSON.parse(readFileSync(join(root, 'security/braces-remediation.json'), 'utf8'));
  const evidence = inspectRemediation(root, policy);
  // An inherited Node test-runner context can prevent a nested suite from running.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const regression = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    join(root, 'scripts/test-braces-patch.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env,
  });
  assert.ifError(regression.error);
  assert.equal(regression.status, 0, 'Patched behaviour failed verification');
  for (const summary of ['tests 6', 'pass 6', 'fail 0', 'skipped 0']) {
    assert.match(regression.stdout, new RegExp(`^# ${summary}$`, 'm'), 'Patch regression coverage changed');
  }
  const audit = spawnSync(process.execPath, [manager, 'audit', '--json', '--audit-level=low',
    '--registry=https://registry.npmjs.org/', '--fetch-retries=0', '--fetch-timeout=30000'], {
    cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024, env,
  });
  assert.ifError(audit.error);
  // Keep the original version-based finding visible; never label it a clean scan.
  process.stdout.write(audit.stdout);
  const result = evaluateAudit(JSON.parse(audit.stdout), audit.status, policy, evidence);
  process.stdout.write(`\n${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`Dependency verification FAILED: ${error.message}\n`);
  process.exitCode = 1;
}

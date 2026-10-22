import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manager = process.env.npm_execpath;
assert.ok(manager, 'Run through pnpm run test:dependencies');

for (const kind of ['clean', 'advisory', 'registry-error', 'malformed-response']) {
  test(`real pnpm audit handles ${kind} without hiding failures`, { timeout: 20000 }, async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'pinsight-audit-'));
    const requests = [];
    const server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push({ method: request.method, url: request.url, body });
      if (kind === 'registry-error') {
        response.writeHead(503).end('Synthetic registry outage');
      } else if (kind === 'malformed-response') {
        response.writeHead(200, { 'content-type': 'application/json' }).end('not JSON');
      } else {
        // A local synthetic advisory tests exit behavior, not application exploitability.
        const payload = kind === 'clean' ? {} : { next: [{
          id: 1, title: 'Synthetic advisory fixture', severity: 'low',
          url: 'https://github.com/advisories/GHSA-0000-0000-0000',
          vulnerable_versions: '*', cwe: ['CWE-20'],
        }] };
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      }
    });
    let child;
    try {
      for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
        copyFileSync(join(root, file), join(fixture, file));
      }
      cpSync(join(root, 'patches'), join(fixture, 'patches'), { recursive: true });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      child = spawn(process.execPath, [manager,
        'audit', '--json', '--audit-level=low',
        `--registry=http://127.0.0.1:${server.address().port}`,
        '--fetch-retries=0', '--fetch-timeout=3000',
      ], { cwd: fixture, env: { ...process.env, CI: 'true' }, timeout: 12000 });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', () => {});
      const [code, signal] = await once(child, 'close');
      assert.equal(signal, null);
      assert.ok(requests.some(r => r.method === 'POST'
        && r.url === '/-/npm/v1/security/advisories/bulk'));
      if (kind === 'clean') {
        assert.equal(code, 0, output);
        assert.equal(JSON.parse(output).metadata.vulnerabilities.low, 0);
      } else {
        assert.notEqual(code, 0, output);
        if (kind === 'advisory') {
          const report = JSON.parse(output);
          assert.ok(Object.values(report.advisories).some(a => a.module_name === 'next'));
          assert.ok(report.metadata.vulnerabilities.low > 0);
        }
      }
    } finally {
      if (child?.exitCode === null) child.kill();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manager = process.env.npm_execpath;
assert.ok(manager, "Run through pnpm run test:toolchain to check the active manager");

for (const kind of ["lock-mismatch", "engine-mismatch"]) {
  test(`frozen install rejects ${kind}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "pinsight-toolchain-"));
    try {
      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      if (kind === "lock-mismatch") manifest.dependencies.clsx = "0.0.1";
      else manifest.engines.node = "0.0.0";
      writeFileSync(join(fixture, "package.json"), JSON.stringify(manifest));
      for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
        copyFileSync(join(root, file), join(fixture, file));
      }
      const result = spawnSync(process.execPath, [
        manager, "install", "--frozen-lockfile", "--offline", "--ignore-scripts",
      ], {
        cwd: fixture,
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, CI: "true" },
      });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0, "Invalid setup must fail, not repair itself");
      assert.match(result.stdout + result.stderr, kind === "lock-mismatch"
        ? /ERR_PNPM_OUTDATED_LOCKFILE/ : /ERR_PNPM_UNSUPPORTED_ENGINE/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}

test("locked platform binaries work without dependency install scripts", async () => {
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve("next/package.json"));
  const sharp = nextRequire("sharp");
  const image = await sharp({ create: {
    width: 1, height: 1, channels: 3, background: "white",
  } }).png().toBuffer();
  assert.equal((await sharp(image).metadata()).width, 1);
  const eslintRequire = createRequire(require.resolve("eslint-config-next/package.json"));
  const resolverRequire = createRequire(eslintRequire.resolve("eslint-import-resolver-typescript"));
  const { ResolverFactory } = resolverRequire("unrs-resolver");
  const result = new ResolverFactory().sync(root, "react");
  assert.ok(result.path, JSON.stringify(result));
});

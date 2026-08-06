/**
 * Sequential per-file test runner. Each spec file gets its OWN vitest
 * process: on Windows, tinypool's fork teardown between files races against
 * native/async handles (BullMQ, Chromium, argon2) and sporadically kills the
 * worker (ERR_IPC_CHANNEL_CLOSED) — full process isolation removes that
 * class of failure entirely at the cost of ~2s startup per file.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const specs = [
  ...readdirSync(path.join(root, "test"))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `test/${f}`),
  "src/modules/health/health.controller.spec.ts",
];

let failed = 0;
for (const spec of specs) {
  console.log(`\n=== vitest ${spec} ===`);
  const result = spawnSync("npx", ["vitest", "run", spec], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${spec}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} spec file(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${specs.length} spec files passed`);

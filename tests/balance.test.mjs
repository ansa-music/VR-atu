// tests/balance.test.mjs — балансовые скрипты должны завершаться с кодом 0
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
for (const s of ['tools/check-enemies.mjs', 'tools/check-weapons.mjs', 'tools/check-skills.mjs', 'tools/validate-defs.mjs']) {
  test(s, () => { assert.doesNotThrow(() => execFileSync(process.execPath, [s], { cwd: root, stdio: 'pipe' })); });
}

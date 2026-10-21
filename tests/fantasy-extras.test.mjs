// tests/fantasy-extras.test.mjs — валидатор фантастических дополнений завершается с кодом 0.
import { test } from 'node:test'; import assert from 'node:assert'; import { spawnSync } from 'node:child_process';
test('validate-fantasy-extras OK', () => {
  const r = spawnSync(process.execPath, ['tools/validate-fantasy-extras.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /OK/);
});

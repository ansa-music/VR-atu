// Внешний Playwright для проверки, без зависимостей в клиенте.
// NODE_PATH=<каталог с playwright> node tests/progression-smoke.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:18947';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.stack); }); page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('CONSOLE', m.text()); });
    await page.goto(origin + '/?mode=world&debug&fresh&quality=low');
    await page.waitForFunction(() => window.vrTirDebug?.progression, null, { timeout: 60000 });
    console.log('Готов мир'); await page.locator('#play').click(); console.log('Вход выполнен');
    await page.evaluate(() => { vrTirDebug.teleport(1300, undefined, 1420); vrTirDebug.tick(10); });
    assert.equal(await page.evaluate(() => vrTirDebug.progression.step), 1); await page.evaluate(() => { vrTirDebug.select(4); vrTirDebug.tick(40); });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { vrTirDebug.spawn('wisp'); vrTirDebug.tick(2); const r = Math.random; try { Math.random = () => 0; vrTirDebug.damageNearest(100); } finally { Math.random = r; } vrTirDebug.tick(10); });
    }
    assert.ok(await page.evaluate(() => __OW_PROG.inv.count('it_mat_slime_gel') >= 3));
    assert.equal(await page.evaluate(() => vrTirDebug.progression.step), 2);
    const hp = await page.evaluate(() => vrTirDebug.progression.hpMax);
    await page.evaluate(() => { vrTirDebug.giveXp(1000); vrTirDebug.tick(10); });
    assert.ok(await page.evaluate(before => vrTirDebug.progression.hpMax > before, hp));
    const gearUid = await page.evaluate(async () => {
      const { rollGear } = await import('/js/world/inventory.js');
      const g = rollGear({ slot: 'body', il: 1 }); g.affixes = [{ id: 'af_hp', value: 30, tier: 1 }];
      __OW_PROG.inv.addGear(g); return g.uid;
    });
    const beforeGearHp = await page.evaluate(() => vrTirDebug.progression.hpMax);
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('#owm-menu.on').isVisible());
    await page.locator('[data-eq="' + gearUid + '"]').click();
    assert.equal(await page.evaluate(() => vrTirDebug.progression.hpMax), beforeGearHp + 30);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#owm-menu.on').count(), 0);
    await page.evaluate(() => { vrTirDebug.teleport(1180, undefined, 1310); vrTirDebug.tick(20); window.__OW_PROG.inv.gold = 100; });
    const potions = await page.evaluate(() => __OW_PROG.inv.count('it_potion_hp_s'));
    await page.keyboard.press('F');
    await page.locator('[data-buy="it_potion_hp_s:25"]').click();
    if (process.env.SCREENSHOTS) await page.screenshot({ path: 'dev/progression-desktop.png' });
    assert.equal(await page.evaluate(() => __OW_PROG.inv.gold), 75);
    assert.equal(await page.evaluate(() => __OW_PROG.inv.count('it_potion_hp_s')), potions + 1);
    await page.evaluate(() => __OW_PROG.save('auto'));
    const before = await page.evaluate(() => ({ level: __OW_PROG.prog.level, xp: __OW_PROG.prog.xp, hpMax: vrTirDebug.progression.hpMax, items: __OW_PROG.inv.toJSON(), quests: __OW_PROG.quests, discovered: vrTirDebug.progression.discovered }));
    await page.goto(origin + '/?mode=world&debug&quality=low');
    await page.waitForFunction(() => window.vrTirDebug?.progression, null, { timeout: 60000 });
    assert.deepEqual(await page.evaluate(() => ({ level: __OW_PROG.prog.level, xp: __OW_PROG.prog.xp, hpMax: vrTirDebug.progression.hpMax, items: __OW_PROG.inv.toJSON(), quests: __OW_PROG.quests, discovered: vrTirDebug.progression.discovered })), before);
    console.log('PASS world: убийства, квест, уровень/HP, Tab/Esc, F/покупка, загрузка');
    await page.goto(origin + '/?debug&quality=low');
    await page.waitForFunction(() => window.vrTirDebug, null, { timeout: 60000 });
    await page.evaluate(() => { vrTirDebug.startRound(); vrTirDebug.tick(240); });
    assert.equal(await page.evaluate(() => vrTirDebug.progression), null);
    assert.equal(await page.evaluate(() => vrTirDebug.state.state), 'play');
    console.log('PASS обычный тир');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:18947';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 600 } });
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    await page.goto(origin + '/tests/xr.html?mode=world&debug&fresh&quality=low');
    await page.waitForFunction(() => window.xrTest && window.vrTirDebug?.progression, null, { timeout: 60000 });
    await page.evaluate(() => xrTest.enter());
    await page.waitForFunction(() => vrTirDebug.progressionVr.visible);
    assert.ok(await page.evaluate(() => vrTirDebug.scene.getObjectByName('world-progression-hud')?.material.map.isCanvasTexture));
    if (process.env.PROFILE) console.log('MESHES', await page.evaluate(() => { const a=[]; vrTirDebug.scene.traverseVisible(o=>{ if(o.isMesh) a.push({name:o.name,parent:o.parent.name,tri:(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)}); }); return a.sort((a,b)=>b.tri-a.tri); }));
    const perf = await page.evaluate(() => vrTirDebug.info); assert.ok(perf.calls <= 100, JSON.stringify(perf)); assert.ok(perf.triangles <= 150000, JSON.stringify(perf));
    console.log('XR HUD', await page.evaluate(() => ({ hud: vrTirDebug.progressionVr, perf: vrTirDebug.info })));
    await page.evaluate(() => { __OW_PROG.inv.gold = 100; xrTest.hand('left', -0.46, 1.215, -0.35); });
    await page.evaluate(() => xrTest.frames(4));
    await page.evaluate(() => xrTest.press('left', 'trigger'));
    assert.equal(await page.evaluate(() => vrTirDebug.progressionVr.shop), true);
    if (process.env.SCREENSHOTS) await page.screenshot({ path: 'dev/progression-xr.png' });
    await page.evaluate(() => xrTest.press('left', 'trigger'));
    assert.equal(await page.evaluate(() => __OW_PROG.inv.count('it_potion_hp_s')), 1);
    assert.equal(await page.evaluate(() => __OW_PROG.inv.gold), 75);
    await page.evaluate(() => { __OW_PROG.quests.active = 'q_main_05'; __OW_PROG.quests.step = 1; __OW_PROG.quests.counters = {}; vrTirDebug.teleport(80, undefined, 1100); });
    await page.evaluate(() => xrTest.frames(20));
    await page.evaluate(() => xrTest.press('left', 'trigger'));
    assert.equal(await page.evaluate(() => __OW_PROG.inv.count('it_purity_herb')), 1);
    await page.evaluate(() => xrTest.exit());
    console.log('PASS XR world: canvas HUD, луч, открытие магазина и покупка');
    await page.goto(origin + '/tests/xr.html?debug&quality=low');
    await page.waitForFunction(() => window.xrTest && window.vrTirDebug, null, { timeout: 60000 });
    await page.evaluate(() => xrTest.enter());
    await page.waitForFunction(() => vrTirDebug.fantasy.active);
    await page.evaluate(() => { vrTirDebug.startRound(); vrTirDebug.tick(240); });
    assert.equal(await page.evaluate(() => vrTirDebug.progression), null);
    assert.equal(await page.evaluate(() => vrTirDebug.combat.on), true);
    assert.equal(await page.evaluate(() => vrTirDebug.state.state), 'play');
    await page.evaluate(() => xrTest.exit());
    assert.deepEqual(errors, []);
    console.log('PASS XR Арена магов');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

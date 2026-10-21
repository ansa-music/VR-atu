const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const a = await browser.newPage({viewport:{width:640,height:480}}), b = await browser.newPage({viewport:{width:640,height:480}});
    const errors=[];
    for (const p of [a,b]) p.on('pageerror', e => errors.push(e.message));
    await Promise.all([a.goto(origin + '/?debug&quality=low'),b.goto(origin + '/?debug&quality=low')]);
    a.setDefaultTimeout(90000); b.setDefaultTimeout(90000);
    await a.bringToFront(); await a.locator('#play:not([disabled])').waitFor();
    await b.bringToFront(); await b.locator('#play:not([disabled])').waitFor();
    await a.bringToFront();
    await a.evaluate(() => window.addEventListener('mp:room:update', e => { window.latestRoom = e.detail.room; }));
    await a.locator('[data-menu-page="network"]').click();
    await b.locator('[data-menu-page="network"]').click();
    await a.locator('#mp-name').fill('Host');
    await a.locator('#mp-custom-code').fill('789');
    await a.locator('#mp-duration').selectOption('120');
    await a.locator('#mp-create').click();
    await a.locator('#mp-lobby:not([hidden])').waitFor();
    await b.locator('#mp-mode-join').click();
    await b.locator('#mp-name').fill('Guest');
    await b.locator('#mp-join-code').fill('789');
    await b.locator('#mp-join').click();
    await b.locator('#mp-lobby:not([hidden])').waitFor();
    await a.waitForFunction(() => document.querySelector('#mp-players').children.length === 2);
    await a.locator('#mp-start').click();
    await Promise.all([a.locator('#overlay.is-hidden').waitFor({state:'attached'}), b.locator('#overlay.is-hidden').waitFor({state:'attached'})]);
    await a.evaluate(() => {
      window.sentShots = [];
      const original = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        try { if (JSON.parse(data).type === 'player:shot') window.sentShots.push(JSON.parse(data)); } catch {}
        return original.call(this, data);
      };
    });
    await a.bringToFront();
    // Aim first with a free cursor, without a preliminary LMB capture click.
    const initialAmmo = await a.evaluate(() => vrTirDebug.state.mag);
    await a.mouse.move(400,300);
    await a.mouse.down({button:'right'});
    await a.waitForFunction(() => !!document.pointerLockElement);
    await a.waitForFunction(() => vrTirDebug.state.aimAmt > 0.5);
    await a.mouse.down({button:'left'});
    await a.mouse.up({button:'left'});
    await a.waitForFunction(() => window.sentShots.length === 1, {}, {timeout:5000});
    await a.waitForFunction(expected => vrTirDebug.state.mag === expected, initialAmmo - 1);
    console.log('PASS: LMB fires while RMB aim is held (one network shot, one round consumed)');
    // Keep aiming and fire again; respect the weapon cooldown.
    await a.waitForTimeout(150);
    // Releasing RMB while LMB is held must end ADS.
    await a.mouse.down({button:'left'});
    await a.waitForFunction(() => window.sentShots.length >= 2);
    await a.mouse.up({button:'right'});
    await a.waitForFunction(() => vrTirDebug.state.aimAmt < 0.1);
    await a.mouse.up({button:'left'});
    const totalShots = await a.evaluate(() => window.sentShots.length);
    await a.waitForFunction(expected => vrTirDebug.state.mag === expected, initialAmmo - totalShots);
    await a.keyboard.press('Tab');
    await a.waitForFunction(() => !document.pointerLockElement);
    console.log('PASS: Tab releases pointer lock and opens menu');

    await a.locator('#overlay:not(.is-hidden)').waitFor();
    assert.equal(await a.locator('#menu-resume').isVisible(), true);
    // Simulate a routine authoritative score update while the player reads the menu.
    await a.evaluate(() => window.dispatchEvent(new CustomEvent('mp:room:update', {detail:{room:window.latestRoom}})));
    assert.equal(await a.locator('#overlay').evaluate(e => e.classList.contains('is-hidden')), false);
    await a.locator('#menu-resume').click();
    await a.locator('#overlay.is-hidden').waitFor({state:'attached'});
    await a.keyboard.press('Escape');
    await a.locator('#overlay:not(.is-hidden)').waitFor();
    await a.locator('#mp-leave').click();
    await a.locator('#play:not([hidden])').waitFor();
    await b.locator('#help-btn').click();
    await b.waitForFunction(() => document.querySelector('#mp-players').textContent.includes('★ Guest'));
    await b.locator('#mp-leave').click();
    await b.locator('#play:not([hidden])').waitFor();
    await a.close();
    await b.close();
    const c = await browser.newPage({viewport:{width:640,height:480}});
    c.on('pageerror', e => errors.push(e.message));
    let stall = true;
    await c.routeWebSocket('**:8080/**', route => { if (!stall) route.connectToServer(); });
    await c.goto(origin + '/?debug&quality=low');
    await c.locator('#play:not([disabled])').waitFor();
    await c.locator('[data-menu-page="network"]').click();
    await c.locator('#mp-custom-code').fill('789');
    await c.locator('#mp-create').click();
    await c.locator('#mp-cancel:not([hidden])').waitFor();
    await c.locator('#mp-cancel').click();
    assert.equal(await c.locator('#mp-create').isEnabled(), true);
    stall = false;
    await c.locator('#mp-create').click();
    await c.locator('#mp-lobby:not([hidden])').waitFor();
    await c.locator('#mp-leave').click();
    await c.locator('#play:not([hidden])').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: two real Chromium clients, create/join/start, menu remains open on updates, resume, Escape, leave, host transfer, cancellation and retry; no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });

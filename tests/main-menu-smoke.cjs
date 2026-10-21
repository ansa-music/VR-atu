const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:18947';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    fs.mkdirSync('dev', { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/?debug&quality=low');
    await page.waitForFunction(() => window.vrTirDebug, null, { timeout: 90000 });
    await page.screenshot({ path: 'dev/main-menu-desktop.png' });
    assert.ok(await page.locator('#world-link').isVisible());
    assert.ok(await page.locator('#play').isEnabled());
    assert.equal(await page.locator('#mp-name').isVisible(), false);
    await page.locator('[data-menu-page="network"]').click();
    await page.locator('#mp-name').fill('Искатель');
    assert.equal(await page.locator('#mp-name').inputValue(), 'Искатель');
    await page.locator('[data-menu-page="settings"]').click();
    assert.ok(await page.locator('#settings-section').isVisible());
    assert.ok(await page.locator('#skin-select').isVisible());
    await page.locator('[data-menu-page="help"]').first().click();
    assert.ok(await page.locator('#mk-connect').isVisible());
    await page.locator('[data-menu-page="play"]').click();
    for (const width of [800, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.querySelector('#overlay').scrollWidth <= innerWidth), 'overflow ' + width);
      if (width === 390) await page.screenshot({ path: 'dev/main-menu-mobile.png', fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#play').click();
    assert.ok(await page.locator('#overlay').evaluate(e => e.inert));
    assert.ok(await page.locator('#mk').evaluate(e => e.parentElement === document.body));
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#menu-page-play').isVisible());
    await page.goto(origin + '/?mode=world&debug&fresh&quality=low');
    await page.waitForFunction(() => window.vrTirDebug?.progression, null, { timeout: 90000 });
    assert.ok(await page.locator('#menu-world-actions #play').isVisible());
    assert.ok(await page.locator('#menu-range-actions #world-link').isVisible());
    assert.equal(await page.locator('#world-link').getAttribute('href'), origin + '/');
    assert.deepEqual(errors, []);

    const denied = await browser.newPage();
    denied.on('pageerror', e => errors.push(e.message));
    await denied.addInitScript(() => {
      navigator.xr.isSessionSupported = async () => true;
      navigator.xr.requestSession = async () => { throw new DOMException('Отказ пользователя', 'NotAllowedError'); };
    });
    await denied.goto(origin + '/?debug&quality=low');
    await denied.locator('#menu-vr:not([disabled])').waitFor({ timeout: 90000 });
    await denied.locator('#menu-vr').click();
    await denied.waitForFunction(() => document.getElementById('menu-vr-note').textContent.includes('Не удалось'));
    assert.ok(await denied.locator('#menu-vr').isEnabled());
    assert.deepEqual(errors, []);
    console.log('PASS: главный экран, навигация, настройки, телефон, запуск/возврат, world, отказ VR без исключения');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

// Screenshots of the landing page sections at 360px, light and dark.
// Run: playwright-cli run-code --filename=scripts/shots.js  (open the preview URL in playwright-cli first; any port)
// Change `out` to the current flow run's proof/ folder before running.
async page => {
  // Use whatever port the preview server got (the page opened with playwright-cli open <url>).
  const base = page.url().startsWith('http') ? new URL(page.url()).origin : 'http://localhost:5173';
  const out = 'flow/2026-10-17-website-update/proof/';
  const r = {};
  await page.setViewportSize({ width: 360, height: 780 });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(base + '/');
    await page.waitForTimeout(400);
    r[scheme + 'NoSideScroll'] = await page.evaluate(() => document.documentElement.scrollWidth <= 360);
    await page.screenshot({ path: out + scheme + '-hero.png' });
    await page.locator('section[aria-labelledby=ba-title]').screenshot({ path: out + scheme + '-enemy.png' });
    for (const id of ['creators', 'features', 'pricing', 'faq', 'apply']) {
      await page.locator('#' + id).screenshot({ path: out + scheme + '-' + id + '.png' });
    }
  }
  // Instagram's in-app browser is about 360 by 640: the Apply button must be on the first screen.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(base + '/');
  r.applyOnFirstScreen = await page.evaluate(() => document.querySelector('.hero-cta .btn').getBoundingClientRect().bottom <= 640);
  // Demo: Continue needs the 18+ tick, like the real store
  await page.setViewportSize({ width: 360, height: 780 });
  await page.click('#buy-3');
  r.continueBlockedUntilTick = await page.evaluate(() => document.getElementById('sheet-next').disabled);
  await page.check('#demo-age');
  r.continueAfterTick = await page.evaluate(() => !document.getElementById('sheet-next').disabled);
  await page.click('#sheet-next');
  await page.locator('.phone').first().screenshot({ path: out + 'light-pay-sheet.png' });
  await page.goto(base + '/about.html');
  r.aboutNoSideScroll = await page.evaluate(() => document.documentElement.scrollWidth <= 360);
  await page.screenshot({ path: out + 'light-about.png', fullPage: true });
  return r;
}

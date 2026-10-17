// Runs one full order on the demo store at 360px and checks each step.
// Run: playwright-cli run-code --filename=scripts/store-test.js  (open the preview URL in playwright-cli first; any port)
async page => {
  // Use whatever port the preview server got (the page opened with playwright-cli open <url>).
  const base = page.url().startsWith('http') ? new URL(page.url()).origin : 'http://localhost:5173';
  const out = 'flow/2026-10-17-website-update/proof/'; // change to the current run's proof/ folder
  const r = {};
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(base + '/s/demo/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  r.noSideScroll = await page.evaluate(() => document.documentElement.scrollWidth <= 360);
  await page.screenshot({ path: out + 'store-demo.png', fullPage: true });

  await page.click('.buy >> nth=2');                      // the ₹999 call
  await page.click('#to-pay');                              // nothing filled in
  r.emptyError = await page.textContent('#err');
  await page.fill('#b-name', 'Asha');
  await page.fill('#b-email', 'asha@example.com');
  await page.click('#to-pay');
  r.ageError = await page.textContent('#err');
  await page.check('#b-age');
  await page.click('#to-pay');
  r.code = await page.textContent('#code');
  r.payee = await page.textContent('#payee');
  r.qrDrawn = await page.locator('#qr svg').count() === 1;
  r.appButtonHiddenOnDemo = await page.locator('#upi-app').isHidden();
  await page.screenshot({ path: out + 'store-pay.png' });

  await page.reload();                                      // like Instagram reloading after the UPI app
  r.reopenedAfterReload = await page.locator('#step-2').isVisible();
  r.sameCodeAfterReload = (await page.textContent('#code')) === r.code;

  const popup = page.waitForEvent('popup').catch(() => null);
  await page.click('#paid');
  const p = await popup; if (p) await p.close();
  r.doneText = await page.textContent('#done-text');
  r.waLink = decodeURIComponent(await page.getAttribute('#send-msg', 'href'));
  await page.screenshot({ path: out + 'store-done.png' });
  r.orderClearedAfterPaid = await page.evaluate(() => localStorage.getItem('thela-order-demo') === null);

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto(base + '/s/demo/');
  await page.screenshot({ path: out + 'store-demo-dark.png' });
  return r;
}

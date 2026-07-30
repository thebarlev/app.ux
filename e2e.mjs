import { chromium } from 'playwright';
const BASE = 'https://appuxellent-git-feat-auditor-e94b70-itzikbab-gmailcoms-projects.vercel.app';
const OUT = process.argv[2];
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });

const api = [];
p.on('response', async r => {
  const u = r.url();
  if (u.includes('/api/auditor/')) {
    let body = null;
    try { body = await r.json(); } catch {}
    api.push({ url: u.replace(BASE,''), status: r.status(), body });
  }
});

const log = (...a) => console.log('•', ...a);
await p.goto(BASE + '/auditor', { waitUntil: 'networkidle', timeout: 60000 });
log('loaded /auditor');

await p.fill('input[placeholder*="כתובת"]', 'https://uxellent.com');
await p.waitForTimeout(600);
// the CTA appears once the field validates
const btn = p.locator('button:visible').first();
log('visible buttons:', await p.locator('button:visible').count());
if (await p.locator('button:visible').count() > 0) {
  log('clicking:', (await btn.innerText()).slice(0,40));
  await btn.click();
} else {
  await p.press('input[placeholder*="כתובת"]', 'Enter');
  log('pressed Enter');
}

// wait for the gate
log('waiting for the lead gate (up to 5 min)…');
await p.waitForSelector('text=לאן לשלוח את הדוח', { timeout: 300000 });
log('GATE REACHED');
await p.screenshot({ path: `${OUT}/e2e-gate-390.png` });

const gateMetrics = await p.evaluate(() => {
  const px = el => el ? getComputedStyle(el).fontSize : null;
  const lede = [...document.querySelectorAll('p')].find(e => e.innerText.includes('הציון כבר חושב'));
  const labels = [...document.querySelectorAll('label[for]')].map(l => ({
    text: l.innerText.trim(), fontSize: getComputedStyle(l).fontSize,
    for: l.getAttribute('for'), inputExists: !!document.getElementById(l.getAttribute('for')),
    inputPlaceholder: document.getElementById(l.getAttribute('for'))?.placeholder ?? null,
  }));
  const consent = [...document.querySelectorAll('label')].find(e => e.innerText.includes('תנאי השימוש'));
  return {
    viewport: innerWidth,
    ledeText: lede?.innerText.slice(0,60),
    ledeFontSize: px(lede),
    consentFontSize: px(consent),
    labels,
  };
});
console.log('GATE_METRICS', JSON.stringify(gateMetrics, null, 1));

// fill the real lead
await p.fill(`#${gateMetrics.labels[0].for}`, 'בדיקת קלוד E2E');
await p.fill(`#${gateMetrics.labels[1].for}`, '0545215193');
await p.fill(`#${gateMetrics.labels[2].for}`, 'itzik@uxellent.com');
await p.locator('input[type=checkbox]').first().check();
log('form filled, submitting…');
await p.locator('button:has-text("הציגו לי את הדוח")').click();

log('waiting for the report…');
await p.waitForSelector('text=קיבלנו את הפרטים שלך', { timeout: 180000 });
log('REPORT REACHED');
await p.waitForTimeout(1500);

const measure = () => p.evaluate(() => {
  const cs = el => el ? getComputedStyle(el) : null;
  const q = document.querySelector('blockquote');
  const h3 = [...document.querySelectorAll('h3')].find(e => e.innerText.includes('קיבלנו את הפרטים שלך'));
  const band = document.querySelector('blockquote')?.closest('div[style*="border-radius"]')?.parentElement?.parentElement;
  const testiSection = [...document.querySelectorAll('div')].find(d => d.querySelector('h2') && d.querySelector('h2').innerText.includes('מה הלקוחות'));
  const tile = [...document.querySelectorAll('.ar-tile')][0];
  const findings = [...document.querySelectorAll('div')].filter(d => d.children.length===0 && d.innerText && getComputedStyle(d).fontWeight==='600');
  return {
    viewport: innerWidth,
    blockquoteFontSize: cs(q)?.fontSize,
    blockquoteBg: cs(q?.closest('figure'))?.backgroundColor,
    h3Text: h3?.innerText,
    h3Color: cs(h3)?.color,
    h3FontSize: cs(h3)?.fontSize,
    ctaBandBg: cs(h3?.parentElement?.parentElement)?.backgroundImage?.slice(0,60),
    testiBandBg: cs(testiSection)?.backgroundColor,
    testiMarginTop: cs(testiSection)?.marginTop,
    tileDisplay: cs(tile)?.display,
    tileGridCols: cs(tile)?.gridTemplateColumns,
    tilesGridCols: cs(document.querySelector('.ar-tiles'))?.gridTemplateColumns,
    pageBg: cs(document.querySelector('.ar-scope'))?.backgroundColor,
    firstFindingFontSize: findings.length ? cs(findings[0]).fontSize : null,
    varProse: getComputedStyle(document.querySelector('.ar-scope')).getPropertyValue('--ar-prose').trim(),
    varLede: getComputedStyle(document.querySelector('.ar-scope')).getPropertyValue('--ar-lede').trim(),
  };
});

console.log('REPORT_390', JSON.stringify(await measure(), null, 1));
await p.screenshot({ path: `${OUT}/e2e-report-390.png`, fullPage: true });

await p.setViewportSize({ width: 360, height: 900 });
await p.waitForTimeout(700);
console.log('REPORT_360', JSON.stringify(await measure(), null, 1));
await p.screenshot({ path: `${OUT}/e2e-report-360.png`, fullPage: true });

await p.setViewportSize({ width: 1440, height: 1000 });
await p.waitForTimeout(700);
console.log('REPORT_1440', JSON.stringify(await measure(), null, 1));
await p.screenshot({ path: `${OUT}/e2e-report-1440.png`, fullPage: true });

console.log('API_CALLS', JSON.stringify(api.filter(a=>a.url.includes('lead-and-scan')||a.url.includes('start')), null, 1));
const scanIds = [...new Set(api.map(a=>a.body?.scanId).filter(Boolean))];
console.log('SCAN_IDS', JSON.stringify(scanIds));
await b.close();

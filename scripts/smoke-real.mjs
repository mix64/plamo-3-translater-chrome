// Translates real pages with the extension loaded, the way a user would, and prints how long
// it took and which visible paragraphs stayed untranslated. Usage: npm run smoke [-- url...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/e2e/out');
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://100.64.114.83:8891/v1';
const LLM_MODEL = process.env.LLM_MODEL ?? 'plamo-3-translate-0.8b';
const URLS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://en.wikipedia.org/wiki/River', 'https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver'];
const TIMEOUT = 120_000;

fs.mkdirSync(OUT, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plamo-smoke-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: !process.env.HEADED,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});

/** Visible paragraphs with letters but no kana, outside the parts the extension never translates. */
function untranslatedInView() {
  return [...document.querySelectorAll('p')]
    .filter((p) => {
      const rect = p.getBoundingClientRect();
      // checkVisibility also rules out the content of a closed <details>, which still has a box.
      if (rect.bottom <= 0 || rect.top >= innerHeight || !p.checkVisibility()) return false;
      if (p.closest('pre, [translate="no"], .notranslate, [contenteditable]')) return false;
      return /\p{L}/u.test(p.textContent) && !/[ぁ-ヿ]/.test(p.textContent);
    })
    .map((p) => p.textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
}

const firstParagraph = (page) =>
  page.evaluate(() => [...document.querySelectorAll('p')].find((p) => /\p{L}{3}/u.test(p.textContent))?.textContent);

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(
    (settings) => chrome.storage.sync.set(settings),
    { baseUrl: LLM_BASE_URL, model: LLM_MODEL },
  );

  for (const url of URLS) {
    const name = new URL(url).hostname.split('.').at(-2);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });
    const original = await firstParagraph(page);
    const label = page.locator('plamo-translator-ui .status .label');
    const toggle = () =>
      worker.evaluate(async (u) => {
        const [tab] = await chrome.tabs.query({ url: u });
        return chrome.tabs.sendMessage(tab.id, { type: 'toggle-page' });
      }, page.url());
    const waitTranslated = async () => {
      // The IntersectionObserver queues newly visible segments only after the next frame.
      await page.waitForTimeout(500);
      await label.filter({ hasText: /^翻訳済み$/ }).waitFor({ timeout: TIMEOUT });
    };

    let started = Date.now();
    await toggle();
    await waitTranslated();
    const top = { seconds: (Date.now() - started) / 1000, untranslated: await page.evaluate(untranslatedInView) };
    await page.screenshot({ path: path.join(OUT, `smoke-${name}-top.png`) });

    started = Date.now();
    const missed = new Set();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const viewport = page.viewportSize().height;
    const steps = Math.ceil(height / viewport);
    for (let step = 1; step <= steps; step++) {
      await page.evaluate((y) => window.scrollTo(0, y), step * viewport);
      await waitTranslated();
      for (const text of await page.evaluate(untranslatedInView)) missed.add(text);
      if (step === Math.ceil(steps / 2)) await page.screenshot({ path: path.join(OUT, `smoke-${name}-middle.png`) });
    }
    await page.screenshot({ path: path.join(OUT, `smoke-${name}-bottom.png`) });
    const scrolled = { seconds: (Date.now() - started) / 1000, steps, untranslated: [...missed] };

    await toggle();
    await label.waitFor({ state: 'hidden' });
    const restored = (await firstParagraph(page)) === original;

    const report = (r) => `${r.seconds.toFixed(1)} s, untranslated visible <p>: ${r.untranslated.length}`;
    console.log(`\n${url}`);
    console.log(`  top:      ${report(top)}`);
    for (const text of top.untranslated) console.log(`            - ${text}`);
    console.log(`  scrolled: ${report(scrolled)} over ${steps} screens`);
    for (const text of scrolled.untranslated) console.log(`            - ${text}`);
    console.log(`  restored first paragraph to English: ${restored}`);
    console.log(`  page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await page.close();
  }
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
console.log(`\nScreenshots: ${OUT}`);

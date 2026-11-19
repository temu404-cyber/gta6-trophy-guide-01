// Renders the screenshots in shots.json with headless Chromium (Playwright):
// serves app/ on a local port, opens each ?shot= scene at its viewport,
// waits for window.__shotReady, logs any console error, failed request or
// request leaving the local server, and saves a JPEG screenshot.
// Usage: node tools/render-shots.mjs [port]
// Requires: playwright-core installed and a Playwright Chromium build in
// ~/.cache/ms-playwright.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

// playwright-core lives in /tmp/shot-tools (installed for this dev task only);
// resolve it from there explicitly, ESM import maps ignore NODE_PATH.
const { chromium } = createRequire('/tmp/shot-tools/package.json')('playwright-core');

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.argv[2] ?? 8902);
const shots = JSON.parse(readFileSync(`${ROOT}shots.json`, 'utf8'));

function findChromium() {
  const base = `${process.env.HOME}/.cache/ms-playwright`;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith('chromium-')) continue;
    for (const exe of [`${base}/${dir}/chrome-linux64/chrome`, `${base}/${dir}/chrome-linux/chrome`]) {
      try {
        statSync(exe);
        return exe;
      } catch { /* try the next build */ }
    }
  }
  throw new Error(`no Chromium build found under ${base}`);
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const waitForServer = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
  server.stdout.on('data', () => { clearTimeout(timer); resolve(); });
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
});

try {
  await waitForServer;
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.viewport.width, height: shot.viewport.height } });
    const problems = [];
    page.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()}`));
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(`http://127.0.0.1:${PORT}/`) && !url.startsWith('data:')) {
        problems.push(`external request: ${url}`);
      }
    });
    await page.goto(`http://127.0.0.1:${PORT}${shot.path}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 20000 });
    await page.waitForTimeout(200);
    const file = `${ROOT}screenshots/${shot.file}`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
    const bytes = statSync(file).size;
    console.log(`${shot.file}: ${bytes} bytes${problems.length ? ` — WARNINGS: ${problems.join(' | ')}` : ''}`);
    if (bytes > 262144) console.log(`  !! over the 256 KiB gate cap`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
console.log('done');

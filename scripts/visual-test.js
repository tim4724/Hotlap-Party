// Visual regression test — captures screenshots of every key UI state
// Usage: node scripts/visual-test.js [--output dir] [--port 3000]
//
// Generates timestamped screenshots in screenshots/ (or custom dir).
// Compare against previous runs to detect UI regressions.

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
let outputDir = 'screenshots';
let port = 3000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output') outputDir = args[++i];
  else if (args[i] === '--port') port = parseInt(args[++i]);
}

const BASE = `http://localhost:${port}`;
const VIEWPORT = { width: 1280, height: 720 };

// Ensure output dir
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

function screenshotPath(name) {
  return join(outputDir, `${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Suppress external resource errors
  page.on('pageerror', () => {});

  let shotCount = 0;
  async function shot(name) {
    await page.screenshot({ path: screenshotPath(name) });
    shotCount++;
    console.log(`  ✓ ${name}`);
  }

  try {
    // --- 1. Welcome screen ---
    console.log('Welcome screen...');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await shot('01-welcome');

    // --- 2. Lobby screen (no players) ---
    console.log('Lobby screen...');
    await page.click('#new-game-btn');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 3000 });
    // Wait for QR to render
    await page.waitForTimeout(500);
    await shot('02-lobby-empty');

    // --- 3. Dev game — racing ---
    console.log('Racing (dev mode)...');
    await page.click('#solo-btn');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 3000 });
    // Let the track render and cars start moving
    await page.waitForTimeout(1500);
    await shot('03-racing');

    // --- 4. Pause overlay ---
    console.log('Pause overlay...');
    await page.click('#pause-btn');
    await page.waitForSelector('#pause-overlay:not(.hidden)', { timeout: 2000 });
    await page.waitForTimeout(200);
    await shot('04-paused');

    // --- 5. Resume and race for a bit ---
    console.log('Resume racing...');
    await page.click('#pause-continue-btn');
    await page.waitForFunction(() => document.getElementById('pause-overlay').classList.contains('hidden'), { timeout: 3000 });
    await page.waitForTimeout(1000);
    await shot('05-racing-resumed');

    // --- 6. Pause → New Game → back to lobby ---
    console.log('New game from pause...');
    await page.click('#pause-btn');
    await page.waitForSelector('#pause-overlay:not(.hidden)', { timeout: 2000 });
    await page.click('#pause-newgame-btn');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(300);
    await shot('06-lobby-after-newgame');

    // --- 7. Start another dev race, let it run longer ---
    console.log('Second race...');
    await page.click('#solo-btn');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(2000);
    await shot('07-racing-second');

    // --- 8. Controller page ---
    console.log('Controller page...');
    const controllerPage = await context.newPage();
    // Get room code from the lobby URL shown on page
    const roomUrl = await page.evaluate(() => {
      const el = document.getElementById('room-code');
      return el ? el.textContent : '';
    });
    // Extract the room code path or go to controller directly
    if (roomUrl) {
      const url = new URL(roomUrl);
      await controllerPage.goto(`${BASE}${url.pathname}`, { waitUntil: 'networkidle' });
    } else {
      await controllerPage.goto(`${BASE}/controller/`, { waitUntil: 'networkidle' });
    }
    await controllerPage.waitForTimeout(1000);
    await controllerPage.screenshot({ path: screenshotPath('08-controller') });
    shotCount++;
    console.log(`  ✓ 08-controller`);
    await controllerPage.close();

    console.log(`\nDone! ${shotCount} screenshots saved to ${outputDir}/`);

  } catch (err) {
    console.error('Error during visual test:', err.message);
    // Save a debug screenshot
    try { await shot('error-state'); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();

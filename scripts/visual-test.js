// Visual regression test — captures screenshots of every key UI state
// Usage: node scripts/visual-test.js [--output dir] [--port 3000]
//
// Generates screenshots in screenshots/ (or custom dir).
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

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

function screenshotPath(name) {
  return join(outputDir, `${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
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

    // --- 2. Lobby screen (empty) ---
    console.log('Lobby screen...');
    await page.click('#new-game-btn');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(500);
    await shot('02-lobby-empty');

    // --- 3. Lobby with 4 players ---
    console.log('Lobby with 4 players...');
    await page.evaluate(() => {
      const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
      const names = ['Alice', 'Bob', 'Charlie', 'Diana'];
      const list = document.getElementById('player-list');
      list.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const tag = document.createElement('div');
        tag.className = 'player-tag';
        tag.style.background = colors[i];
        tag.textContent = names[i];
        list.appendChild(tag);
      }
      document.getElementById('start-btn').disabled = false;
    });
    await page.waitForTimeout(200);
    await shot('03-lobby-4players');

    // --- 4. Dev race (2 players) ---
    console.log('Racing (2 players)...');
    await page.click('#solo-btn');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(1500);
    await shot('04-racing-2player');

    // --- 5. Pause overlay ---
    console.log('Pause overlay...');
    await page.click('#pause-btn');
    await page.waitForSelector('#pause-overlay:not(.hidden)', { timeout: 2000 });
    await page.waitForTimeout(200);
    await shot('05-paused');

    // --- 6. Resume ---
    console.log('Resume racing...');
    await page.click('#pause-continue-btn');
    await page.waitForFunction(() => document.getElementById('pause-overlay').classList.contains('hidden'), { timeout: 3000 });
    await page.waitForTimeout(1000);
    await shot('06-racing-resumed');

    // --- 7. Return to lobby, start 4-player race ---
    console.log('4-player race...');
    await page.click('#pause-btn');
    await page.waitForSelector('#pause-overlay:not(.hidden)', { timeout: 2000 });
    await page.click('#pause-newgame-btn');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 3000 });
    // Set 4-player mode before starting solo
    await page.evaluate(() => { window.__testPlayerCount = 4; });
    await page.click('#solo-btn');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(2000);
    await shot('07-racing-4player');

    // --- 8. Controller page ---
    console.log('Controller page...');
    const controllerPage = await context.newPage();
    const roomUrl = await page.evaluate(() => {
      const el = document.getElementById('room-code');
      return el ? el.textContent : '';
    });
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
    try { await shot('error-state'); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();

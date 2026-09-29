#!/usr/bin/env node
/**
 * Generate screenshots using Playwright (install with: npm install -D playwright)
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const screenshots = [
  {
    name: 'login-desktop',
    file: path.join(ROOT, 'examples/01-login-page/.design/prototype/screens/login.html'),
    output: path.join(ROOT, 'assets/screenshots/login-desktop.png'),
    viewport: { width: 1280, height: 800 }
  },
  {
    name: 'login-tablet',
    file: path.join(ROOT, 'examples/01-login-page/.design/prototype/screens/login.html'),
    output: path.join(ROOT, 'assets/screenshots/login-tablet.png'),
    viewport: { width: 768, height: 1024 }
  },
  {
    name: 'login-mobile',
    file: path.join(ROOT, 'examples/01-login-page/.design/prototype/screens/login.html'),
    output: path.join(ROOT, 'assets/screenshots/login-mobile.png'),
    viewport: { width: 390, height: 844 }
  }
];

async function captureScreenshot({ file, output, viewport }) {
  if (!existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    return false;
  }

  const outputDir = path.dirname(output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log(`📸 Capturing: ${path.basename(output)} (${viewport.width}x${viewport.height})`);
    
    const browser = await chromium.launch({ channel: 'chrome' });
    const context = await browser.newContext({ 
      viewport,
      deviceScaleFactor: 2  // Retina
    });
    const page = await context.newPage();
    
    await page.goto(`file://${file}`);
    await page.waitForTimeout(1000);  // Wait for animations
    
    await page.screenshot({ 
      path: output,
      fullPage: false 
    });
    
    await browser.close();
    
    console.log(`✅ Saved: ${output}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('🎨 Generating screenshots with Playwright...\n');

  let success = 0;
  let failed = 0;

  for (const shot of screenshots) {
    const result = await captureScreenshot(shot);
    if (result) success++;
    else failed++;
  }

  console.log(`\n📊 Results: ${success} success, ${failed} failed`);
  
  if (success > 0) {
    console.log(`\n✨ Screenshots saved in: ${path.join(ROOT, 'assets/screenshots/')}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();

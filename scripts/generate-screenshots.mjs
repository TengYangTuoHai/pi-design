#!/usr/bin/env node
/**
 * Generate screenshots for examples using Chrome headless
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const screenshots = [
  {
    name: 'login-desktop',
    file: path.join(ROOT, 'examples/01-login-page/.design/prototype/screens/login.html'),
    output: path.join(ROOT, 'assets/screenshots/login-desktop.png'),
    viewport: '1280,800'
  },
  {
    name: 'login-tablet',
    file: path.join(ROOT, 'examples/01-login-page/.design/prototype/screens/login.html'),
    output: path.join(ROOT, 'assets/screenshots/login-tablet.png'),
    viewport: '768,1024'
  },
  {
    name: 'login-mobile',
    file: path.join(ROOT, 'examples/01-login-page/.design/prototype/screens/login.html'),
    output: path.join(ROOT, 'assets/screenshots/login-mobile.png'),
    viewport: '390,844'
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

  const url = `file://${file}`;
  const tmpDir = `/tmp/chrome-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--user-data-dir=${tmpDir}`,
    `--window-size=${viewport}`,
    `--screenshot=${output}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=2', // Retina
    '--default-background-color=0',
    url
  ];

  return new Promise((resolve) => {
    console.log(`📸 Capturing: ${path.basename(output)} (${viewport})`);
    const proc = spawn(CHROME, args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000 
    });

    let stderr = '';
    proc.stderr?.on('data', (d) => stderr += d.toString());

    proc.on('close', (code) => {
      if (code === 0 && existsSync(output)) {
        console.log(`✅ Saved: ${output}`);
        resolve(true);
      } else {
        console.error(`❌ Failed: ${path.basename(output)}`);
        if (stderr) console.error(stderr);
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      console.error(`❌ Error: ${err.message}`);
      resolve(false);
    });

    setTimeout(() => {
      proc.kill();
      console.error(`❌ Timeout: ${path.basename(output)}`);
      resolve(false);
    }, 10000);
  });
}

async function main() {
  console.log('🎨 Generating screenshots...\n');

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

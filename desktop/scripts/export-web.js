#!/usr/bin/env node
'use strict';

/**
 * Build the Expo web bundle into desktop/web/.
 *
 * A one-line npm script ("cd .. && npx expo export …") would do the same thing
 * on a Mac and quietly misbehave on Windows, where npm runs scripts through
 * cmd.exe. Spawning with an explicit cwd keeps the two machines honest, and
 * lets the build fail loudly if the export produced no index.html.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const projectDir = path.resolve(desktopDir, '..');
const outDir = path.join(desktopDir, 'web');

fs.rmSync(outDir, { recursive: true, force: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['expo', 'export', '--platform', 'web', '--output-dir', outDir];

console.log(`> expo export --platform web  (from ${projectDir})`);
const result = spawnSync(npx, args, {
  cwd: projectDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`\nCould not run expo: ${result.error.message}`);
  console.error('Is the project root installed? Run "npm install" one folder up.');
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error(`\nexpo export finished but produced no index.html in ${outDir}`);
  process.exit(1);
}

console.log(`\nWeb bundle ready: ${outDir}`);

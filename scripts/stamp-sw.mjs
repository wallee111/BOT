// Stamps a unique build ID into dist/sw.js so every build gets a fresh
// service worker cache version — no manual CACHE_VERSION bump required.
// Without this, the cache-first fetch strategy in sw.js can keep serving
// stale assets after a rebuild (web or Capacitor) until the version string
// changes.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../dist/sw.js');

if (!existsSync(swPath)) {
  console.warn('[stamp-sw] dist/sw.js not found, skipping');
  process.exit(0);
}

const buildId = Date.now().toString(36);
const contents = readFileSync(swPath, 'utf8');
const stamped = contents.replace('__BUILD_ID__', buildId);

if (stamped === contents) {
  console.warn('[stamp-sw] __BUILD_ID__ placeholder not found in dist/sw.js — is public/sw.js still using it?');
}

writeFileSync(swPath, stamped);
console.log(`[stamp-sw] stamped dist/sw.js with build id ${buildId}`);

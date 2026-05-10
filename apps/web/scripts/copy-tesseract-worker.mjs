/**
 * copy-tesseract-worker.mjs
 * Copies the Tesseract.js web worker bundle to /public so it is served from
 * the same origin (avoids cross-origin importScripts failures on mobile).
 * Run automatically before `next build` via the prebuild script.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const dest = join(root, 'public', 'tesseract-worker.min.js');

mkdirSync(join(root, 'public'), { recursive: true });
copyFileSync(src, dest);
console.log('[copy-tesseract-worker] Copied worker.min.js → public/tesseract-worker.min.js');

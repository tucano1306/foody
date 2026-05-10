/**
 * copy-tesseract-worker.mjs
 * Copies Tesseract.js worker + WASM core files to /public so they are served
 * from the same origin (avoids cross-origin importScripts failures on mobile).
 * Run automatically before `next build` via the prebuild script.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Worker bundle ──────────────────────────────────────────────────────────
const workerSrc = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
mkdirSync(join(root, 'public'), { recursive: true });
copyFileSync(workerSrc, join(root, 'public', 'tesseract-worker.min.js'));
console.log('[copy-tesseract] worker.min.js → public/tesseract-worker.min.js');

// ── WASM core (LSTM variants only — OEM=1 LSTM_ONLY) ──────────────────────
const coreCandidates = [
  join(root, 'node_modules', 'tesseract.js-core'),
  join(root, '..', '..', 'node_modules', '.pnpm', 'tesseract.js-core@7.0.0', 'node_modules', 'tesseract.js-core'),
];
const corePackage = coreCandidates.find(existsSync);
if (!corePackage) {
  console.error('[copy-tesseract] ERROR: tesseract.js-core not found in:', coreCandidates);
  process.exit(1);
}

const coreDest = join(root, 'public', 'tesseract-core');
mkdirSync(coreDest, { recursive: true });

for (const file of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  copyFileSync(join(corePackage, file), join(coreDest, file));
  console.log(`[copy-tesseract] ${file} → public/tesseract-core/${file}`);
}

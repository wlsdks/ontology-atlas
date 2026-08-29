/**
 * Raster-first brand baker.
 *
 * A browser canvas composites the native 64/32/16 mascot masters without image
 * smoothing, then stamps the exact PWA, Open Graph, macOS, Windows, README, and
 * in-app raster set. No vector approximation of the mascot exists.
 *
 * Usage:
 *   node scripts/build-brand-assets.mjs
 *   node scripts/build-brand-raster.mjs
 *   open http://127.0.0.1:8231/ in the repository browser
 *   node scripts/install-brand-icons.mjs
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  MASCOT_PALETTE,
  readMascotMasters,
} from './build-brand-assets.mjs';

const PORT = 8231;
const OUT = '.qa-scratch/brand/png';
const MAX_SAVE_BODY_BYTES = 64 * 1024 * 1024;

/** [output name, master, physical size, plate treatment]. */
export const ICON_RASTER_PLAN = Object.freeze([
  ['icon-1024', 'full', 1024, 'squircle'],
  ['icon-512', 'full', 512, 'squircle'],
  ['icon-256', 'full', 256, 'squircle'],
  ['icon-128', 'full', 128, 'squircle'],
  ['icon-64', 'full', 64, 'squircle'],
  ['icon-48', 'compact', 48, 'squircle'],
  ['icon-32', 'compact', 32, 'squircle'],
  ['icon-16', 'micro', 16, 'squircle'],
  // Retina partners keep the same logical drawing at twice the physical pixels.
  ['micro-32', 'micro', 32, 'squircle'],
  ['compact-64', 'compact', 64, 'squircle'],
  ['tile-310', 'full', 310, 'squircle'],
  ['tile-284', 'full', 284, 'squircle'],
  ['tile-150', 'full', 150, 'squircle'],
  ['tile-142', 'full', 142, 'squircle'],
  ['tile-107', 'full', 107, 'squircle'],
  ['tile-89', 'full', 89, 'squircle'],
  ['tile-71', 'full', 71, 'squircle'],
  ['tile-50', 'compact', 50, 'squircle'],
  ['tile-44', 'compact', 44, 'squircle'],
  ['tile-30', 'micro', 30, 'squircle'],
  ['apple-180', 'full', 180, 'full-bleed'],
  // Mobile packaging trees are not the current delivery surface, but leaving
  // their committed PNGs on the retired mark would make the replacement partial.
  ['mobile-20', 'micro', 20, 'squircle'],
  ['mobile-29', 'micro', 29, 'squircle'],
  ['mobile-40', 'compact', 40, 'squircle'],
  ['mobile-58', 'compact', 58, 'squircle'],
  ['mobile-60', 'compact', 60, 'squircle'],
  ['mobile-72', 'full', 72, 'squircle'],
  ['mobile-76', 'full', 76, 'squircle'],
  ['mobile-80', 'full', 80, 'squircle'],
  ['mobile-87', 'full', 87, 'squircle'],
  ['mobile-96', 'full', 96, 'squircle'],
  ['mobile-120', 'full', 120, 'squircle'],
  ['mobile-144', 'full', 144, 'squircle'],
  ['mobile-152', 'full', 152, 'squircle'],
  ['mobile-167', 'full', 167, 'squircle'],
  ['mobile-180', 'full', 180, 'squircle'],
  ['mobile-192', 'full', 192, 'squircle'],
]);

/** Transparent standalone marks consumed inside the app and by brand lockups. */
const MARK_RASTER_PLAN = Object.freeze([
  ['mark-full', 'full', 512],
  ['mark-compact', 'compact', 64],
  ['mark-micro', 'micro', 16],
  ['foreground-108', 'full', 108],
  ['foreground-162', 'full', 162],
  ['foreground-216', 'full', 216],
  ['foreground-324', 'full', 324],
  ['foreground-432', 'full', 432],
]);

/** [name, width, height, tone, tagline]. */
const LOCKUP_RASTER_PLAN = Object.freeze([
  ['lockup', 520, 96, 'brand', true],
  ['lockup@2x', 1040, 192, 'brand', true],
  ['lockup-light@2x', 1040, 192, 'light', true],
  ['lockup-dark@2x', 1040, 192, 'dark', true],
  ['lockup-compact', 460, 96, 'dark', false],
]);

export const RASTER_OUTPUT_NAMES = Object.freeze({
  png: Object.freeze([
    ...ICON_RASTER_PLAN.map(([name]) => name),
    ...MARK_RASTER_PLAN.map(([name]) => name),
    ...LOCKUP_RASTER_PLAN.map(([name]) => name),
    'icon-light',
    'icon-dark',
    'og-image',
  ]),
});

const fontBase64 = () =>
  readFileSync(
    'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  ).toString('base64');

function pageForSaveToken(saveToken) {
  return readFileSync(new URL('./brand-raster-page.html', import.meta.url), 'utf8').replace(
    '__SAVE_TOKEN__',
    JSON.stringify(saveToken),
  );
}

function assertExactOutputNames(record, expectedNames) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('PNG outputs must be an object');
  }
  const expected = new Set(expectedNames);
  for (const name of Object.keys(record)) {
    if (!expected.has(name)) throw new Error('unexpected PNG output name: ' + name);
  }
  for (const name of expectedNames) {
    if (!Object.hasOwn(record, name)) throw new Error('missing PNG output name: ' + name);
  }
}

export function saveRasterPayload(payload, { pngOut = OUT } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('raster payload must be an object');
  }
  const { png } = payload;
  assertExactOutputNames(png, RASTER_OUTPUT_NAMES.png);

  const decoded = new Map();
  for (const name of RASTER_OUTPUT_NAMES.png) {
    if (typeof png[name] !== 'string') throw new Error('PNG output must be base64 text: ' + name);
    const bytes = Buffer.from(png[name], 'base64');
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error('PNG output has an invalid signature: ' + name);
    }
    decoded.set(name, bytes);
  }

  mkdirSync(pngOut, { recursive: true });
  for (const [name, bytes] of decoded) writeFileSync(join(pngOut, name + '.png'), bytes);
  return { png: decoded.size };
}

export function createBrandRasterServer({
  saveToken = randomUUID(),
  pngOut = OUT,
} = {}) {
  const page = pageForSaveToken(saveToken);
  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/data') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          name: BRAND_NAME,
          tagline: BRAND_TAGLINE,
          palette: MASCOT_PALETTE,
          masters: readMascotMasters(),
          iconPlan: ICON_RASTER_PLAN,
          markPlan: MARK_RASTER_PLAN,
          lockupPlan: LOCKUP_RASTER_PLAN,
          font: fontBase64(),
        }),
      );
      return;
    }
    if (requestUrl.pathname === '/save' && req.method === 'POST') {
      if (requestUrl.searchParams.get('token') !== saveToken) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('forbidden');
        return;
      }
      let body = '';
      let bodyBytes = 0;
      req.on('data', (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes <= MAX_SAVE_BODY_BYTES) body += chunk;
      });
      req.on('end', () => {
        if (bodyBytes > MAX_SAVE_BODY_BYTES) {
          res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' }).end('payload too large');
          return;
        }
        try {
          const saved = saveRasterPayload(JSON.parse(body), { pngOut });
          console.log('[brand-raster] wrote ' + saved.png + ' PNG files to ' + pngOut);
          res.writeHead(200).end('ok');
          server.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[brand-raster] save rejected: ' + message);
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('invalid payload');
        }
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createBrandRasterServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log('[brand-raster] open http://127.0.0.1:' + PORT + '/');
  });
}

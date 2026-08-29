/**
 * Raster-first brand source contract.
 *
 * The shipping identity is native pixel art, so its canonical source is three
 * authored PNG grids rather than duplicated SVG geometry. Browser, PWA, Open
 * Graph, macOS, and Windows outputs all derive from these exact masters through
 * `build-brand-raster.mjs`; `install-brand-icons.mjs` owns the final fan-out.
 *
 * Spec source: `docs/DECISIONS.md`, 2026-08-28 pixel mascot identity record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BRAND_NAME = 'Ontology Atlas';
export const BRAND_TAGLINE = 'Understand your codebase.';

/** Fixed inside mascot pixels only; these values are not an application palette. */
export const MASCOT_PALETTE = Object.freeze({
  outline: '#0B0B0D',
  face: '#F7F5E6',
  signal: '#C6F000',
  suitHighlight: '#5B5B66',
});

/**
 * Each small size is separately authored. Scaling the 64px figure down is a
 * regression: the body and antenna collapse before the face does.
 */
export const MASCOT_MASTERS = Object.freeze({
  full: Object.freeze({
    path: 'assets/brand/mascot/mascot-full-64.png',
    width: 64,
    height: 64,
  }),
  compact: Object.freeze({
    path: 'assets/brand/mascot/mascot-compact-32.png',
    width: 32,
    height: 32,
  }),
  micro: Object.freeze({
    path: 'assets/brand/mascot/mascot-micro-16.png',
    width: 16,
    height: 16,
  }),
});

export const MASCOT_MOTION_ROWS = Object.freeze({
  walk: Object.freeze({
    path: 'assets/brand/mascot/mascot-walk-row-64.png',
    width: 384,
    height: 64,
    frames: 6,
  }),
  read: Object.freeze({
    path: 'assets/brand/mascot/mascot-read-row-64.png',
    width: 384,
    height: 64,
    frames: 6,
  }),
  success: Object.freeze({
    path: 'assets/brand/mascot/mascot-success-row-64.png',
    width: 384,
    height: 64,
    frames: 6,
  }),
});

export const MASCOT_TRAY_TEMPLATES = Object.freeze({
  oneX: Object.freeze({
    path: 'assets/brand/mascot/mascot-tray-template-16.png',
    width: 16,
    height: 16,
  }),
  twoX: Object.freeze({
    path: 'assets/brand/mascot/mascot-tray-template-32.png',
    width: 32,
    height: 32,
  }),
});

/**
 * Logical-size selection, before Retina multiplication. A 16pt Retina icon uses
 * the micro drawing at 32 physical pixels; it does not switch to compact art.
 */
export function mascotDetailForLogicalSize(size) {
  if (!Number.isFinite(size) || size <= 0) throw new Error(`invalid brand size: ${size}`);
  if (size <= 18) return 'micro';
  if (size <= 48) return 'compact';
  return 'full';
}

/** Width/height from the PNG IHDR without adding an image dependency. */
function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 26) throw new Error('PNG is truncated');
  if (buffer.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('invalid PNG signature');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function readMascotMasters(root = process.cwd()) {
  return Object.fromEntries(
    Object.entries(MASCOT_MASTERS).map(([detail, spec]) => {
      const bytes = readFileSync(join(root, spec.path));
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== spec.width || dimensions.height !== spec.height) {
        throw new Error(
          `${spec.path} must be ${spec.width}x${spec.height}, got ` +
            `${dimensions.width}x${dimensions.height}`,
        );
      }
      // PNG colour type 6 is RGBA. An opaque RGB source cannot serve an in-app
      // mascot without baking a box around every pose.
      if (bytes[25] !== 6) throw new Error(`${spec.path} must be an RGBA PNG`);
      return [detail, { ...spec, base64: bytes.toString('base64') }];
    }),
  );
}

export function readMascotMotionRows(root = process.cwd()) {
  return Object.fromEntries(
    Object.entries(MASCOT_MOTION_ROWS).map(([state, spec]) => {
      const bytes = readFileSync(join(root, spec.path));
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== spec.width || dimensions.height !== spec.height) {
        throw new Error(
          `${spec.path} must be ${spec.width}x${spec.height}, got ` +
            `${dimensions.width}x${dimensions.height}`,
        );
      }
      if (bytes[25] !== 6) throw new Error(`${spec.path} must be an RGBA PNG`);
      return [state, { ...spec, base64: bytes.toString('base64') }];
    }),
  );
}

export function readMascotTrayTemplates(root = process.cwd()) {
  return Object.fromEntries(
    Object.entries(MASCOT_TRAY_TEMPLATES).map(([density, spec]) => {
      const bytes = readFileSync(join(root, spec.path));
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== spec.width || dimensions.height !== spec.height) {
        throw new Error(
          `${spec.path} must be ${spec.width}x${spec.height}, got ` +
            `${dimensions.width}x${dimensions.height}`,
        );
      }
      if (bytes[25] !== 6) throw new Error(`${spec.path} must be an RGBA PNG`);
      return [density, { ...spec, base64: bytes.toString('base64') }];
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const masters = readMascotMasters();
  for (const [detail, spec] of Object.entries(masters)) {
    console.log(`[brand-source] ${detail}: ${spec.path} (${spec.width}x${spec.height} RGBA)`);
  }
  for (const [state, spec] of Object.entries(readMascotMotionRows())) {
    console.log(`[brand-source] ${state}: ${spec.path} (${spec.frames} frames)`);
  }
  for (const [density, spec] of Object.entries(readMascotTrayTemplates())) {
    console.log(`[brand-source] tray ${density}: ${spec.path} (${spec.width}x${spec.height})`);
  }
}

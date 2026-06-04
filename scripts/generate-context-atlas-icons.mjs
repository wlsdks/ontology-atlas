#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng({ width, height, rgba }) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function color(hex, alpha = 255) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function blendPixel(rgba, width, x, y, source) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 4;
  if (offset < 0 || offset >= rgba.length) return;

  const sourceAlpha = source[3] / 255;
  const destAlpha = rgba[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;

  for (let i = 0; i < 3; i += 1) {
    rgba[offset + i] = Math.round(
      (source[i] * sourceAlpha + rgba[offset + i] * destAlpha * (1 - sourceAlpha)) / outAlpha,
    );
  }
  rgba[offset + 3] = Math.round(outAlpha * 255);
}

function roundedRectCoverage(x, y, width, height, radius) {
  const px = Math.abs(x - width / 2) - (width / 2 - radius);
  const py = Math.abs(y - height / 2) - (height / 2 - radius);
  const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0));
  const inside = Math.min(Math.max(px, py), 0);
  const distance = outside + inside - radius;
  return clamp(0.5 - distance);
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / len2);
  const x = ax + t * vx;
  const y = ay + t * vy;
  return Math.hypot(px - x, py - y);
}

function drawLine(rgba, width, height, ax, ay, bx, by, lineWidth, stroke) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - lineWidth - 2));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + lineWidth + 2));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - lineWidth - 2));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by) + lineWidth + 2));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = segmentDistance(x + 0.5, y + 0.5, ax, ay, bx, by);
      const coverage = clamp(lineWidth / 2 + 0.8 - distance);
      if (coverage > 0) {
        blendPixel(rgba, width, x, y, [stroke[0], stroke[1], stroke[2], Math.round(stroke[3] * coverage)]);
      }
    }
  }
}

function drawCircle(rgba, width, height, cx, cy, radius, fill, ring = null) {
  const minX = Math.max(0, Math.floor(cx - radius - 3));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 3));
  const minY = Math.max(0, Math.floor(cy - radius - 3));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + 3));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const fillCoverage = clamp(radius + 0.8 - distance);
      if (fillCoverage > 0) {
        blendPixel(rgba, width, x, y, [fill[0], fill[1], fill[2], Math.round(fill[3] * fillCoverage)]);
      }
      if (ring) {
        const ringCoverage = clamp(1.8 - Math.abs(distance - radius));
        if (ringCoverage > 0) {
          blendPixel(rgba, width, x, y, [ring[0], ring[1], ring[2], Math.round(ring[3] * ringCoverage)]);
        }
      }
    }
  }
}

function createIcon(size, { padding = 0.08 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const bgA = color("#08090a");
  const bgB = color("#12131a");
  const panel = color("#181a24");
  const indigo = color("#7170ff");
  const indigoSoft = color("#9aa4ff", 210);
  const ink = color("#e8ebff", 235);
  const muted = color("#3b4166", 150);
  const radius = size * 0.22;
  const pad = size * padding;
  const rect = { x: pad, y: pad, w: size - pad * 2, h: size - pad * 2, r: radius };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = x + 0.5 - size / 2;
      const cy = y + 0.5 - size / 2;
      const rectCoverage = roundedRectCoverage(x + 0.5 - rect.x, y + 0.5 - rect.y, rect.w, rect.h, rect.r);
      if (rectCoverage <= 0) continue;
      const radial = clamp(1 - Math.hypot(cx, cy) / (size * 0.72));
      const top = clamp((size - y) / size);
      const r = mix(bgA[0], bgB[0], radial * 0.75 + top * 0.08);
      const g = mix(bgA[1], bgB[1], radial * 0.75 + top * 0.08);
      const b = mix(bgA[2], bgB[2], radial * 0.75 + top * 0.08);
      blendPixel(rgba, size, x, y, [r, g, b, Math.round(255 * rectCoverage)]);
    }
  }

  // Inner atlas plane.
  drawCircle(rgba, size, size, size * 0.5, size * 0.5, size * 0.335, [panel[0], panel[1], panel[2], 125], [muted[0], muted[1], muted[2], 110]);

  const points = {
    top: [size * 0.5, size * 0.245],
    left: [size * 0.315, size * 0.69],
    right: [size * 0.69, size * 0.69],
    midLeft: [size * 0.405, size * 0.515],
    midRight: [size * 0.595, size * 0.515],
    orbitLeft: [size * 0.245, size * 0.425],
    orbitRight: [size * 0.755, size * 0.43],
  };

  const edge = [indigo[0], indigo[1], indigo[2], Math.round(size < 64 ? 190 : 150)];
  const edgeStrong = [indigoSoft[0], indigoSoft[1], indigoSoft[2], 220];
  const stroke = Math.max(2.2, size * 0.026);
  const thin = Math.max(1.2, size * 0.009);

  drawLine(rgba, size, size, ...points.left, ...points.top, stroke, edgeStrong);
  drawLine(rgba, size, size, ...points.top, ...points.right, stroke, edgeStrong);
  drawLine(rgba, size, size, ...points.midLeft, ...points.midRight, stroke * 0.82, edgeStrong);
  drawLine(rgba, size, size, ...points.orbitLeft, ...points.midLeft, thin, edge);
  drawLine(rgba, size, size, ...points.midRight, ...points.orbitRight, thin, edge);
  drawLine(rgba, size, size, ...points.orbitLeft, ...points.top, thin, [edge[0], edge[1], edge[2], 95]);
  drawLine(rgba, size, size, ...points.top, ...points.orbitRight, thin, [edge[0], edge[1], edge[2], 95]);

  const nodeFill = [ink[0], ink[1], ink[2], 245];
  const nodeRing = [indigo[0], indigo[1], indigo[2], 240];
  const nodeRadius = Math.max(3.2, size * 0.035);
  const smallRadius = Math.max(2.2, size * 0.022);
  for (const key of ["left", "right", "top"]) {
    drawCircle(rgba, size, size, points[key][0], points[key][1], nodeRadius, nodeFill, nodeRing);
  }
  for (const key of ["midLeft", "midRight", "orbitLeft", "orbitRight"]) {
    drawCircle(rgba, size, size, points[key][0], points[key][1], smallRadius, [indigoSoft[0], indigoSoft[1], indigoSoft[2], 230], [ink[0], ink[1], ink[2], 160]);
  }

  // Border last so the app icon reads as a native rounded tile.
  const border = color("#5e6ad2", 130);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const localX = x + 0.5 - rect.x;
      const localY = y + 0.5 - rect.y;
      const outer = roundedRectCoverage(localX, localY, rect.w, rect.h, rect.r);
      const inner = roundedRectCoverage(localX - 1.5, localY - 1.5, rect.w - 3, rect.h - 3, rect.r - 1.5);
      const borderCoverage = clamp(outer - inner + 0.04);
      if (borderCoverage > 0.02) {
        blendPixel(rgba, size, x, y, [border[0], border[1], border[2], Math.round(border[3] * borderCoverage)]);
      }
    }
  }

  return encodePng({ width: size, height: size, rgba });
}

function createOgImage(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const bgA = color("#08090a");
  const bgB = color("#11131b");
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rx = (x - width * 0.46) / width;
      const ry = (y - height * 0.48) / height;
      const radial = clamp(1 - Math.hypot(rx, ry) * 2.0);
      const offset = (y * width + x) * 4;
      rgba[offset] = mix(bgA[0], bgB[0], radial);
      rgba[offset + 1] = mix(bgA[1], bgB[1], radial);
      rgba[offset + 2] = mix(bgA[2], bgB[2], radial);
      rgba[offset + 3] = 255;
    }
  }

  const icon = createIcon(720, { padding: 0.03 });
  const decoded = decodePngRgba(icon);
  const startX = Math.round((width - decoded.width) / 2);
  const startY = Math.round((height - decoded.height) / 2);
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const sourceOffset = (y * decoded.width + x) * 4;
      blendPixel(rgba, width, startX + x, startY + y, [
        decoded.rgba[sourceOffset],
        decoded.rgba[sourceOffset + 1],
        decoded.rgba[sourceOffset + 2],
        decoded.rgba[sourceOffset + 3],
      ]);
    }
  }

  return encodePng({ width, height, rgba });
}

function decodePngRgba(png) {
  // This helper only decodes PNGs produced by encodePng above.
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.slice(offset + 4, offset + 8).toString("ascii");
    const data = png.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    inflated.copy(rgba, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  }
  return { width, height, rgba };
}

function writePng(relativePath, size) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, createIcon(size));
}

function writeIco(relativePath, sizes) {
  const images = sizes.map((size) => ({ size, png: createIcon(size) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let imageOffset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    imageOffset += png.length;
    return entry;
  });
  const file = path.join(root, relativePath);
  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...images.map((image) => image.png)]));
}

function writeIcns() {
  const iconset = path.join(root, "src-tauri/icons/context-atlas.iconset");
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  const entries = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];
  for (const [name, size] of entries) {
    fs.writeFileSync(path.join(iconset, name), createIcon(size));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(root, "src-tauri/icons/icon.icns")], {
    stdio: "inherit",
  });
  fs.rmSync(iconset, { recursive: true, force: true });
}

const pngTargets = [
  ["public/logo.png", 1024],
  ["src-tauri/icons/icon.png", 512],
  ["src-tauri/icons/128x128.png", 128],
  ["src-tauri/icons/128x128@2x.png", 256],
  ["src-tauri/icons/32x32.png", 32],
  ["src-tauri/icons/64x64.png", 64],
  ["src-tauri/icons/Square107x107Logo.png", 107],
  ["src-tauri/icons/Square142x142Logo.png", 142],
  ["src-tauri/icons/Square150x150Logo.png", 150],
  ["src-tauri/icons/Square284x284Logo.png", 284],
  ["src-tauri/icons/Square30x30Logo.png", 30],
  ["src-tauri/icons/Square310x310Logo.png", 310],
  ["src-tauri/icons/Square44x44Logo.png", 44],
  ["src-tauri/icons/Square71x71Logo.png", 71],
  ["src-tauri/icons/Square89x89Logo.png", 89],
  ["src-tauri/icons/StoreLogo.png", 50],
  ["src-tauri/icons/android/mipmap-hdpi/ic_launcher.png", 49],
  ["src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png", 162],
  ["src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png", 49],
  ["src-tauri/icons/android/mipmap-mdpi/ic_launcher.png", 48],
  ["src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png", 108],
  ["src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png", 48],
  ["src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png", 96],
  ["src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png", 216],
  ["src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png", 96],
  ["src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png", 144],
  ["src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png", 324],
  ["src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png", 144],
  ["src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png", 192],
  ["src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png", 432],
  ["src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png", 192],
  ["src-tauri/icons/ios/AppIcon-20x20@1x.png", 20],
  ["src-tauri/icons/ios/AppIcon-20x20@2x-1.png", 40],
  ["src-tauri/icons/ios/AppIcon-20x20@2x.png", 40],
  ["src-tauri/icons/ios/AppIcon-20x20@3x.png", 60],
  ["src-tauri/icons/ios/AppIcon-29x29@1x.png", 29],
  ["src-tauri/icons/ios/AppIcon-29x29@2x-1.png", 58],
  ["src-tauri/icons/ios/AppIcon-29x29@2x.png", 58],
  ["src-tauri/icons/ios/AppIcon-29x29@3x.png", 87],
  ["src-tauri/icons/ios/AppIcon-40x40@1x.png", 40],
  ["src-tauri/icons/ios/AppIcon-40x40@2x-1.png", 80],
  ["src-tauri/icons/ios/AppIcon-40x40@2x.png", 80],
  ["src-tauri/icons/ios/AppIcon-40x40@3x.png", 120],
  ["src-tauri/icons/ios/AppIcon-512@2x.png", 1024],
  ["src-tauri/icons/ios/AppIcon-60x60@2x.png", 120],
  ["src-tauri/icons/ios/AppIcon-60x60@3x.png", 180],
  ["src-tauri/icons/ios/AppIcon-76x76@1x.png", 76],
  ["src-tauri/icons/ios/AppIcon-76x76@2x.png", 152],
  ["src-tauri/icons/ios/AppIcon-83.5x83.5@2x.png", 167],
];

for (const [relativePath, size] of pngTargets) writePng(relativePath, size);
fs.writeFileSync(path.join(root, "public/og-image.png"), createOgImage(1536, 1024));
writeIco("src-tauri/icons/icon.ico", [16, 32, 48, 256]);
writeIcns();

console.log(`[context-atlas-icons] generated ${pngTargets.length} PNG icons + icon.ico + icon.icns + public/og-image.png`);

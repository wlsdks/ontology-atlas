import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { once } from 'node:events';
import { request } from 'node:http';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MASCOT_PRESENTATION_MASTER, readMascotPresentationMaster } from './build-brand-assets.mjs';
import {
  RASTER_OUTPUT_NAMES,
  createBrandRasterServer,
  saveRasterPayload,
} from './build-brand-raster.mjs';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

describe('large character artwork delivery', () => {
  it('preserves the detailed artwork and its clear margin in the large platform icon', async () => {
    const master = readMascotPresentationMaster();
    const source = await sharp(Buffer.from(master.base64, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const icon = await sharp('src-tauri/icons/icon.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const scale = icon.info.width / source.info.width;
    assert.equal(Number.isInteger(scale), true, 'large art must use whole native pixels');
    assert.equal(icon.info.height, source.info.height * scale);
    let measured = 0;
    for (let y = 0; y < source.info.height; y++) {
      for (let x = 0; x < source.info.width; x++) {
        const i = (y * source.info.width + x) * 4;
        const alpha = source.data[i + 3];
        assert.ok(alpha === 0 || alpha === 255, 'presentation pixels must have clean alpha');
        if (!alpha) continue;
        assert.ok(x >= 8 && y >= 8 && x < source.info.width - 8 && y < source.info.height - 8, 'character must clear the platform mask');
        for (const [dx, dy] of [[0, 0], [scale - 1, scale - 1]]) {
          const target = ((y * scale + dy) * icon.info.width + x * scale + dx) * 4;
          assert.deepEqual(icon.data.subarray(target, target + 4), source.data.subarray(i, i + 4), `large icon lost authored detail at ${x},${y}`);
        }
        measured++;
      }
    }
    assert.ok(measured > 0, 'the character audit measured no painted pixels');
  });

  it('rejects a low-resolution sprite substituted for the presentation master', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-character-resolution-'));
    try {
      const destination = path.join(root, MASCOT_PRESENTATION_MASTER.path);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, readFileSync('assets/brand/mascot/mascot-full-64.png'));
      assert.throws(() => readMascotPresentationMaster(root), /must be 128x128, got 64x64/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('brand raster save boundary', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ontology-atlas-brand-test-')));
    roots.push(root);
    return {
      root,
      pngOut: path.join(root, 'png'),
    };
  }

  function completePayload() {
    const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    return {
      png: Object.fromEntries(RASTER_OUTPUT_NAMES.png.map((name) => [name, pngBytes])),
    };
  }

  it('writes only the exact output names declared by the render plan', () => {
    const paths = fixture();
    saveRasterPayload(completePayload(), paths);

    assert.equal(
      readFileSync(path.join(paths.pngOut, `${RASTER_OUTPUT_NAMES.png[0]}.png`)).subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
    );
  });

  it('rejects path-like output names before writing any file', () => {
    const paths = fixture();
    const payload = completePayload();
    payload.png['../../outside'] = payload.png[RASTER_OUTPUT_NAMES.png[0]];

    assert.throws(() => saveRasterPayload(payload, paths), /unexpected PNG output name/i);
    assert.equal(existsSync(path.join(paths.root, 'outside.png')), false);
    assert.equal(existsSync(paths.pngOut), false);
  });

  it('rejects loopback save requests that do not carry this run token', async () => {
    const paths = fixture();
    const server = createBrandRasterServer({
      saveToken: 'expected-token',
      pngOut: paths.pngOut,
    });
    server.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      assert.equal(typeof address, 'object');
      const response = await postJson(address.port, '/save', '{}');
      assert.equal(response.statusCode, 403);
      assert.equal(existsSync(paths.pngOut), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

function postJson(port, requestPath, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    });
    req.on('error', reject);
    req.end(body);
  });
}

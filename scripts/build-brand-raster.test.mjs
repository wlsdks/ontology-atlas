import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { once } from 'node:events';
import { request } from 'node:http';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  RASTER_OUTPUT_NAMES,
  createBrandRasterServer,
  saveRasterPayload,
} from './build-brand-raster.mjs';

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
      brandOut: path.join(root, 'brand'),
    };
  }

  function completePayload() {
    const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    return {
      png: Object.fromEntries(RASTER_OUTPUT_NAMES.png.map((name) => [name, pngBytes])),
      svgs: Object.fromEntries(
        RASTER_OUTPUT_NAMES.svg.map((name) => [name, '<svg viewBox="0 0 1 1"></svg>']),
      ),
    };
  }

  it('writes only the exact output names declared by the render plan', () => {
    const paths = fixture();
    saveRasterPayload(completePayload(), paths);

    assert.equal(
      readFileSync(path.join(paths.pngOut, `${RASTER_OUTPUT_NAMES.png[0]}.png`)).subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
    );
    assert.match(
      readFileSync(path.join(paths.brandOut, `${RASTER_OUTPUT_NAMES.svg[0]}.svg`), 'utf-8'),
      /^<svg/,
    );
  });

  it('rejects path-like output names before writing any file', () => {
    const paths = fixture();
    const payload = completePayload();
    payload.png['../../outside'] = payload.png[RASTER_OUTPUT_NAMES.png[0]];

    assert.throws(() => saveRasterPayload(payload, paths), /unexpected PNG output name/i);
    assert.equal(existsSync(path.join(paths.root, 'outside.png')), false);
    assert.equal(existsSync(paths.pngOut), false);
    assert.equal(existsSync(paths.brandOut), false);
  });

  it('rejects loopback save requests that do not carry this run token', async () => {
    const paths = fixture();
    const server = createBrandRasterServer({
      saveToken: 'expected-token',
      pngOut: paths.pngOut,
      brandOut: paths.brandOut,
    });
    server.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      assert.equal(typeof address, 'object');
      const response = await postJson(address.port, '/save', '{}');
      assert.equal(response.statusCode, 403);
      assert.equal(existsSync(paths.pngOut), false);
      assert.equal(existsSync(paths.brandOut), false);
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

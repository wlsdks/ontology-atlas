import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  computeLocalVaultFingerprint,
} from './build-local-manifest';

/** Fingerprinting must stay below 85% of a build's time, a ratio that survives jsdom noise. */

const FILE_COUNT = 200;

function makeFileHandle(name: string, mtime: number): FileSystemFileHandle {
  // Average-length bodies.
  const body = [
    '---',
    `title: ${name}`,
    `tags: [perf, sample]`,
    '---',
    '',
    `# ${name}`,
    '',
    `이 문서는 perf test 의 ${name}. 본문 한 줄 두 줄 세 줄.`,
    `[[other-${name}]] 같은 wikilink 도 포함.`,
    '',
    `> 인용도 한 줄. ${name}`,
  ].join('\n');
  return {
    kind: 'file',
    name,
    getFile: async () =>
      ({
        text: async () => body,
        lastModified: mtime,
      }) as unknown as File,
  } as unknown as FileSystemFileHandle;
}

function makeLargeRoot(count: number): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'PerfVault',
    entries: async function* () {
      for (let i = 0; i < count; i += 1) {
        const name = `doc-${String(i).padStart(4, '0')}.md`;
        yield [name, makeFileHandle(name, 1700000000000 + i)] as const;
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

function ms(): number {
  return performance.now();
}

describe('large vault perf', () => {
  it(`${FILE_COUNT} files: fingerprint < build * 0.85`, async () => {
    const root = makeLargeRoot(FILE_COUNT);

    const t0 = ms();
    const built = await buildLocalManifest(root);
    const buildMs = ms() - t0;

    const t1 = ms();
    const fp = await computeLocalVaultFingerprint(root);
    const fingerprintMs = ms() - t1;

    expect(built.manifest.docs.length).toBe(FILE_COUNT);
    expect(fp).toBe(built.fingerprint);

    console.log(
      `[perf] ${FILE_COUNT} files — build: ${buildMs.toFixed(1)}ms, fingerprint: ${fingerprintMs.toFixed(1)}ms, ratio: ${(fingerprintMs / buildMs).toFixed(2)}`,
    );

    expect(fingerprintMs).toBeLessThan(buildMs * 0.85);
  });
});

/** A flat folder handle; `read` builds each body on demand so the handle holds no text. */
function makeFlatRoot(
  count: number,
  read: (i: number) => string,
  wait?: () => Promise<void>,
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'FlatVault',
    entries: async function* () {
      for (let i = 0; i < count; i += 1) {
        const name = `n-${i}.md`;
        yield [
          name,
          {
            kind: 'file',
            name,
            getFile: async () => {
              if (wait) await wait();
              return {
                text: async () => read(i),
                lastModified: 1_700_000_000_000 + i,
              } as unknown as File;
            },
          },
        ] as const;
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('manifest build at scale', () => {
  it('reads through a pool at least four times faster than one read at a time when each read waits', async () => {
    const count = 400;
    // measurement window: each read waits 0.5 ms, standing in for one bridge or FSA round trip.
    const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 0.5));
    const read = (i: number) => `---\ntitle: N ${i}\n---\n\n# N ${i}\n`;

    const t0 = ms();
    const serial = await buildLocalManifest(makeFlatRoot(count, read, wait), 1);
    const serialMs = ms() - t0;

    const t1 = ms();
    const pooled = await buildLocalManifest(makeFlatRoot(count, read, wait));
    const pooledMs = ms() - t1;

    expect(pooled.manifest.docs).toEqual(serial.manifest.docs);
    console.log(
      `[perf] ${count} waiting reads — serial: ${serialMs.toFixed(0)}ms, pooled: ${pooledMs.toFixed(0)}ms, ratio: ${(serialMs / pooledMs).toFixed(1)}`,
    );
    expect(pooledMs * 4).toBeLessThanOrEqual(serialMs);
  });

  it('does not keep whole file texts alive through the kept fields', async () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const count = 400;
    const shortPad = 1024;
    const longPad = 16 * 1024;
    /* Every kept field is cut from the text: a Hangul title, display name, link text with context,
     * and the excerpt. The pad is one body line past the excerpt and adds no heading or link. */
    const read = (pad: number) => (i: number) =>
      [
        '---',
        `title: 문서 제목 번호 ${i} 입니다`,
        `created_by: 작성자 이름 ${i} 입니다`,
        `display_ko: 표시 이름 번호 ${i} 입니다`,
        '---',
        '',
        `# 머리말 ${i}`,
        '',
        `첫 문단이 [[other-${i}|다른 문서 ${i} 로 가는 링크]] 를 담고 있습니다.`,
        '',
        `x${String(i).padStart(6, '0')}${'.'.repeat(pad)}`,
      ].join('\n');

    const heldBytes = async (pad: number) => {
      gc();
      const before = process.memoryUsage().heapUsed;
      const built = await buildLocalManifest(makeFlatRoot(count, read(pad)));
      gc();
      const after = process.memoryUsage().heapUsed;
      expect(built.manifest.docs.length).toBe(count);
      return after - before;
    };

    // measurement window: the heap after a forced collection, holding only each build's manifest.
    await heldBytes(shortPad);
    const shortHeld = await heldBytes(shortPad);
    const longHeld = await heldBytes(longPad);
    const extraBodyBytes = count * (longPad - shortPad);
    console.log(
      `[perf] retention — 1 KB bodies: ${(shortHeld / 1e6).toFixed(2)} MB, 16 KB bodies: ${(longHeld / 1e6).toFixed(2)} MB, extra body bytes: ${(extraBodyBytes / 1e6).toFixed(2)} MB`,
    );
    expect(longHeld - shortHeld).toBeLessThan(extraBodyBytes / 10);
  });
});

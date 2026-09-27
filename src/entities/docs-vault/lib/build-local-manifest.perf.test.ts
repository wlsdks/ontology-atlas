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

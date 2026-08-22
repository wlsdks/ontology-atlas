import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  computeLocalVaultFingerprint,
} from './build-local-manifest';

/**
 * Performance regression guard on a large vault.
 *
 * jsdom is slower than a real browser, so absolute numbers mean little but the
 * *ratio* does: fingerprinting must be meaningfully faster than a build, since it
 * skips content reads and parsing. The threshold is a lenient 0.85 to absorb
 * environment noise — fingerprint under 85% of build passes.
 *
 * Absolute times are logged for information only and are not a failure condition.
 */

const FILE_COUNT = 200;

function makeFileHandle(name: string, mtime: number): FileSystemFileHandle {
  // Deliberately average-length bodies — 1 frontmatter, 1 heading, 5 body lines.
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

    // Ratio gate: fingerprint must stay under 85% of build. Lenient to absorb jsdom noise.
    expect(fingerprintMs).toBeLessThan(buildMs * 0.85);
  });

  it('build 자체는 5 초 안에 끝나야 한다 (regression sanity)', async () => {
    const root = makeLargeRoot(FILE_COUNT);
    const t0 = ms();
    const built = await buildLocalManifest(root);
    const elapsed = ms() - t0;
    expect(built.manifest.docs.length).toBe(FILE_COUNT);
    expect(elapsed).toBeLessThan(5_000);
  });
});

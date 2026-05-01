import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  computeLocalVaultFingerprint,
} from './build-local-manifest';

/**
 * 성능 회귀 차단 — large vault sanity.
 *
 * jsdom 환경이라 절대값은 실 브라우저보다 느리지만 *상대 비율* 은 의미
 * 있다. fingerprint 가 build 보다 *유의미하게 빨라야* 한다는 게 핵심
 * (content read + parse 가 빠진 만큼). 임계 ratio 는 환경 noise 고려해
 * 0.85 로 lenient — fingerprint 가 build 의 85% 미만이면 OK.
 *
 * 절대 시간은 정보 출력만 (console.log) — 테스트 실패 조건 아님.
 */

const FILE_COUNT = 200;

function makeFileHandle(name: string, mtime: number): FileSystemFileHandle {
  // 본문은 의도적으로 평균 길이 — frontmatter 1 + heading 1 + 본문 5 줄.
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

    // ratio gate — fingerprint 가 build 의 85% 미만이어야. jsdom noise
    // 흡수용 lenient 임계.
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

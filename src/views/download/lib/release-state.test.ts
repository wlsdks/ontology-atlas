import { describe, expect, it } from 'vitest';
import { MACOS_RELEASE } from '../model/macos-release.generated';
import { RELEASE_VERSION } from './release-facts';
import { ARCH_ORDER, formatAssetSize, macosAssetFor } from './release-state';

describe('release-state', () => {
  it('offers Apple Silicon before Intel', () => {
    expect(ARCH_ORDER).toEqual(['aarch64', 'x64']);
  });

  it('formats byte sizes as mebibytes with one decimal', () => {
    expect(formatAssetSize(12 * 1024 * 1024)).toBe('12.0 MB');
    expect(formatAssetSize(13_002_342)).toBe('12.4 MB');
  });

  it('renders no size at all rather than a misleading zero', () => {
    expect(formatAssetSize(0)).toBe('');
    expect(formatAssetSize(Number.NaN)).toBe('');
  });

  // The generated module is the only thing allowed to claim a release
  // exists. If it says published, it must carry facts the page can show —
  // a published flag with no assets would render download buttons that lead
  // nowhere, which is the exact defect this state machine removes.
  it('never claims a published release without downloadable assets', () => {
    if (!MACOS_RELEASE.published) {
      expect(MACOS_RELEASE.assets).toHaveLength(0);
      expect(MACOS_RELEASE.publishedAt).toBeNull();
      return;
    }

    expect(MACOS_RELEASE.assets.length).toBeGreaterThan(0);

    /**
     * 자산의 파일명은 **태그와** 맞아야 한다 — `package.json` 이 아니라.
     *
     * 이 단언은 원래 `buildDmgName(arch)`(= `package.json` 의 개발 중 버전)과
     * 같기를 요구했다. 의도는 옳았다: 낡은 생성 모듈이 엉뚱한 파일을 내주는
     * 것을 막는 것. 하지만 그 형태는 **릴리스 사이의 평상시 상태를 금지**했다 —
     * v1.0.0-rc.2 를 내보낸 뒤 다음 작업을 위해 `package.json` 을 rc.3 으로
     * 올리는 순간, 실제로 받을 수 있는 서명된 DMG 가 있는데도 계약이 그걸
     * 페이지에 거는 것을 막았다(실측 2026-07-28: rc.2 자산 2종이 이미 6회
     * 내려받힌 상태에서 페이지는 "아직 게시 전" 을 표시하고 있었다).
     *
     * 진짜 불변식은 셋이다:
     * ① 파일명·URL·태그가 **서로** 일관될 것 (내부 정합)
     * ② 크기와 체크섬이 실재할 것
     * ③ 게시된 것이 개발 중 버전보다 **앞서지 않을 것** — 앞선다면 아직
     *    존재하지 않는 빌드를 광고하는 것이므로 그건 여전히 결함이다.
     */
    const tagVersion = MACOS_RELEASE.tag.replace(/^v/, '');
    for (const arch of ARCH_ORDER) {
      const asset = macosAssetFor(arch);
      expect(asset).not.toBeNull();
      expect(asset!.fileName).toBe(`ontology-atlas_${tagVersion}_${arch}.dmg`);
      expect(asset!.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset!.sizeBytes).toBeGreaterThan(0);
      expect(asset!.downloadUrl).toContain(asset!.fileName);
      expect(asset!.downloadUrl).toContain(MACOS_RELEASE.tag);
    }
    expect(MACOS_RELEASE.publishedAt).not.toBeNull();

    // ③ 게시된 태그가 개발 중 버전보다 앞서면 안 된다. 같거나(릴리스 당일)
    //    뒤여야(다음 버전 작업 중) 한다.
    expect(compareVersions(tagVersion, RELEASE_VERSION)).toBeLessThanOrEqual(0);
  });
});

/** semver-ish 비교 — 이 저장소 태그는 `major.minor.patch[-rc.N]` 형태뿐이다. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split('-');
    const nums = core.split('.').map((n) => Number.parseInt(n, 10));
    // 프리릴리스는 같은 core 의 정식보다 **앞선다**(rc.2 < 1.0.0).
    const preRank = pre ? Number.parseInt(pre.replace(/\D/g, ''), 10) || 0 : Number.MAX_SAFE_INTEGER;
    return [...nums, preRank];
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

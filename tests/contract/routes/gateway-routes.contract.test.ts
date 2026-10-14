import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGatewayRoute, isGatewaySurface } from '@/shared/lib/navigation/nav-destination';

const repoRoot = resolve(__dirname, '../../..');

/**
 * A new gateway route must be registered in `isGatewayRoute()`; a missing one renders wrong chrome
 * that no type or lint check catches, so route directories are compared against the predicate.
 */
const GATEWAY_ROUTES = ['download', 'guide', 'changelog'] as const;

describe('관문 라우트 등록', () => {
  it.each(GATEWAY_ROUTES)('`/%s` 라우트가 실제로 존재한다', (route) => {
    expect(existsSync(resolve(repoRoot, `app/[locale]/${route}/page.tsx`))).toBe(true);
  });

  it.each(GATEWAY_ROUTES)('`/%s` 는 관문 크롬을 쓴다 (레일 없음)', (route) => {
    expect(isGatewayRoute(`/${route}`)).toBe(true);
    expect(isGatewayRoute(`/ko/${route}`)).toBe(true);
    expect(isGatewayRoute(`/en/${route}/`)).toBe(true);
  });

  it('워크벤치 라우트는 관문이 아니다', () => {
    for (const path of ['/topology', '/docs', '/ontology/studio', '/projects']) {
      expect(isGatewayRoute(path), `${path} 가 관문으로 판정됐다`).toBe(false);
    }
  });

  /** `/docs` is the workspace library, not gateway reading material, so it must stay a workbench route. */
  it('`/docs` 는 워크벤치로 남는다 — 가이드와 이름이 갈렸다', () => {
    expect(isGatewayRoute('/docs')).toBe(false);
    expect(isGatewayRoute('/guide')).toBe(true);
  });

  /**
   * `/` alone is decided by the **visitor**, not the path. Breaking this branch while
   * registering a new route makes the installed app recommend installing itself.
   */
  it('`/` 판정은 방문자 맥락이 정한다 — 등록 목록이 이 분기를 삼키지 않았다', () => {
    const web = { hasVault: false, desktop: false, vaultKnown: true };
    const worker = { hasVault: true, desktop: false, vaultKnown: true };
    const app = { hasVault: false, desktop: true, vaultKnown: true };
    expect(isGatewaySurface('/', web)).toBe(true);
    expect(isGatewaySurface('/', worker)).toBe(false);
    expect(isGatewaySurface('/', app)).toBe(false);
  });

  it('관문 읽을거리는 앱 안에서도 관문 크롬이다 — 워크벤치가 아니다', () => {
    const app = { hasVault: true, desktop: true, vaultKnown: true };
    expect(isGatewaySurface('/guide', app)).toBe(true);
    expect(isGatewaySurface('/changelog', app)).toBe(true);
  });
});

/**
 * The X entry is **not a link when it has no destination**.
 *
 * The moment an empty handle becomes an `<a href>` it is the dead CTA web smoke ③
 * blocks. One constant owns that branch, so only that constant's contract is guarded
 * here.
 */
/**
 * The guide is **many chapters as one set**, so its list, routes, and bodies drift
 * apart easily.
 *
 * `GUIDE_PAGES` is the single source of truth, and when a vault document or
 * translation key it names is missing, the screen shows **an empty page or the key
 * name**. All three are failures invisible without running, so they are compared
 * here.
 */
describe('가이드 차례', () => {
  it(
    '차례의 모든 장이 볼트에 실제 본문을 갖는다',
    async () => {
      const { GUIDE_PAGES } = await import('@/views/gateway-doc');
      const { readVaultDoc } = await import('@/views/gateway-doc');
      for (const page of GUIDE_PAGES) {
        const body = readVaultDoc(page.slug);
        expect(body, `${page.slug} 의 본문이 볼트에 없다`).toBeTruthy();
        expect((body ?? '').length, `${page.slug} 가 사실상 비어 있다`).toBeGreaterThan(200);
      }
    },
    30_000,
  );

  it('차례의 모든 장이 두 로케일 모두에 이름을 갖는다', async () => {
    const { GUIDE_PAGES } = await import('@/views/gateway-doc');
    for (const locale of ['ko', 'en'] as const) {
      const messages = JSON.parse(
        readFileSync(resolve(repoRoot, `messages/${locale}.json`), 'utf8'),
      );
      const titles = messages.gatewayNav?.guidePages ?? {};
      for (const page of GUIDE_PAGES) {
        expect(
          titles[page.titleKey],
          `${locale}.json 에 gatewayNav.guidePages.${page.titleKey} 가 없다 — 화면에 키 이름이 그대로 나온다`,
        ).toBeTruthy();
      }
    }
  });

  it('URL 마디와 볼트 슬러그가 어긋나지 않는다', async () => {
    const { GUIDE_PAGES } = await import('@/views/gateway-doc');
    for (const page of GUIDE_PAGES) {
      expect(page.slug, `${page.segment} 의 슬러그 규칙이 깨졌다`).toBe(`guide/${page.segment}`);
    }
  });
});

describe('X 링크 자리', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/shared/config/social-links.ts'),
    'utf8',
  );

  it('핸들이 비면 URL 이 null · 채워지면 그 핸들의 주소다', async () => {
    const { X_HANDLE, xProfileUrl } = await import('@/shared/config/social-links');
    /**
     * `X_HANDLE` is typed `string` so the `=== ''` comparison stays valid when the handle is filled in;
     * both states must hold.
     */
    const handle: string = X_HANDLE;
    if (handle === '') expect(xProfileUrl()).toBeNull();
    else expect(xProfileUrl()).toBe(`https://x.com/${handle}`);
  });

  it('핸들만 저장한다 — URL 전체를 박지 않는다', () => {
    // The contract that keeps the constant stable through another domain change
    // (twitter.com → x.com).
    expect(source).toMatch(/export const X_HANDLE = '[^/]*';/);
  });
});

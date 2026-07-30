import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGatewayRoute, isGatewaySurface } from '@/shared/lib/nav-destination';

const repoRoot = resolve(__dirname, '../..');

/**
 * **관문 표면을 새로 만들면 셸이 그것을 알아야 한다.**
 *
 * 2026-07-30 실측: `/guide` · `/changelog` 를 만들고 첫 렌더를 열었더니 워크벤치
 * 좌측 레일 6개 목적지가 그대로 떴다. `isGatewayRoute()` 가
 * `startsWith("/download")` 한 줄이라 새 라우트를 몰랐기 때문이다. 화면은
 * 정상적으로 렌더됐고 타입도 lint 도 통과했다 — **판정이 빠진 것은 에러가 아니라
 * 잘못된 크롬**이라 값 검사로는 잡히지 않는다.
 *
 * 그래서 라우트 **디렉터리의 존재**와 **판정 함수**를 맞대어 본다. 새 관문
 * 라우트를 만들고 등록을 잊으면 여기서 먼저 터진다.
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

  /**
   * ⚠️ `/docs` 는 **문서함**이고 관문의 읽을거리가 아니다. 이 둘이 섞이면
   * 상단 내비의 "가이드" 가 볼트 피커로 사람을 보낸다 — `/guide` 라는 이름을
   * 고른 이유 자체가 이 충돌이다(원장 2026-07-30).
   */
  it('`/docs` 는 워크벤치로 남는다 — 가이드와 이름이 갈렸다', () => {
    expect(isGatewayRoute('/docs')).toBe(false);
    expect(isGatewayRoute('/guide')).toBe(true);
  });

  /**
   * `/` 만은 경로가 아니라 **방문자**가 정한다. 새 라우트를 등록하면서 이
   * 분기를 깨뜨리면 설치된 앱이 자기 설치를 권하게 된다.
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
 * X 자리는 **목적지가 없으면 링크가 아니다**.
 *
 * 핸들이 빈 채로 `<a href>` 가 되는 순간 웹 스모크 ③ 이 막는 「죽은 CTA」가
 * 된다. 상수 하나가 그 분기를 소유하므로 여기서 그 상수의 계약만 지킨다.
 */
/**
 * 가이드는 **여러 장이 한 벌**이라 목록·라우트·본문 셋이 어긋나기 쉽다.
 *
 * `GUIDE_PAGES` 가 단일 진실원인데, 그 목록이 가리키는 볼트 문서나 번역 키가
 * 없으면 화면에 **빈 페이지나 키 이름**이 그대로 나온다. 셋 다 실행 없이는
 * 안 보이는 실패라 여기서 맞대어 본다.
 */
describe('가이드 차례', () => {
  it('차례의 모든 장이 볼트에 실제 본문을 갖는다', async () => {
    const { GUIDE_PAGES } = await import('@/views/gateway-doc');
    const { readVaultDoc } = await import('@/views/gateway-doc');
    for (const page of GUIDE_PAGES) {
      const body = readVaultDoc(page.slug);
      expect(body, `${page.slug} 의 본문이 볼트에 없다`).toBeTruthy();
      expect((body ?? '').length, `${page.slug} 가 사실상 비어 있다`).toBeGreaterThan(200);
    }
  });

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

  it('핸들이 비면 URL 이 null 이다', async () => {
    const { X_HANDLE, xProfileUrl } = await import('@/shared/config/social-links');
    if (X_HANDLE === '') expect(xProfileUrl()).toBeNull();
    else expect(xProfileUrl()).toBe(`https://x.com/${X_HANDLE}`);
  });

  it('핸들만 저장한다 — URL 전체를 박지 않는다', () => {
    // 도메인이 또 바뀌어도(twitter.com → x.com) 상수가 안 흔들리게 하는 계약.
    expect(source).toMatch(/export const X_HANDLE = '[^/]*';/);
  });
});

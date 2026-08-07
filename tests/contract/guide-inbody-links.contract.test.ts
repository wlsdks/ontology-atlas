import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GUIDE_PAGES } from '@/views/gateway-doc/model/guide-pages';

/**
 * 가이드 **본문**의 내부 링크가 실재하는 라우트를 가리키는지.
 *
 * ## 왜 이 계약이 생겼나 (2026-08-07 사용성 감사)
 *
 * 가이드 13장의 본문 내부 링크 **34개 전부가 404** 였다. 마크다운 원본이
 * `[지도 읽는 법](/guide/reading-the-map)` 처럼 **로케일 접두사 없이** 쓰는데
 * (한 벌이 `/ko`·`/en` 을 함께 서빙하므로 원본에 로케일을 박을 수 없다)
 * 본문 렌더러가 그 값을 그대로 `<a href>` 에 실었다. 그런 라우트는 없다.
 *
 * 같은 화면의 왼쪽 차례는 처음부터 `Link`(로케일이 붙는다)를 썼다 — 로케일이
 * 붙는 링크와 안 붙는 링크가 한 화면에 공존했고, 사람이 주로 누르는 쪽이
 * 멀쩡한 쪽이라 눈에 안 띄었다.
 *
 * ## 왜 `docs:links` 가 못 잡나
 *
 * 그 검사는 문서가 가리키는 **파일 경로**가 실재하는지를 본다. `/guide/relations`
 * 는 파일 경로가 아니라 **라우트**이고, 파일로는 아무 데도 없으니 애초에 검사
 * 대상이 아니다. 「가리키는 대상이 실재하는가」라는 같은 갈래인데 **대상의
 * 종류가 다르다** — 그래서 검사도 따로 있어야 한다.
 *
 * ## 무엇을 재나
 *
 * 마크다운 원본에서 내부 절대경로 링크를 뽑아, 각각이 **코드에서 파생한**
 * 목적지 집합에 있는지 본다. 목적지는 손으로 적지 않는다:
 * `GUIDE_PAGES`(가이드 세그먼트의 정본)와 `app/[locale]/**` 의 실제 라우트에서
 * 뽑는다.
 */

const ROOT = process.cwd();
const GUIDE_DIR = join(ROOT, 'docs/guide');
const APP_LOCALE_DIR = join(ROOT, 'app/[locale]');

/** `app/[locale]/**` 의 `page.tsx` 에서 라우트를 뽑는다. 동적 구간은 제외. */
function appRoutes(): Set<string> {
  const out = new Set<string>(['/']);
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}/${entry.name}`);
      } else if (entry.name === 'page.tsx' && prefix) {
        out.add(prefix);
      }
    }
  };
  walk(APP_LOCALE_DIR, '');
  return out;
}

/** 마크다운 본문의 내부 절대경로 링크 — `](/…)` 꼴만. */
function inBodyInternalLinks(): Array<{ file: string; href: string }> {
  const out: Array<{ file: string; href: string }> = [];
  for (const name of readdirSync(GUIDE_DIR)) {
    if (!name.endsWith('.md')) continue;
    const body = readFileSync(join(GUIDE_DIR, name), 'utf8');
    for (const m of body.matchAll(/\]\((\/[^)\s]*)\)/g)) out.push({ file: `docs/guide/${name}`, href: m[1] });
  }
  return out;
}

/** 쿼리·해시·후행 슬래시를 떼어 라우트 경로만 남긴다. */
function toRoutePath(href: string): string {
  const path = href.split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

describe('가이드 본문 링크 — 실재하는 라우트만 가리킨다', () => {
  const links = inBodyInternalLinks();
  const segments = new Set(GUIDE_PAGES.map((p) => p.segment));
  const routes = appRoutes();

  it('링크와 목적지 집합을 실제로 뽑아낸다 (공회전 차단)', () => {
    // 0개를 뽑고 «어긋난 것 없음» 으로 통과하는 것이 이 계약의 유일한 실패 모드다.
    expect(links.length, '가이드 본문에서 내부 링크를 하나도 못 찾았다 — 스캔이 깨졌다').toBeGreaterThan(10);
    expect(segments.size, '가이드 세그먼트를 못 읽었다').toBeGreaterThan(5);
    expect(routes.has('/guide'), 'app/[locale] 라우트 스캔이 깨졌다').toBe(true);
  });

  it('내부 링크는 실재하는 가이드 장만 가리킨다', () => {
    /**
     * **가이드 본문의 내부 링크는 가이드 장뿐이다.**
     *
     * 여기까지 오는 데 두 번 틀렸고 둘 다 기록해 둔다:
     *
     * ① 처음엔 «앱 라우트여야 한다» 로 썼다. `/ONTOLOGY-QUALITY` 에서 틀렸다 —
     *    루트 절대 링크를 `docs:links` 는 **볼트 슬러그**로 해석하므로 원본
     *    표기는 맞았고, 계약이 관례를 잘못 읽어 멀쩡한 원본을 고치게 만들었다.
     * ② 그래서 «볼트 슬러그도 허용» 으로 넓히고 렌더러가 `?slug=` 로 풀게 했다.
     *    이것도 틀렸다 — 볼트를 안 고른 웹 방문자가 보는 것은 **샘플 볼트**이고
     *    그 문서는 **도그푸드 볼트에만** 있다. 결과는 **200 인데 아무것도 안
     *    열리는** 화면이었다. 404 보다 알아채기 어렵다.
     *
     * 그래서 규칙을 좁혔다: 가이드가 볼트 문서를 가리켜야 하면 **GitHub 로**
     * 보낸다(외부 링크는 이 검사 대상이 아니다). 첫 방문자에게 항상 열린다.
     */
    const dead = links.filter(({ href }) => {
      const guide = /^\/guide\/([^/]+)$/.exec(toRoutePath(href));
      return !guide || !segments.has(guide[1]);
    });
    expect(
      dead.map((d) => `${d.file} → ${d.href}`),
      '가이드 본문의 내부 링크는 실재하는 가이드 장만 가리킨다. 볼트 문서는 ' +
        '볼트를 안 고른 방문자에게 안 열리므로 GitHub 로 보내라. ' +
        '로케일은 렌더러가 붙이므로 원본에 적지 마라',
    ).toEqual([]);
  });

  /**
   * ⚠️ **여기서 렌더러를 검사하지 않는다.**
   *
   * 처음에는 이 파일에서 `GatewayDocPage.tsx` 소스를 읽어 «내부 링크가 `Link` 를
   * 거치는가» 를 정규식으로 봤다. **프로브에서 안 빨개졌다** — 분기를
   * `if (false && internalRoute)` 로 막아도 소스에는 그 두 낱말이 그대로 남아
   * 정규식이 통과한다. 소스 문자열은 «무엇이 적혀 있나» 를 말하지 «무엇이
   * 일어나나» 를 말하지 않는다(`documentation.md`: 사람이 쓴 문장을 못박지
   * 마라 — 그 실패의 다른 얼굴이다).
   *
   * 그 층은 실제로 열어서 재야 하므로 `tests/e2e/guide-inbody-links.spec.ts`
   * 가 맡는다: 가이드 전 장을 열어 본문 내부 링크가 로케일 접두사를 갖는지,
   * 그리고 그 주소가 실제로 200 인지 확인한다. 이 계약은 **원본 마크다운의
   * 목적지**만 본다.
   */

  it('마크다운 원본에 로케일을 박지 않는다', () => {
    /**
     * `/ko/guide/…` 로 고치는 것은 이 결함의 «되돌아오는» 수정이다 — 같은 한 벌이
     * `/en` 도 서빙하므로 그 순간 영어 독자가 한국어로 끌려간다.
     */
    const hardcoded = links.filter(({ href }) => /^\/(ko|en)\//.test(href));
    expect(
      hardcoded.map((d) => `${d.file} → ${d.href}`),
      '본문에 로케일이 박혔다 — 로케일은 렌더러가 붙인다',
    ).toEqual([]);
  });
});

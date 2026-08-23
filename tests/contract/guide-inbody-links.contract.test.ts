import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GUIDE_PAGES } from '@/views/gateway-doc/model/guide-pages';

/**
 * Whether internal links in the guide **body** point at routes that exist.
 *
 * ## Why this contract exists (2026-08-07 usability audit)
 *
 * **All 34** in-body internal links across the guide's 13 chapters were 404s. The
 * markdown source writes them **without a locale prefix**, e.g.
 * `[How to read the map](/guide/reading-the-map)` (one copy serves both `/ko` and `/en`,
 * so the source cannot hardcode a locale), and the body renderer put that value
 * straight into `<a href>`. No such route exists.
 *
 * The table of contents on the left of the same screen used `Link` (which adds the
 * locale) from the start — locale-prefixed and non-prefixed links coexisted on one
 * screen, and the side people mostly click was the working one, so it went
 * unnoticed.
 *
 * ## Why `docs:links` cannot catch it
 *
 * That check asks whether the **file path** a document cites exists.
 * `/guide/relations` is a **route**, not a file path, and exists nowhere as a file,
 * so it was never in scope. Same family of question — does the target exist — but
 * **a different kind of target**, so it needs its own check.
 *
 * ## What is measured
 *
 * Internal absolute-path links are extracted from the markdown source and checked
 * against a destination set **derived from code**. The destinations are not written
 * by hand: they come from `GUIDE_PAGES` (the authoritative list of guide segments)
 * and the real routes under `app/[locale]/**`.
 */

const ROOT = process.cwd();
const GUIDE_DIR = join(ROOT, 'docs/guide');
const APP_LOCALE_DIR = join(ROOT, 'app/[locale]');

/** Extracts routes from `page.tsx` files under `app/[locale]/**`. Dynamic segments excluded. */
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

/** Internal absolute-path links in the markdown body — the `](/…)` form only. */
function inBodyInternalLinks(): Array<{ file: string; href: string }> {
  const out: Array<{ file: string; href: string }> = [];
  for (const name of readdirSync(GUIDE_DIR)) {
    if (!name.endsWith('.md')) continue;
    const body = readFileSync(join(GUIDE_DIR, name), 'utf8');
    for (const m of body.matchAll(/\]\((\/[^)\s]*)\)/g)) out.push({ file: `docs/guide/${name}`, href: m[1] });
  }
  return out;
}

/**
 * **Every** link in the markdown body — extracted regardless of kind.
 *
 * ## Why a second scanner (measured during the 2026-08-14 walkthrough)
 *
 * `inBodyInternalLinks` above sees only the `](/…)` form, so a **relative-path
 * link** such as `[specification](../ONTOLOGY-ATLAS-SPEC.md#…)` passed unchecked — and the
 * e2e spec only looked at `a[href^="/"]`, so it did too. Clicking such a link goes
 * to `/ko/guide/ONTOLOGY-ATLAS-SPEC.md`, where the `findGuidePage()` fallback
 * **silently** rendered chapter 1: a **misdelivery**, not a 404, which is why
 * neither gate saw it.
 *
 * Inventory before switching it on: the 13 guide chapters contained exactly 2
 * relative links and both were this defect — there is **no** legitimate convention
 * for linking between guide chapters by relative path. So all of them are blocked
 * with no allowlist: internal links use the absolute `/guide/<chapter>` form, and
 * repository documents go to GitHub (the same discipline as above).
 */
function inBodyAllLinks(): Array<{ file: string; href: string }> {
  const out: Array<{ file: string; href: string }> = [];
  for (const name of readdirSync(GUIDE_DIR)) {
    if (!name.endsWith('.md')) continue;
    const body = readFileSync(join(GUIDE_DIR, name), 'utf8');
    for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) out.push({ file: `docs/guide/${name}`, href: m[1] });
  }
  return out;
}

/** Strips query, hash, and trailing slash, leaving the route path. */
function toRoutePath(href: string): string {
  const path = href.split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

describe('가이드 본문 링크 — 실재하는 라우트만 가리킨다', () => {
  const links = inBodyInternalLinks();
  const segments = new Set(GUIDE_PAGES.map((p) => p.segment));
  const routes = appRoutes();

  it('링크와 목적지 집합을 실제로 뽑아낸다 (공회전 차단)', () => {
    // Extracting 0 links and passing as "nothing mismatched" is this contract's only failure mode.
    expect(links.length, '가이드 본문에서 내부 링크를 하나도 못 찾았다 — 스캔이 깨졌다').toBeGreaterThan(10);
    expect(segments.size, '가이드 세그먼트를 못 읽었다').toBeGreaterThan(5);
    expect(routes.has('/guide'), 'app/[locale] 라우트 스캔이 깨졌다').toBe(true);
  });

  it('내부 링크는 실재하는 가이드 장만 가리킨다', () => {
    /**
     * **Internal links in the guide body point only at guide chapters.**
     *
     * Getting here took two wrong turns, both recorded:
     *
     * ① The first version required "it must be an app route". That was wrong for
     *    `/ONTOLOGY-QUALITY` — `docs:links` interprets a root-absolute link as a
     *    **vault slug**, so the source was correct and the contract, misreading the
     *    convention, made a healthy source get "fixed".
     * ② So it was widened to "vault slugs are allowed too", with the renderer
     *    resolving them via `?slug=`. That was also wrong — a web visitor who has not
     *    picked a vault sees the **sample vault**, and that document exists **only in
     *    the dogfood vault**. The result was a screen that returned **200 and opened
     *    nothing**, which is harder to notice than a 404.
     *
     * So the rule was narrowed: when the guide needs to point at a vault document it
     * sends the reader **to GitHub** (external links are out of this check's scope).
     * That always opens for a first-time visitor.
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
   * ⚠️ **The renderer is not checked here.**
   *
   * The first attempt read `GatewayDocPage.tsx`'s source from this file and used a
   * regex to ask whether internal links go through `Link`. **The probe never turned
   * it red** — disabling the branch with `if (false && internalRoute)` leaves both
   * words in the source and the regex still passes. A source string says **what is
   * written**, not **what happens** (`documentation.md`: never pin a sentence a human
   * wrote — this is the same failure wearing a different face).
   *
   * That layer has to be opened and measured, so
   * `tests/e2e/guide-inbody-links.spec.ts` owns it: it opens every guide chapter and
   * checks that in-body internal links carry the locale prefix and that those
   * addresses really return 200. This contract looks only at **the destinations in
   * the source markdown.**
   */

  it('상대 경로 링크를 두지 않는다 — 내부는 절대 경로, 저장소 문서는 GitHub 로', () => {
    /**
     * The full story is in `inBodyAllLinks`'s comment. In short: the router resolves a
     * relative `.md` link to `/guide/<filename>`, that segment does not exist, and the
     * fallback renders a different chapter — **a silent misdelivery**, a wrong document
     * with no 404.
     */
    const all = inBodyAllLinks();
    // Idling guard: this scanner must actually be seeing absolute and external links,
    // otherwise "no relative links" is a pass over an empty set.
    expect(all.length, '전체 링크 스캔이 깨졌다').toBeGreaterThan(links.length);
    const relative = all.filter(({ href }) => !/^(\/|https?:\/\/)/.test(href));
    expect(
      relative.map((d) => `${d.file} → ${d.href}`),
      '가이드 본문에 상대 경로 링크가 있다 — 라우터가 /guide/<파일명> 으로 풀고 ' +
        '폴백이 엉뚱한 장을 그린다. 가이드 장은 /guide/<segment> 절대 경로로, ' +
        '저장소 문서는 GitHub blob URL 로 적어라',
    ).toEqual([]);
  });

  it('마크다운 원본에 로케일을 박지 않는다', () => {
    /**
     * "Fixing" this by writing `/ko/guide/…` is the repair that brings the defect
     * back — the same copy also serves `/en`, so English readers would be dragged into
     * Korean.
     */
    const hardcoded = links.filter(({ href }) => /^\/(ko|en)\//.test(href));
    expect(
      hardcoded.map((d) => `${d.file} → ${d.href}`),
      '본문에 로케일이 박혔다 — 로케일은 렌더러가 붙인다',
    ).toEqual([]);
  });
});

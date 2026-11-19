import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GUIDE_PAGES } from '@/views/gateway-doc/model/guide-pages';

/**
 * Internal links in guide bodies are written without a locale prefix and must still resolve;
 * destinations derive from `GUIDE_PAGES` and the real routes under `app/[locale]/**`.
 */

const ROOT = process.cwd();
/** The English vault chapters and each reader language's translation of them. */
const GUIDE_DIRS = ['docs/guide', 'docs-i18n/guide/ko', 'docs-i18n/guide/ja', 'docs-i18n/guide/zh'];

function guideBodies(): Array<{ file: string; body: string }> {
  return GUIDE_DIRS.filter((dir) => existsSync(join(ROOT, dir))).flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((name) => name.endsWith('.md'))
      .map((name) => ({ file: `${dir}/${name}`, body: readFileSync(join(ROOT, dir, name), 'utf8') })),
  );
}
/** The workbench routes and the gateway routes; a route group adds no URL segment. */
const APP_LOCALE_DIRS = [join(ROOT, 'app/[locale]'), join(ROOT, 'app/(gateway)/[locale]')];

/** Extracts routes from `page.tsx` files under both locale roots. Dynamic segments excluded. */
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
  for (const dir of APP_LOCALE_DIRS) walk(dir, '');
  return out;
}

/** Internal absolute-path links in the markdown body — the `](/…)` form only. */
function inBodyInternalLinks(): Array<{ file: string; href: string }> {
  return guideBodies().flatMap(({ file, body }) => [...body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => ({ file, href: m[1] })));
}

/**
 * Relative-path links in guide bodies are blocked with no allowlist: `findGuidePage()` would
 * silently render chapter 1 instead of a 404.
 */
function inBodyAllLinks(): Array<{ file: string; href: string }> {
  return guideBodies().flatMap(({ file, body }) => [...body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => ({ file, href: m[1] })));
}

/** Strips query, hash, and trailing slash, leaving the route path. */
function toRoutePath(href: string): string {
  const path = href.split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

describe('guide body links point only at routes that exist', () => {
  const links = inBodyInternalLinks();
  const segments = new Set(GUIDE_PAGES.map((p) => p.segment));
  const routes = appRoutes();

  it('actually extracts the links and the destination set (blocks idling)', () => {
    // Extracting 0 links and passing as "nothing mismatched" is this contract's only failure mode.
    expect(links.length, 'found no internal link in the guide body, so the scan is broken').toBeGreaterThan(10);
    expect(segments.size, 'could not read the guide segments').toBeGreaterThan(5);
    expect(routes.has('/guide'), 'the app/[locale] route scan is broken').toBe(true);
  });

  it('internal links point only at guide chapters that exist', () => {
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
      'Internal links in a guide body point only at guide chapters that exist. A vault document ' +
        'does not open for a visitor who has not chosen a vault, so link to GitHub instead. ' +
        'The renderer adds the locale, so do not write it in the source',
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
   * `tests/e2e/gateway/guide-inbody-links.spec.ts` owns it: it opens every guide chapter and
   * checks that in-body internal links carry the locale prefix and that those
   * addresses really return 200. This contract looks only at **the destinations in
   * the source markdown.**
   */

  it('has no relative links: internal ones are absolute paths and repository docs go to GitHub', () => {
    /**
     * The full story is in `inBodyAllLinks`'s comment. In short: the router resolves a
     * relative `.md` link to `/guide/<filename>`, that segment does not exist, and the
     * fallback renders a different chapter — **a silent misdelivery**, a wrong document
     * with no 404.
     */
    const all = inBodyAllLinks();
    // Idling guard: this scanner must actually be seeing absolute and external links,
    // otherwise "no relative links" is a pass over an empty set.
    expect(all.length, 'the scan of all links is broken').toBeGreaterThan(links.length);
    const relative = all.filter(({ href }) => !/^(\/|https?:\/\/)/.test(href));
    expect(
      relative.map((d) => `${d.file} → ${d.href}`),
      'A guide body has a relative link: the router resolves it to /guide/<file name> ' +
        'and the fallback renders the wrong chapter. Write guide chapters as absolute /guide/<segment> paths ' +
        'and repository documents as GitHub blob URLs',
    ).toEqual([]);
  });

  it('does not hard-code the locale in the markdown source', () => {
    /**
     * "Fixing" this by writing `/ko/guide/…` is the repair that brings the defect
     * back — the same copy also serves `/en`, so English readers would be dragged into
     * Korean.
     */
    const hardcoded = links.filter(({ href }) => /^\/(ko|en)\//.test(href));
    expect(
      hardcoded.map((d) => `${d.file} → ${d.href}`),
      'the locale is hard-coded in the body; the renderer attaches the locale',
    ).toEqual([]);
  });
});

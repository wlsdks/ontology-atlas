import { existsSync, readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGatewayRoute } from '@/shared/lib/navigation/nav-destination';

const repoRoot = resolve(__dirname, '../../..');

/**
 * A new gateway route must be registered in `isGatewayRoute()`; a missing one renders wrong chrome
 * that no type or lint check catches, so route directories are compared against the predicate.
 */
const GATEWAY_ROUTES = ['download', 'guide', 'changelog', 'sample'] as const;

describe('gateway route registration', () => {
  it.each(GATEWAY_ROUTES)('the `/%s` route really exists', (route) => {
    expect(existsSync(resolve(repoRoot, `app/(gateway)/[locale]/${route}/page.tsx`))).toBe(true);
  });

  /**
   * The gateway layout carries a picked subset of the messages and no workbench shell, so a
   * gateway route under the workbench layout would ship the whole catalog, and a workbench route
   * under the gateway layout would lose its rail and copy.
   */
  it('the gateway layout holds exactly the gateway routes', () => {
    expect(readdirSync(resolve(repoRoot, 'app/(gateway)/[locale]'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()).toEqual([...GATEWAY_ROUTES].sort());
    for (const route of GATEWAY_ROUTES) {
      expect(existsSync(resolve(repoRoot, `app/[locale]/${route}`)), `app/[locale]/${route}`).toBe(false);
    }
  });

  it.each(GATEWAY_ROUTES)('`/%s` uses the gateway chrome (no rail)', (route) => {
    expect(isGatewayRoute(`/${route}`)).toBe(true);
    expect(isGatewayRoute(`/ko/${route}`)).toBe(true);
    expect(isGatewayRoute(`/en/${route}/`)).toBe(true);
  });

  it('workbench routes are not gateways', () => {
    for (const path of ['/topology', '/docs', '/ontology/studio', '/projects']) {
      expect(isGatewayRoute(path), `${path} was judged a gateway`).toBe(false);
    }
  });

  /** `/docs` is the workspace library, not gateway reading material, so it must stay a workbench route. */
  it('`/docs` stays a workbench, since the guide and its name were split', () => {
    expect(isGatewayRoute('/docs')).toBe(false);
    expect(isGatewayRoute('/guide')).toBe(true);
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
describe('guide table of contents', () => {
  it(
    'every chapter of the table of contents has real body text in the vault',
    async () => {
      const { GUIDE_PAGES } = await import('@/views/gateway-doc');
      const { readVaultDoc } = await import('@/views/gateway-doc');
      for (const page of GUIDE_PAGES) {
        const body = readVaultDoc(page.slug);
        expect(body, `the body of ${page.slug} is not in the vault`).toBeTruthy();
        expect((body ?? '').length, `${page.slug} is practically empty`).toBeGreaterThan(200);
      }
    },
    30_000,
  );

  it('every chapter has a body in each reader language with the English source\'s sections', async () => {
    const { GUIDE_PAGES, GUIDE_TRANSLATIONS_DIR, readVaultDoc } = await import('@/views/gateway-doc');
    const sections = (body: string) => body.match(/^## /gm)?.length ?? 0;
    for (const locale of ['ko', 'ja', 'zh'] as const) {
      for (const page of GUIDE_PAGES) {
        const path = resolve(repoRoot, GUIDE_TRANSLATIONS_DIR, locale, `${page.segment}.md`);
        expect(existsSync(path), `${locale} has no translation of ${page.segment}, so its page falls back to English`).toBe(true);
        const body = readFileSync(path, 'utf8');
        expect(body.length, `${locale}/${page.segment} is practically empty`).toBeGreaterThan(200);
        expect(sections(body), `${locale}/${page.segment} lost or added sections against the English source`).toBe(
          sections(readVaultDoc(page.slug) ?? ''),
        );
      }
    }
  });

  it('every chapter of the table of contents has a name in every locale', async () => {
    const { GUIDE_PAGES } = await import('@/views/gateway-doc');
    for (const locale of ['ko', 'en', 'ja', 'zh'] as const) {
      const messages = JSON.parse(
        readFileSync(resolve(repoRoot, `messages/${locale}.json`), 'utf8'),
      );
      const titles = messages.gatewayNav?.guidePages ?? {};
      for (const page of GUIDE_PAGES) {
        expect(
          titles[page.titleKey],
          `${locale}.json has no gatewayNav.guidePages.${page.titleKey}, so the key name shows up on screen as it is`,
        ).toBeTruthy();
      }
    }
  });

  it('URL segments and vault slugs do not drift apart', async () => {
    const { GUIDE_PAGES } = await import('@/views/gateway-doc');
    for (const page of GUIDE_PAGES) {
      expect(page.slug, `the slug rule of ${page.segment} is broken`).toBe(`guide/${page.segment}`);
    }
  });
});

describe('X link slot', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/shared/config/site/social-links.ts'),
    'utf8',
  );

  it('the URL is null when the handle is empty, and that handle\'s address when filled', async () => {
    const { X_HANDLE, xProfileUrl } = await import('@/shared/config/site/social-links');
    /**
     * `X_HANDLE` is typed `string` so the `=== ''` comparison stays valid when the handle is filled in;
     * both states must hold.
     */
    const handle: string = X_HANDLE;
    if (handle === '') expect(xProfileUrl()).toBeNull();
    else expect(xProfileUrl()).toBe(`https://x.com/${handle}`);
  });

  it('stores the handle only, never the full URL', () => {
    // The contract that keeps the constant stable through another domain change
    // (twitter.com → x.com).
    expect(source).toMatch(/export const X_HANDLE = '[^/]*';/);
  });
});

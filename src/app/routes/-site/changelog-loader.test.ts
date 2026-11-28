import { afterEach, describe, expect, it, vi } from 'vitest';

import { Route } from '../$locale/_site/changelog';
import { replayBuildFacts } from './build-facts';

afterEach(() => vi.unstubAllEnvs());

type ChangelogLoader = (options: { context: unknown; params: { locale: string } }) => Promise<{ document: { raw: string | null; bundledOmittedSections: number } }>;

describe('the changelog loader in the installed app', () => {
  it('returns the changelog entries when the build recorded nothing', async () => {
    // The app replays an empty record (`src/app/main.tsx`) and runs as a production build, not `pnpm dev`.
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    const buildFacts = replayBuildFacts({});
    const loader = Route.options.loader as unknown as ChangelogLoader;

    const { document } = await loader({
      context: { buildFacts, siteMessages: await buildFacts.siteMessages('en') },
      params: { locale: 'en' },
    });

    expect(document.raw).not.toBeNull();
    expect(document.raw).toMatch(/^## /m);
  });
});

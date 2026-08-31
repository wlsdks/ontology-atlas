import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import packageJson from './package.json' with { type: 'json' };

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const allowedDevOrigins = [
  '127.0.0.1',
  'localhost',
  '*.localhost',
  ...(process.env.NEXT_DEV_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []),
];

/*
 * ⚠️ **One version, not a copy of one.** `release-facts.ts` used to carry the version as a
 * hand-typed literal beside `package.json`, `tauri.conf.json` and `Cargo.toml` — a fourth place
 * that is not an independent source, only a transcription of the first. Nothing caught a stale copy
 * until release time, because `desktop:release-status` runs at the tag and not in CI, so a wrong
 * download page survived every check until somebody tried to ship.
 *
 * It is passed through `env` rather than imported into a component: a JSON import would pull the
 * whole manifest, dependency list included, into the client bundle. Only this string crosses.
 */
const releaseVersion = (packageJson as { version?: string }).version;
if (!releaseVersion) throw new Error('package.json has no version to publish on /download');

// Optional for forks that deploy the static export below a subpath. The official
// GitHub Pages deployment uses the ontologyatlas.com root. Paired with
// src/shared/lib/base-path.ts.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins,
  env: { NEXT_PUBLIC_RELEASE_VERSION: releaseVersion },
  output: 'export',
  basePath,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // The dev-only Next indicator (N circle) originally covered the actual Chrome UI (settings
  // gear · SETTINGS · Workspace chip) and hijacked clicks from its default top-right position
  // (overlap elimination 2026-07-23, measured at 768px — identity of the owner's "N avatar overlap" report).
  // Moving it to bottom-left caused it to exactly overlap the "Map Settings" gear at the bottom
  // of the left rail, hijacking all clicks (final sweep P3). Among the four corners, only the
  // bottom-right lacks interactive Chrome — it may overlap with the relationship legend (info display)
  // but does not steal clicks. This is a dev-only surface not rendered in production builds.
  devIndicators: {
    position: 'bottom-right',
  },
};

export default withNextIntl(nextConfig);

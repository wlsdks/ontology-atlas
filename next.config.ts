import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import createNextIntlPlugin from 'next-intl/plugin';

import { watchMessages } from './scripts/build-messages.mjs';

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
 * Passed through `env`, not imported: a JSON import would pull the whole manifest into the client
 * bundle. Only the version string crosses.
 */
const releaseVersion = (packageJson as { version?: string }).version;
if (!releaseVersion) throw new Error('package.json has no version to publish on /download');

// Optional for forks that deploy the static export below a subpath. The official
// GitHub Pages deployment uses the ontologyatlas.com root. Paired with
// src/shared/lib/public-pages/base-path.ts.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins,
  // The TypeScript 6 compatibility package exposes tsc6, not bin/tsc.
  // Keep build-time type checking on its supported programmatic API.
  experimental: { useTypeScriptCli: false, mcpServer: false },
  // The browser-evidence build in e2e.yml skips the type check: `pnpm typecheck` in the
  // Checks gate owns the same program, route types included, and here it cost 54 of the
  // build's 82 seconds on the E2E critical path. Every other build still checks types.
  typescript: { ignoreBuildErrors: process.env.ATLAS_BUILD_SKIP_TYPECHECK === '1' },
  env: { NEXT_PUBLIC_RELEASE_VERSION: releaseVersion },
  output: 'export',
  basePath,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Bottom-right is the only corner with no interactive chrome, so the dev-only Next indicator
  // cannot steal clicks there.
  devIndicators: {
    position: 'bottom-right',
  },
};

/*
 * `messages/<locale>.json` is composed from `messages/<locale>/<Namespace>.json`
 * (`scripts/build-messages.mjs`). `predev` composes it once; this keeps it current
 * while the dev server runs, so an edited part reaches the screen like any source
 * file. One watcher per process, dev server only.
 */
export default function config(phase: string): NextConfig {
  const scope = globalThis as { atlasMessagesWatcher?: unknown };
  if (phase === PHASE_DEVELOPMENT_SERVER && !scope.atlasMessagesWatcher) {
    scope.atlasMessagesWatcher = watchMessages();
  }
  return withNextIntl(nextConfig);
}

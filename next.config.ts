import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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

// For deploying to GitHub Pages project site (`/ontology-atlas` subpath) —
// not configured for root deployment (Firebase, dev). Paired with src/shared/lib/base-path.ts.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins,
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

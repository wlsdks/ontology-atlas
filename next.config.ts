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

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default withNextIntl(nextConfig);

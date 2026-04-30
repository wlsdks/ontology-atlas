import type { NextConfig } from 'next';

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

export default nextConfig;

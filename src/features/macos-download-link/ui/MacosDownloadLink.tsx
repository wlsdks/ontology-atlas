'use client';

import type { ReactNode } from 'react';

export const GITHUB_RELEASES_URL =
  'https://github.com/wlsdks/ontology-atlas/releases';

interface Props {
  children: ReactNode;
  className?: string;
}

export function MacosDownloadLink({ children, className }: Props) {
  return (
    <a
      href={GITHUB_RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

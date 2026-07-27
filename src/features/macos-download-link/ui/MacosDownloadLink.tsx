'use client';

import type { ReactNode } from 'react';

export const GITHUB_RELEASES_URL =
  'https://github.com/wlsdks/ontology-atlas/releases';

interface Props {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function MacosDownloadLink({ children, className, ...rest }: Props) {
  return (
    <a
      href={GITHUB_RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}

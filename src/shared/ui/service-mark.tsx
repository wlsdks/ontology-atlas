import type { SVGProps } from 'react';
import { Plug } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { ICON_SIZE } from './icon-size';

/**
 * 20px monochrome marks for the service a connector talks to. Each path is copied from Simple
 * Icons (CC0), but CC0 waives copyright, not trademark: a mark ships only when its owner's
 * guideline, cited with the date it was read, permits a monochrome integration use
 * (service-mark.test.tsx reads those citations). Paths are inlined so a dependency update
 * cannot change a logo unreviewed. `currentColor` keeps one colour system
 * (`.claude/rules/design.md`); the lucide fallback is `ICON_SIZE.lg` inside the same 20px box
 * because it draws with padding.
 */
const SERVICE_MARK_PATHS: Record<string, string> = {
  /*
   * GitHub — https://brand.github.com (logos and usage), read 2026-09-05. The page explicitly
   * permits the mark in monochrome to show an integration with GitHub, and GitHub distributes a
   * monochrome variant itself (`github-mark-white.svg`). Same verdict, same page, as
   * `github-mark.tsx` recorded on 2026-07-29 for the Octicons copy of this mark.
   */
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
};

export type ServiceMarkName = keyof typeof SERVICE_MARK_PATHS;

/**
 * Matches the connector name and what it runs (command or URL host), because either can
 * identify the service after a rename. Fragments must be specific enough not to occur by
 * accident in ordinary paths.
 */
const SERVICE_MARK_HINTS: ReadonlyArray<readonly [ServiceMarkName, readonly string[]]> = [
  ['github', ['github', 'githubcopilot.com']],
];

/**
 * The `runs` argument is the row's rendered command-or-address line, which keeps this
 * pure; `null` means the caller draws the fallback.
 */
export function resolveServiceMark(name: string, runs: string): ServiceMarkName | null {
  const haystack = `${name} ${runs}`.toLowerCase();
  for (const [mark, fragments] of SERVICE_MARK_HINTS) {
    if (fragments.some((fragment) => haystack.includes(fragment))) return mark;
  }
  return null;
}

export interface ServiceMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  mark: ServiceMarkName | null | undefined;
}

export function ServiceMark({ mark, className, ...rest }: ServiceMarkProps) {
  const path = mark ? SERVICE_MARK_PATHS[mark] : undefined;
  return (
    <span
      aria-hidden
      data-service-mark={path ? mark : 'fallback'}
      className={cn('inline-flex size-5 shrink-0 items-center justify-center', className)}
    >
      {path ? (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          // Decorative: the row names the service in text beside it.
          aria-hidden
          focusable="false"
          className="size-full"
          {...rest}
        >
          <path data-mark-part="simple-icon" d={path} />
        </svg>
      ) : (
        /* An unrecognised service still reads as an MCP connector instead of a broken image. */
        <Plug size={ICON_SIZE.lg} aria-hidden focusable="false" />
      )}
    </span>
  );
}

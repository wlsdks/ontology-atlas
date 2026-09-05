import type { SVGProps } from 'react';
import { Plug } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { ICON_SIZE } from './icon-size';

/**
 * **Service marks — a 20px monochrome glyph naming the service a connector talks to.**
 *
 * ## Why the connector list has one
 *
 * A connector row is *one product*, not one setting, and the same reasoning the runner list
 * already recorded applies: with the product's mark present the eye finds the row before reading
 * the name, and a list of eight commands is otherwise eight lines of identical grey text. The
 * owner asked for it directly — *"for services there are free, open icons, aren't there? Notion,
 * GitHub, that sort of thing"*.
 *
 * ## ⚠️ One mark ships, and the reason is not the licence
 *
 * The `d` below is copied **verbatim** from Simple Icons (24×24 viewBox), released under
 * **CC0 1.0** — a public-domain dedication, so no attribution is required and none is implied.
 * **CC0 waives copyright, not trademark**, and Simple Icons' own disclaimer says so. Copyright was
 * never the question here; whether each owner permits a recoloured copy of their mark is.
 *
 * A permissibility review on 2026-09-05 cut the set from ten to one:
 *
 * - **Kept** where the owner's published guideline was read and permits monochrome use to show an
 *   integration. Each entry cites that page and the date it was read.
 * - **Removed** where the guideline says the mark must not be modified or altered — recolouring to
 *   `currentColor` at 20px is a modification, whatever it looks like.
 * - **Removed** where the guideline could not be verified in that session. **Silence is not
 *   permission**, and a mark shipped on the assumption that nobody minds is the assumption doing
 *   the work.
 *
 * Adding one back is a one-line entry plus a header note carrying the guideline URL and the date
 * it was read. Everything else falls back to lucide `Plug`, which is honest: the row still says
 * "this is an MCP connector", which is what we actually know.
 *
 * ## Why the paths are inlined rather than a dependency
 *
 * `simple-icons` is a 3,000-icon package, and a dependency exists to be updated; an update that
 * changes a path changes a logo without anyone looking at it. One reviewed path in one reviewed
 * file is the whole surface, and it is diffable. `lucide-react` cannot supply it either — it
 * dropped every brand icon (measured 2026-07-29).
 *
 * ## Colour and size
 *
 * One `currentColor`, so the mark inherits the row's ink and this app stays neutrals plus one
 * indigo (a mark arriving with its own brand colour would be a second colour system, which
 * `.claude/rules/design.md` forbids).
 *
 * Size is **20px through `size-5`**, and no new value is invented: that is exactly the box
 * `VendorMark` already draws another product's mark in, and this is the same role in a different
 * list. A product mark is not a content icon, so 20 is deliberately not on the content ramp
 * (12/14/16) — the box is a class, never a `size={20}` prop the ramp gate would rightly catch.
 *
 * ⚠️ **The fallback is 16 inside that 20 box, and the difference is optical, not a second value.**
 * A Simple Icons mark fills its 24 viewBox edge to edge, while a lucide outline draws inside the
 * same viewBox with padding — the correction `github-mark.tsx` measured for the same swap
 * (14 vs 16 there). Rendering `Plug` at 20 would make the row we know least about the heaviest
 * one on the list. So the box stays 20 for every row, and the glyph inside it is `ICON_SIZE.lg`,
 * on the content ramp where a lucide icon belongs.
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
 * Which mark a connector wears — matched on **its name and on what it actually runs**.
 *
 * The name alone is not enough: people call the same server `github`, `gh`, or `work-repos`, while
 * the command (`github-mcp-server`) and the address host (`api.githubcopilot.com`) are the parts
 * that cannot lie about which service is on the other end. Both are searched, and neither wins
 * over the other — a person who renamed the row still pointed it at GitHub.
 *
 * ⚠️ **The table stays even though it holds one row.** It is the shape a re-added mark drops into
 * after its guideline is read (one path above, one line here), and a lookup written for one entry
 * would have to be rewritten to take the second. Fragments are matched case-insensitively against
 * `<name> <command and arguments, or URL>`, so each must be specific enough not to appear by
 * accident — the reason a removed Chrome entry could not simply be `chrome`, which occurs inside
 * ordinary paths, and the reason Drive's was the full `drive.google.com`.
 */
const SERVICE_MARK_HINTS: ReadonlyArray<readonly [ServiceMarkName, readonly string[]]> = [
  ['github', ['github', 'githubcopilot.com']],
];

/**
 * The mark for one connector, or `null` when nothing matches — the caller draws the fallback.
 *
 * `runs` is the row's own "what will actually run" line: the command with its arguments, or the
 * address. Passing the rendered line rather than the record keeps this function pure and testable
 * without a connector shape.
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
  /** The resolved service, or `null`/an unknown name for the generic MCP fallback. */
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
          // Decorative: every row states the service in text right beside this, so announcing
          // the mark as well would read the same name twice.
          aria-hidden
          focusable="false"
          className="size-full"
          {...rest}
        >
          <path data-mark-part="simple-icon" d={path} />
        </svg>
      ) : (
        /*
         * The fallback is lucide `Plug` — the rail's own icon for this destination. A row whose
         * service we do not recognise still says "this is an MCP connector", which is true,
         * instead of leaving a hole the eye reads as a failed image.
         */
        <Plug size={ICON_SIZE.lg} aria-hidden focusable="false" />
      )}
    </span>
  );
}

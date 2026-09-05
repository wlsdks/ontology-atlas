import type { SVGProps } from 'react';
import { Plug } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { ICON_SIZE } from './icon-size';

/**
 * **Service marks — a 20px monochrome glyph naming the service a connector talks to.**
 *
 * ## Why the connector list needed one (2026-09-05)
 *
 * A connector row is *one product*, not one setting, and the same reasoning the runner list
 * already recorded applies: with the product's mark present the eye finds the row before reading
 * the name, and a list of eight commands is otherwise eight lines of identical grey text. The
 * owner asked for it directly — *"for services there are free, open icons, aren't there? Notion,
 * GitHub, that sort of thing"*.
 *
 * ## Where the paths come from, and what that costs
 *
 * The `d` attributes below are copied **verbatim** from Simple Icons (24×24 viewBox), released
 * under **CC0 1.0** — a public-domain dedication, so no attribution is required and none is
 * implied. Leaving the coordinates untouched is the contract, exactly as `github-mark.tsx` records
 * for the Octicons mark: altering a logo turns it from "a mark pointing at that service" into
 * "something we drew that resembles their logo".
 *
 * ⚠️ **CC0 waives copyright, not trademark.** Simple Icons' own disclaimer says so, and these
 * marks are used the only way that stays inside that boundary: **to name the service a row talks
 * to**, never as decoration, never on our own product, and never implying that service endorses
 * Atlas. `.claude/rules/forbidden.md` forbids putting another product's brand in *our*
 * identifiers or labels; here the brand is the destination of the traffic, and it really is that
 * destination — the same verdict recorded for the GitHub mark on 2026-07-29.
 *
 * ## Why the paths are inlined rather than a dependency
 *
 * `simple-icons` is a 3,000-icon package, and a dependency exists to be updated; an update that
 * changes a path changes a logo without anyone looking at it. Ten paths in one reviewed file is
 * the whole surface, and it is diffable. `lucide-react` cannot supply them either — it dropped
 * every brand icon (measured 2026-07-29).
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
 *
 * An unknown service falls back to lucide `Plug` — the same icon the rail uses for this
 * destination, so "we do not know this one" reads as MCP rather than as a broken image.
 */
const SERVICE_MARK_PATHS: Record<string, string> = {
  notion: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z",
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  gitlab: "m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z",
  linear: "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
  jira: "M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z",
  confluence: "M.87 18.257c-.248.382-.53.875-.763 1.245a.764.764 0 0 0 .255 1.04l4.965 3.054a.764.764 0 0 0 1.058-.26c.199-.332.454-.763.733-1.221 1.967-3.247 3.945-2.853 7.508-1.146l4.957 2.337a.764.764 0 0 0 1.028-.382l2.364-5.346a.764.764 0 0 0-.382-1 599.851 599.851 0 0 1-4.965-2.361C10.911 10.97 5.224 11.185.87 18.257zM23.131 5.743c.249-.405.531-.875.764-1.25a.764.764 0 0 0-.256-1.034L18.675.404a.764.764 0 0 0-1.058.26c-.195.335-.451.763-.734 1.225-1.966 3.246-3.945 2.85-7.508 1.146L4.437.694a.764.764 0 0 0-1.027.382L1.046 6.422a.764.764 0 0 0 .382 1c1.039.49 3.105 1.467 4.965 2.361 6.698 3.246 12.392 3.029 16.738-4.04z",
  figma: "M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z",
  sentry: "M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.904 7.92a15.478 15.478 0 0 1 8.53 12.811h-2.221A13.301 13.301 0 0 0 5.784 9.814l-2.926 5.06a7.65 7.65 0 0 1 4.435 5.848H2.194a.365.365 0 0 1-.298-.534l1.413-2.402a5.16 5.16 0 0 0-1.614-.913L.296 19.275a2.182 2.182 0 0 0 .812 2.999 2.24 2.24 0 0 0 1.086.288h6.983a9.322 9.322 0 0 0-3.845-8.318l1.11-1.922a11.47 11.47 0 0 1 4.95 10.24h5.915a17.242 17.242 0 0 0-7.885-15.28l2.244-3.845a.37.37 0 0 1 .504-.13c.255.14 9.75 16.708 9.928 16.9a.365.365 0 0 1-.327.543h-2.287c.029.612.029 1.223 0 1.831h2.297a2.206 2.206 0 0 0 1.922-3.31z",
  googledrive: "M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z",
  googlechrome: "M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z",
};

export type ServiceMarkName = keyof typeof SERVICE_MARK_PATHS;

/**
 * Which mark a connector wears — matched on **its name and on what it actually runs**.
 *
 * The name alone is not enough: people call the same server `notion`, `notion-mcp`, or
 * `notionApi`, while the command (`@notionhq/notion-mcp-server`) and the address host
 * (`mcp.linear.app`) are the parts that cannot lie about which service is on the other end. Both
 * are searched, and the command/URL wins nothing over the name — either match is a match, because
 * a person who renamed the row to `work-notes` still pointed it at Notion.
 *
 * Each entry lists the fragments that identify one service. They are matched case-insensitively
 * against `<name> <command and arguments, or URL>`, so a fragment must be specific enough not to
 * appear by accident: `drive.google.com` rather than `drive`.
 */
const SERVICE_MARK_HINTS: ReadonlyArray<readonly [ServiceMarkName, readonly string[]]> = [
  ['notion', ['notion']],
  // `github` before `gitlab` would still be safe — the fragments do not overlap — but the
  // Copilot MCP host carries neither word, so it is named explicitly.
  ['github', ['github', 'githubcopilot.com']],
  ['gitlab', ['gitlab']],
  ['linear', ['linear']],
  // Jira and Confluence are both Atlassian, and the shared `atlassian.net` host cannot tell them
  // apart, so the product word decides and the bare host is left to neither.
  ['jira', ['jira']],
  ['confluence', ['confluence']],
  ['figma', ['figma']],
  ['sentry', ['sentry']],
  ['googledrive', ['gdrive', 'google-drive', 'googledrive', 'drive.google.com']],
  ['googlechrome', ['chrome-devtools', 'chromedevtools', 'chrome']],
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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **No scroller draws a bar, and the surfaces that lost a cue pay for it** (owner, 2026-09-06:
 * *"a scrollbar keeps appearing on the right while we are talking … it should just move down
 * smoothly. keep the scrollbar hidden — it still scrolls"*; owner, 2026-09-07: *"I don't want
 * scrollbars to appear when things scroll. Everything, just smooth scrolling"*).
 *
 * ⚠️ **The second verdict moved the rule and kept the class.** The bar-hiding declarations are
 * now on the document, because a per-surface opt-in makes every new `overflow-y-auto` in the
 * repository a bar somebody has to remember to remove — and the six surfaces that carried the
 * class by hand were themselves the record of that not happening. What `.atlas-scroll-quiet`
 * means from here is narrower and still worth a gate: **this scroller was designed without a
 * bar**, so it either needs no "there is more" mark or draws one of its own.
 *
 * Three halves need a gate, and none is visible to lint:
 *
 * 1. **The document rule exists**, in both dialects — Safari and the macOS WebView ignore
 *    `scrollbar-width` entirely, and the installed app is where the owner saw the bar.
 * 2. **The named surfaces still carry the class**, unchanged: a scroller that quietly stopped
 *    declaring its own design is one nobody re-reads before hiding a cue.
 * 3. **Where the bar was the only signal, a `--tabbar-edge-fade` mask replaces it** — the
 *    conversation's past-conversation list and transcript, and the Library's index column,
 *    whose one list of file names is otherwise cut by a hard edge that says nothing about
 *    whether the cut is the end.
 */
const CSS = readFileSync('app/globals.css', 'utf8');

/** Every file whose vertical scrollers were designed with the bar already gone. */
const SCROLLER_SOURCES = [
  'src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx',
  'src/widgets/acp-chat-panel/ui/AcpPresentationPanel.tsx',
  'src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx',
] as const;

/**
 * ⚠️ **The Library's column is asserted by name, not by the detector above.** That detector
 * pairs quotes across the whole file, and `LibraryPage.tsx` is written in prose thick with
 * apostrophes ("the person's own folder"), so a single quote inside a comment pairs with one
 * hundreds of lines away and the scan returns nothing. A detector that silently sees no
 * scrollers is worse than none, so this file is checked by its own two facts instead.
 */
const LIBRARY_INDEX_SCROLLER =
  'atlas-scroll-quiet flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto';

/**
 * Class strings, not JSX attributes. A scroller's classes reach the element through
 * `className="…"`, `cn('…', …)` and plain constants alike, and matching the attribute would see
 * only the first of the three. A string literal cannot legitimately hold JSX, so the string is the
 * safe unit — the same conclusion `brand-fill-ink-license` reached after its tag parser produced
 * seven false positives.
 */
function verticalScrollerClassStrings(source: string): string[] {
  return [...source.matchAll(/(['"`])((?:(?!\1)[\s\S])*)\1/g)]
    .map((match) => match[2])
    .filter((value) => /(?:^|[\s:])overflow-y-auto(?:$|\s)/.test(value));
}

describe('quiet scrollers', () => {
  it('defines one rule that both engines obey', () => {
    expect(CSS).toMatch(/\.atlas-scroll-quiet\s*\{[^}]*scrollbar-width:\s*none/);
    expect(CSS).toMatch(/\.atlas-scroll-quiet::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it('hides the bar on every scroller in the document, in both engines', () => {
    // The standards property and the WebKit pseudo-element, each reaching html, body and
    // every descendant. One without the other leaves the installed app drawing bars.
    expect(CSS).toMatch(/html,\s*\n\s*body,\s*\n\s*body \*\s*\{[^}]*scrollbar-width:\s*none/);
    expect(CSS).toMatch(
      /html::-webkit-scrollbar,\s*\n\s*body::-webkit-scrollbar,\s*\n\s*body \*::-webkit-scrollbar\s*\{[^}]*display:\s*none/,
    );
  });

  it('glides the page scroller only, and only when motion is welcome', () => {
    /*
     * Narrowed on purpose: `scroll-behavior: smooth` changes what `element.scrollTop = n`
     * means, and this repository's specs set it on inner scrollers and read the result on
     * the next line. The document scroller has no such caller.
     */
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior:\s*smooth/,
    );
    expect(CSS).not.toMatch(/body \*\s*\{[^}]*scroll-behavior:\s*smooth/);
  });

  it('keeps the promoted rule identical to the strip rule it generalises', () => {
    const strip = /\.docs-vault-tab-strip\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    const quiet = /\.atlas-scroll-quiet\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(strip.trim()).not.toBe('');
    expect(quiet.trim()).toBe(strip.trim());
  });

  it('finds at least one vertical scroller in every listed source', () => {
    // Non-empty is not complete, but empty is proof the detector stopped seeing the file at all.
    for (const path of SCROLLER_SOURCES) {
      expect(verticalScrollerClassStrings(readFileSync(path, 'utf8')).length).toBeGreaterThan(0);
    }
  });

  it('gives every conversation scroller the quiet class', () => {
    for (const path of SCROLLER_SOURCES) {
      for (const classes of verticalScrollerClassStrings(readFileSync(path, 'utf8'))) {
        expect(`${path} :: ${classes}`).toContain('atlas-scroll-quiet');
      }
    }
  });

  it('fails on a scroller that forgot the class', () => {
    const planted = `<div className="min-h-0 flex-1 overflow-y-auto" />`;
    const found = verticalScrollerClassStrings(planted);
    expect(found).toHaveLength(1);
    expect(found[0]).not.toContain('atlas-scroll-quiet');
  });

  it('stays quiet for a horizontal strip, which is a different affordance', () => {
    expect(verticalScrollerClassStrings(`<div className="overflow-x-auto" />`)).toEqual([]);
  });

  it('replaces the bar with an edge fade where the bar was the only signal', () => {
    /*
     * The Library's index is one list of truncated file names in a 280px column; cut by a
     * hard edge it cannot say whether the cut is the end. Both edges fade, because the
     * switch above it can put a person in the middle of a list they have not scrolled.
     */
    const library = readFileSync('src/views/library/ui/LibraryPage.tsx', 'utf8');
    expect(library).toContain('data-testid="library-index-scroll"');
    expect(library).toContain(LIBRARY_INDEX_SCROLLER);
    expect(library).toContain('const indexFade = "var(--tabbar-edge-fade)"');
    expect(library).toMatch(/const indexMask =[\s\S]{0,600}indexFade/);
    expect(library).toMatch(/indexMask \? \{ maskImage: indexMask, WebkitMaskImage: indexMask \}/);

    const panel = readFileSync('src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx', 'utf8');
    // The past-conversation list: rows below the fold are otherwise unannounced.
    expect(panel).toContain('data-testid="acp-chat-history-list"');
    expect(panel).toContain("const historyFade = 'var(--tabbar-edge-fade)'");
    expect(panel).toMatch(/const historyMask =[\s\S]{0,600}historyFade/);
    expect(panel).toMatch(/historyMask \? \{ maskImage: historyMask, WebkitMaskImage: historyMask \}/);
    // The transcript's top edge cuts glyphs in half without one.
    expect(panel).toMatch(/transcriptScrolled[\s\S]{0,400}--tabbar-edge-fade/);
  });

  it('lets distance decide how the transcript follows, and leaves reduced motion to the base layer', () => {
    const panel = readFileSync('src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx', 'utf8');
    expect(panel).toContain('transcriptPinnedToBottomRef');
    expect(panel).toContain('transcriptRestoredRef');
    expect(panel).toMatch(/remaining <= list\.clientHeight/);
    expect(panel).toMatch(/scrollBehavior = glide \? 'smooth' : 'auto'/);
    // The global override is what makes a local reduced-motion branch unnecessary — and wrong.
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}scroll-behavior:\s*auto\s*!important/,
    );
    // The follow effect itself must not read the preference: an `!important` base rule already
    // wins, and a second opinion here is a branch that can only disagree with it.
    const follow = /useLayoutEffect\(\(\) => \{\n\s+const list = listRef\.current;[\s\S]*?\}, \[events/.exec(panel)?.[0] ?? '';
    expect(follow).toContain('scrollBehavior');
    expect(follow).not.toMatch(/reducedMotion|prefersReducedMotion/);
  });
});

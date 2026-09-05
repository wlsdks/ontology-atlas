import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **The conversation scrolls and the bar does not draw** (owner, 2026-09-06: *"a scrollbar keeps
 * appearing on the right while we are talking … which AI chat does that? it should just move down
 * smoothly. keep the scrollbar hidden — it still scrolls"*).
 *
 * Two halves need a gate, and neither is visible to lint:
 *
 * 1. **The rule exists once.** `.atlas-scroll-quiet` is the promoted form of the two declarations
 *    `.docs-vault-tab-strip` already carried. A second spelling of "scrolls, shows no bar" is how
 *    two rules drift apart, so the class must carry both the standards property and the WebKit
 *    pseudo-element — Safari and the macOS WebView ignore `scrollbar-width` entirely, and the
 *    installed app is where the owner saw the bar.
 * 2. **Every scroller in the conversation wears it.** A class string is invisible to CSS lint: a
 *    new `overflow-y-auto` in any of these five files renders a bar again with no signal at all,
 *    which is exactly how the surfaces diverged in the first place.
 *
 * ⚠️ **Hiding a bar removes the only "there is more" mark**, so the roster is not "every scroller
 * everywhere". It is these five, each with a reason the mark is redundant — a transcript pinned to
 * its tail, a bounded menu, views that end on a card edge — plus the one that is *not* redundant:
 * the past-conversation list replaces the bar with the `--tabbar-edge-fade` mask the tab strips
 * already use, rather than with nothing.
 */
const CSS = readFileSync('app/globals.css', 'utf8');

/** Every file whose vertical scrollers belong to the conversation surface. */
const SCROLLER_SOURCES = [
  'src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx',
  'src/widgets/acp-chat-panel/ui/AcpPresentationPanel.tsx',
  'src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx',
] as const;

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

describe('quiet chat scrollers', () => {
  it('defines one rule that both engines obey', () => {
    expect(CSS).toMatch(/\.atlas-scroll-quiet\s*\{[^}]*scrollbar-width:\s*none/);
    expect(CSS).toMatch(/\.atlas-scroll-quiet::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
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

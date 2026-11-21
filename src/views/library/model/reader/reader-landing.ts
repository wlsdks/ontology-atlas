import { MOTION } from "@/shared/motion";

/**
 * Where an opened page should stand once its body is painted: at a claim (a desk row: its sentence
 * as the row shows it, and its line as a hint), or at the scroll position it was left at (Back).
 */
export type ReaderLanding = { slug: string; line: number; sentence: string } | { slug: string; top: number };

/** How long the claim's mark holds before it fades, so a person who watched the scroll sees it. */
const MARK_HOLD_MS = MOTION.choreography.duration * 1000;
const MARK_FADE_MS = MOTION.slow.duration * 1000;
/** Where the claim stands after the scroll: this share of the viewport down from its top. */
const LANDING_SHARE = 0.3;

/** Whether `rect` lies wholly inside `view`, so landing there needs no scroll. */
export function insideView(rect: { top: number; bottom: number }, view: { top: number; bottom: number }): boolean {
  return rect.top >= view.top && rect.bottom <= view.bottom;
}

/** The scroll top that puts `rect` at `LANDING_SHARE` of the viewport, clamped to what can scroll. */
export function landingTop(
  rect: { top: number },
  view: { top: number; height: number },
  scrollTop: number,
  maxScroll: number,
): number {
  const wanted = scrollTop + (rect.top - view.top) - view.height * LANDING_SHARE;
  return Math.round(Math.min(Math.max(0, wanted), Math.max(0, maxScroll)));
}

function words(text: string): string[] {
  return text.normalize("NFC").toLocaleLowerCase("und").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The words a block shows a reader: citation chips and hidden hints are not the sentence. */
function shownWords(block: HTMLElement): string[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('button[data-source-path], [aria-hidden="true"], .sr-only')) continue;
    text += ` ${node.nodeValue ?? ""}`;
  }
  return words(text);
}

function startsAt(haystack: readonly string[], needle: readonly string[], at: number): boolean {
  return needle.every((word, index) => haystack[at + index] === word);
}

/**
 * The block that shows `sentence`, nearest `line` when several do. A wikilink shows its page's
 * title, which the sentence does not carry, so the words before the first one must open the block;
 * a sentence that opens with a wikilink matches on the first words after it instead.
 */
export function findClaimBlock(layer: HTMLElement, line: number, sentence: string): HTMLElement | null {
  const parts = sentence.replace(/\]\([^)]*\)/gu, "]").split(/\[\[[^\]]*\]\]/u).map(words);
  const index = parts.findIndex((part) => part.length > 0);
  if (index < 0) return null;
  const needle = parts[index]!;
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const block of layer.querySelectorAll<HTMLElement>("[data-docs-viewer] [data-line]")) {
    const shown = shownWords(block);
    const matches = index === 0
      ? startsAt(shown, needle, 0)
      : shown.some((_, at) => startsAt(shown, needle, at));
    if (!matches) continue;
    const distance = Math.abs(Number(block.dataset.line) - line);
    if (distance < bestDistance) {
      best = block;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Brings the block that shows the claim into view with one scroll and no correction, and lays a mark in
 * `layer` that holds, fades and leaves. Reduced motion scrolls instantly and skips the fade. Returns a
 * cleanup; a claim no block shows leaves no mark and the page opens at its top.
 */
export function landAtLine(
  scroller: HTMLElement,
  layer: HTMLElement,
  claim: { line: number; sentence: string },
  reduced: boolean,
): (() => void) | null {
  const block = findClaimBlock(layer, claim.line, claim.sentence);
  if (!block) {
    scroller.scrollTop = 0;
    return null;
  }
  const view = scroller.getBoundingClientRect();
  const rect = block.getBoundingClientRect();
  const scrolls = !insideView(rect, view);
  const target = scrolls
    ? landingTop(rect, view, scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight)
    : scroller.scrollTop;

  const layerRect = layer.getBoundingClientRect();
  const mark = document.createElement("div");
  mark.dataset.readerClaimMark = "true";
  mark.setAttribute("aria-hidden", "true");
  Object.assign(mark.style, {
    position: "absolute",
    zIndex: "-1",
    pointerEvents: "none",
    left: `${rect.left - layerRect.left - 10}px`,
    top: `${rect.top - layerRect.top - 4}px`,
    width: `${rect.width + 20}px`,
    height: `${rect.height + 8}px`,
    borderRadius: "var(--radius-chip)",
    background: "var(--color-indigo-line-a22)",
  });
  layer.prepend(mark);
  if (scrolls) scroller.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });

  let fade: Animation | null = null;
  let timer = 0;
  const remove = () => {
    window.clearTimeout(timer);
    fade?.cancel();
    mark.remove();
  };
  const startFade = () => {
    if (reduced) {
      timer = window.setTimeout(remove, MARK_HOLD_MS);
      return;
    }
    fade = mark.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: MARK_FADE_MS,
      delay: MARK_HOLD_MS,
      easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      fill: "forwards",
    });
    fade.finished.then(remove, () => undefined);
  };
  if (!scrolls || reduced) {
    startFade();
    return remove;
  }
  /* The hold starts when the scroll settles; `scrollend` where the engine has it, a bound otherwise. */
  let started = false;
  const settle = () => {
    if (started) return;
    started = true;
    scroller.removeEventListener("scrollend", settle);
    startFade();
  };
  scroller.addEventListener("scrollend", settle, { once: true });
  timer = window.setTimeout(settle, 900);
  return () => {
    scroller.removeEventListener("scrollend", settle);
    remove();
  };
}

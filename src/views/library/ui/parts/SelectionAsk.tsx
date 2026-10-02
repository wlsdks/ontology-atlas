"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { MessageCircleQuestion } from "lucide-react";

import type { AskQuestionId } from "@/features/library";
import { Chip, Surface } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { isImeComposing } from "@/shared/lib/ime-composition";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Input } from "@/shared/ui/input";
import { transientSurface } from "@/shared/ui/transient-surface";
import type { useTranslations } from "next-intl";

type Translator = ReturnType<typeof useTranslations<"library">>;

/** Fewer characters than this is a word someone double-clicked, not a passage. */
const MIN_PASSAGE = 8;
/** One bar row, with the gap above the line: the room needed to sit above a selection. */
const BAR_ROOM = 56;
/** Before the bar is measured, this much is kept inside the box; the real width corrects it. */
const BAR_WIDTH = 420;

type Placement = { text: string; top: number; left: number; above: boolean };

/**
 * Select a passage in a wiki page, ask the agent about it.
 *
 * Owner direction 2026-09-07: dragging over text should offer a question at once, with the
 * question chosen rather than typed from scratch. The moment a passage is selected a single
 * bar appears just above its first line — where this comes from, what disagrees, explain
 * it — and a line for the person's own words. Nothing is sent until one of them is
 * pressed, and the passage is quoted into the conversation so the answer is about exactly
 * those words. While the bar is up the page body carries `data-selecting`, and the page
 * dims every line but the selection and the bar.
 *
 * Why one bar and not a chip that opens a list (the first shape, same day): the list stood
 * to the left of the text and covered three lines of it, and it took a second press to see
 * the questions. A row above the first selected line covers at most the line before it,
 * and reads as belonging to the selection the way an editor's formatting bar does. The
 * second shape the same day boxed every question in its own bordered chip and let the row
 * run off the right edge of the pane when a selection started far to the right; the owner
 * rejected that too. Now the questions are bare text buttons separated by hairlines, the
 * person's own question opens an input in the same row, and after the bar is drawn its
 * real width is measured and the row is pulled back inside the page box.
 *
 * The bar is `transientSurface('anchored')` on the shared `Surface`, the same shape as the
 * Library's shelf popover: beside what opened it, closes on Escape or an outside press, no
 * scrim. It is placed inside `containerRef`, the positioned page-body box, from the
 * selection's own line rectangles, so it follows the text at every width; when the first
 * line is too close to the top of the scroll pane, it hangs under the last line instead.
 */
export function SelectionAsk({
  containerRef,
  onAsk,
  disabled,
  t,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onAsk: (selection: string, question: AskQuestionId, customQuestion?: string) => void;
  disabled: boolean;
  t: Translator;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [own, setOwn] = useState(false);
  const barRef = useRef<HTMLElement | null>(null);

  const readSelection = useCallback(() => {
    const container = containerRef.current;
    const live = typeof window !== "undefined" ? window.getSelection() : null;
    if (!container || !live || live.rangeCount === 0 || live.isCollapsed) {
      setOpen(false);
      return;
    }
    const range = live.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setOpen(false);
      return;
    }
    const text = live.toString().trim();
    if (text.length < MIN_PASSAGE) {
      setOpen(false);
      return;
    }
    // A range without rectangles (a DOM without layout) still gets the bar, at the top.
    const lines = typeof range.getClientRects === "function" ? Array.from(range.getClientRects()) : [];
    const bounding =
      typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : { top: 0, bottom: 0, left: 0 };
    const first = lines[0] ?? bounding;
    const last = lines[lines.length - 1] ?? bounding;
    const hostRect = container.getBoundingClientRect();
    const paneTop = scrollPaneOf(container)?.getBoundingClientRect().top ?? 0;
    const above = first.top - paneTop >= BAR_ROOM;
    setPlacement({
      text,
      above,
      top: above ? first.top - hostRect.top - 8 : last.bottom - hostRect.top + 8,
      left: Math.max(8, Math.min(first.left - hostRect.left, hostRect.width - 8 - BAR_WIDTH)),
    });
    setOwn(false);
    setOpen(true);
  }, [containerRef]);

  // Drawn, then measured: the left edge is pulled back so the whole row stays inside the
  // page box. Placement from the selection alone let the row run off the right edge of
  // the pane (owner, installed app, 2026-09-07).
  useLayoutEffect(() => {
    if (!open || !placement) return;
    const bar = barRef.current;
    const container = containerRef.current;
    if (!bar || !container) return;
    const width = bar.offsetWidth;
    if (width === 0) return;
    const maxLeft = Math.max(8, container.clientWidth - 8 - width);
    if (placement.left > maxLeft) setPlacement({ ...placement, left: maxLeft });
  }, [containerRef, open, own, placement]);

  // The body box carries `data-selecting` while the bar is up; the page's own class dims
  // everything under it except this bar (see LibraryPage).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (open) container.dataset.selecting = "true";
    else delete container.dataset.selecting;
    return () => {
      delete container.dataset.selecting;
    };
  }, [containerRef, open]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // A release or a key inside the bar itself is the person using the bar, not making a
    // new selection: pressing a question collapses the browser selection on the way, and
    // typing an own question does so on focus. Neither may take the bar down.
    const inBar = (node: EventTarget | null) => !!barRef.current && node instanceof Node && barRef.current.contains(node);
    const onUp = (event: Event) => {
      if (inBar(event.target)) return;
      window.setTimeout(readSelection, 0);
    };
    // A selection collapsed from anywhere else (a press on the shelf, Escape, a key) takes
    // the bar and the dimming with it; only a release inside the page can raise the bar, so
    // a drag in progress never flickers one into view.
    const onChange = () => {
      if (inBar(document.activeElement)) return;
      const live = window.getSelection();
      if (!live || live.isCollapsed || live.rangeCount === 0) window.setTimeout(readSelection, 0);
    };
    container.addEventListener("mouseup", onUp);
    container.addEventListener("keyup", onUp);
    document.addEventListener("selectionchange", onChange);
    return () => {
      container.removeEventListener("mouseup", onUp);
      container.removeEventListener("keyup", onUp);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [containerRef, readSelection]);

  // A press on a question must not collapse the selection it is about; the input is the
  // one child that needs the press for focus. (`Surface` takes no handlers of its own.)
  useEffect(() => {
    if (!open) return;
    const bar = barRef.current;
    if (!bar) return;
    const onBarDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement && event.target.closest("input"))) event.preventDefault();
    };
    bar.addEventListener("mousedown", onBarDown);
    return () => bar.removeEventListener("mousedown", onBarDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // The page answers Escape by closing the document unless the key was already
        // spent (`defaultPrevented`); with the bar up, one press closes the bar only.
        event.preventDefault();
        event.stopPropagation();
        window.getSelection()?.removeAllRanges();
        setOpen(false);
      }
    };
    // A press outside the bar and outside the page clears the selection, which closes the
    // bar through `selectionchange`; a press inside the page starts a new selection.
    const onDown = (event: MouseEvent) => {
      const container = containerRef.current;
      const target = event.target as Node;
      if (barRef.current?.contains(target)) return;
      if (container?.contains(target)) return;
      window.getSelection()?.removeAllRanges();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown);
    };
  }, [containerRef, open]);

  const onExited = useCallback(() => {
    setPlacement(null);
    setCustom("");
    setOwn(false);
  }, []);

  if (!placement) return null;
  const ask = (question: AskQuestionId, customQuestion?: string) => {
    onAsk(placement.text, question, customQuestion);
    setOpen(false);
    window.getSelection()?.removeAllRanges();
  };
  const questions: ReadonlyArray<Exclude<AskQuestionId, "custom">> = ["evidence", "disagreement", "explain"];

  return (
    <div
      data-testid="library-selection-ask"
      className="absolute z-30"
      style={{ top: placement.top, left: placement.left, transform: placement.above ? "translateY(-100%)" : undefined }}
    >
      <Surface
        open={open}
        as="aside"
        ref={barRef}
        motion="chrome"
        origin={placement.above ? "bottom left" : "top left"}
        onExited={onExited}
        {...transientSurface("anchored")}
        aria-label={t("ask.title")}
        className="flex h-9 max-w-full items-center gap-0.5 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-1 shadow-[var(--shadow-elevation-1)]"
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[color:var(--color-text-quaternary)]"
          title={t("ask.title")}
          aria-hidden
        >
          <MessageCircleQuestion size={ICON_SIZE.sm} />
        </span>
        {own ? (
          <>
            <Input
              data-testid="library-ask-custom"
              size="sm"
              aria-label={t("ask.placeholder")}
              value={custom}
              autoFocus
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && custom.trim() && !isImeComposing(event)) ask("custom", custom);
              }}
              placeholder={t("ask.placeholder")}
              className="w-[min(18rem,60vw)]"
            />
            <Chip
              data-testid="library-ask-send"
              tone={custom.trim() ? "accent" : "muted"}
              hoverInk="strong"
              disabled={disabled || custom.trim() === ""}
              onClick={() => ask("custom", custom)}
              className={BARE}
            >
              {t("ask.send")}
            </Chip>
          </>
        ) : (
          <>
            {questions.map((question, index) => (
              <span key={question} className="contents">
                {index > 0 ? <Hairline /> : null}
                <Chip
                  data-testid={`library-ask-${question}`}
                  tone="secondary"
                  hoverInk="strong"
                  hoverSurface="lift"
                  disabled={disabled}
                  onClick={() => ask(question)}
                  className={BARE}
                >
                  {t(`ask.${question}`)}
                </Chip>
              </span>
            ))}
            <Hairline />
            <Chip
              data-testid="library-ask-own"
              tone="muted"
              hoverInk="strong"
              hoverSurface="lift"
              disabled={disabled}
              onClick={() => setOwn(true)}
              className={BARE}
            >
              {t("ask.own")}
            </Chip>
          </>
        )}
      </Surface>
    </div>
  );
}

/** The nearest ancestor that scrolls vertically, so the bar knows how much room is above. */
function scrollPaneOf(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

/** A question as a bare text button: the bar's ground is the only box on screen. */
const BARE = cn("h-7 flex-none whitespace-nowrap border-transparent bg-transparent px-2");

/** The hairline between two questions, the bar's only structure. */
function Hairline() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[color:var(--color-divider)]" />;
}

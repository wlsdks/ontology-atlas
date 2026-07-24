"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type {
  StudioBearing,
  StudioRelation,
  StudioSatellite,
} from "../lib/build-studio-item";
import type { CreateCandidate, CreateNodeKind } from "../lib/build-create-node";

/**
 * 나침 무대 (Compass Stage) — the ontology WRITE surface. One focal node sits
 * center-stage; the four relation types are nailed to fixed compass bearings
 * (UP 상위개념 · RIGHT 기대는 곳 · DOWN 담는 것 · LEFT 비슷한 것). Filling a
 * missing relation completes the node's meaning.
 *
 * ONE surface, two fill-states — no mode tabs:
 *   - enhance: an existing node, partially filled. Fill a socket → write a real
 *     relation to the node's frontmatter (or copy an MCP packet, read-only).
 *   - create:  an all-empty new node. Identity fields are editable in the center
 *     draft card; filling sockets stages pending relations; save applies.
 *
 * Charter: dark only, neutrals + single indigo, amber ONLY on the
 * expected-but-missing (DOWN) socket. No glow/gradient/particle/scale-hover.
 * Every string is a resolved `label`, so this renders in isolation and is
 * unit-testable. Data + writes live in `OntologyStudioPage`.
 */

// ── Board geometry (fixed coordinate system, centered in the stage) ──────────
const BOARD = { w: 1180, h: 600 } as const;
const CX = BOARD.w / 2; // 590
const CY = BOARD.h / 2; // 300
const CARD = { w: 372, h: 172 } as const;
const CARD_CREATE_H = 236;
const SAT = { w: 226, h: 54, gap: 12 } as const;
const MAX_VISIBLE = 2;

export interface CompassBearingView {
  bearing: StudioBearing;
  relation: StudioRelation;
  /** Plain-language socket question (never the relation type name). */
  question: string;
  /** Short lane-head label shown next to a filled lane. */
  laneLabel: string;
  /** Sub-line under the empty-socket question. */
  emptyHint: string;
  neighbors: StudioSatellite[];
  filled: boolean;
  recommended: boolean;
  expected: boolean;
}

export interface CompassKindOption {
  value: CreateNodeKind;
  label: string;
}

export interface StudioCompassLabels {
  searchPlaceholder: string;
  exit: string;
  moreRelations: string;
  flowEyebrow: string;
  /** (filled, total) → e.g. "4방향 중 2 채움 · 반쯤 왔어요". */
  flowCount: (filled: number, total: number) => string;
  /** (name) → the one calm frame prompt. */
  framePrompt: (name: string) => string;
  guideBadge: string; // "여기부터 채워요"
  /** (filled, total) → bottom progress "4개 중 2개 채웠어요 · N군데 남음". */
  bottomProgress: (filled: number, total: number) => string;
  save: string;
  saveHint: string;
  foldMore: (n: number) => string;
  // picker
  pickerTitle: (question: string) => string;
  pickerSub: string;
  pickerPlaceholder: string;
  pickerEmpty: string;
  pickerKind: (kindLabel: string) => string;
  pickerCreateNew: string;
  /** near-dup suggestion. (title) → message. */
  similarSuggest: (title: string) => string;
  similarAccept: string;
  // create identity
  createName: string;
  createNamePlaceholder: string;
  createDomainNone: string;
  createDefinitionPlaceholder: string;
  createSimilar: (title: string, kindLabel: string) => string;
  createSimilarOpen: string;
  createSimilarAnyway: string;
}

export interface CompassFocal {
  kindLabel: string;
  domainLabel: string | null;
  name: string;
  definition: string;
}

export interface StudioCompassProps {
  mode: "enhance" | "create";
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  focal: CompassFocal;
  bearings: CompassBearingView[];
  filledBearings: number;
  writable: boolean;
  /** Fill a socket. Returns candidate rows for the picker + a near-dup hit. */
  candidatesFor: (relation: StudioRelation, query: string) => CreateCandidate[];
  similarFor?: (relation: StudioRelation, query: string) => CreateCandidate | null;
  onFill: (relation: StudioRelation, candidate: CreateCandidate) => void;
  onSave: () => void;
  onExit: () => void;
  /** Picker "찾는 게 없어요 · 새로 만들기" bridge — opt-in, enhance mode routes to create. */
  onCreateNew?: () => void;

  // create-only identity editing
  createKinds?: CompassKindOption[];
  createKind?: CreateNodeKind;
  onCreateKind?: (kind: CreateNodeKind) => void;
  onCreateName?: (name: string) => void;
  createDomains?: ReadonlyArray<{ value: string; title: string }>;
  createDomainValue?: string | null;
  onCreateDomain?: (value: string | null) => void;
  onCreateDefinition?: (def: string) => void;
  createSimilarHit?: { title: string; kind: string; slug: string } | null;
  onOpenSimilar?: (slug: string) => void;
  onDismissSimilar?: () => void;
  canSave?: boolean;
}

interface LaneLayout {
  /** Satellite top-left positions (board coords). */
  sats: Array<{ sat: StudioSatellite; x: number; y: number }>;
  fold: { x: number; y: number; count: number } | null;
  socket: { x: number; y: number; w: number; h: number } | null;
  struts: string[];
  anchor: { x: number; y: number }; // where the picker beak points
}

/** Vertically-centered top positions for `n` stacked satellites around `cy`. */
function stackTops(cy: number, n: number, withFold: boolean): number[] {
  const foldH = withFold ? 30 + SAT.gap : 0;
  const total = n * SAT.h + Math.max(0, n - 1) * SAT.gap + foldH;
  const start = cy - total / 2;
  const tops: number[] = [];
  for (let i = 0; i < n; i += 1) tops.push(start + i * (SAT.h + SAT.gap));
  return tops;
}

function layoutLane(view: CompassBearingView, cardH: number): LaneLayout {
  const cardTop = CY - cardH / 2;
  const cardBottom = CY + cardH / 2;
  const cardLeft = CX - CARD.w / 2;
  const cardRight = CX + CARD.w / 2;

  const total = view.neighbors.length;
  const visible = view.neighbors.slice(0, MAX_VISIBLE);
  const overflow = total - visible.length;
  const withFold = overflow > 0;

  if (!view.filled) {
    // Empty socket + dashed strut into it.
    if (view.bearing === "up") {
      const w = 250;
      const h = 78;
      const y = cardTop - 44 - h;
      const x = CX - w / 2;
      return {
        sats: [],
        fold: null,
        socket: { x, y, w, h },
        struts: [`M ${CX} ${cardTop} V ${y + h}`],
        anchor: { x: CX, y: y + h / 2 },
      };
    }
    if (view.bearing === "down") {
      const w = 226;
      const h = 66;
      const y = cardBottom + 44;
      const x = CX - w / 2;
      return {
        sats: [],
        fold: null,
        socket: { x, y, w, h },
        struts: [`M ${CX} ${cardBottom} V ${y}`],
        anchor: { x: CX, y: y + h / 2 },
      };
    }
    // left / right empty socket
    const w = 226;
    const h = 66;
    const y = CY - h / 2;
    if (view.bearing === "right") {
      const x = cardRight + 128;
      return {
        sats: [],
        fold: null,
        socket: { x, y, w, h },
        struts: [`M ${cardRight} ${CY} H ${x}`],
        anchor: { x, y: CY },
      };
    }
    const x = cardLeft - 128 - w;
    return {
      sats: [],
      fold: null,
      socket: { x, y, w, h },
      struts: [`M ${cardLeft} ${CY} H ${x + w}`],
      anchor: { x: x + w, y: CY },
    };
  }

  // Filled lane — satellites + solid struts.
  if (view.bearing === "right" || view.bearing === "left") {
    const isRight = view.bearing === "right";
    const satX = isRight ? cardRight + 128 : cardLeft - 128 - SAT.w;
    const busX = isRight ? cardRight + 62 : cardLeft - 62;
    const edgeX = isRight ? cardRight : cardLeft;
    const satMeetX = isRight ? satX : satX + SAT.w;
    const tops = stackTops(CY, visible.length, withFold);
    const centers = tops.map((t) => t + SAT.h / 2);
    const sats = visible.map((sat, i) => ({ sat, x: satX, y: tops[i] }));
    const struts: string[] = [`M ${edgeX} ${CY} H ${busX}`];
    const busTop = Math.min(...centers, CY);
    const busBottom = Math.max(...centers, CY);
    if (busBottom - busTop > 0.5) struts.push(`M ${busX} ${busTop} V ${busBottom}`);
    for (const cyi of centers) struts.push(`M ${busX} ${cyi} H ${satMeetX}`);
    let fold: LaneLayout["fold"] = null;
    if (withFold) {
      const foldY = tops[tops.length - 1] + SAT.h + SAT.gap;
      fold = { x: satX, y: foldY, count: overflow };
      struts.push(`M ${busX} ${foldY + 15} H ${satMeetX}`);
      const newBottom = Math.max(busBottom, foldY + 15);
      struts[1] = `M ${busX} ${busTop} V ${newBottom}`;
    }
    return { sats, fold, socket: null, struts, anchor: { x: isRight ? satX : satX + SAT.w, y: CY } };
  }

  // up / down filled — vertical stack directly above/below the card.
  const isDown = view.bearing === "down";
  const satX = CX - SAT.w / 2;
  const edgeY = isDown ? cardBottom : cardTop;
  let y0 = isDown ? cardBottom + 40 : cardTop - 40 - visible.length * (SAT.h + SAT.gap);
  if (!isDown && withFold) y0 -= 30 + SAT.gap;
  const sats = visible.map((sat, i) => ({ sat, x: satX, y: y0 + i * (SAT.h + SAT.gap) }));
  const firstEdge = isDown ? y0 : y0 + (visible.length - 1) * (SAT.h + SAT.gap) + SAT.h;
  const struts: string[] = [`M ${CX} ${edgeY} V ${firstEdge}`];
  let fold: LaneLayout["fold"] = null;
  if (withFold) {
    const foldY = isDown ? y0 + visible.length * (SAT.h + SAT.gap) : y0 - (30 + SAT.gap);
    fold = { x: satX, y: foldY, count: overflow };
  }
  return {
    sats,
    fold,
    socket: null,
    struts,
    anchor: { x: CX, y: isDown ? y0 : y0 + SAT.h },
  };
}

const KIND_LETTER: Record<string, string> = {
  project: "P",
  domain: "D",
  capability: "C",
  element: "E",
  document: "◦",
  unknown: "•",
};

function KindGlyph({ kind }: { kind: string }) {
  return (
    <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-label font-semibold text-[color:var(--color-text-tertiary)]">
      {KIND_LETTER[kind] ?? "•"}
    </span>
  );
}

export function StudioCompass(props: StudioCompassProps) {
  const {
    mode,
    labels,
    kindLabelFor,
    focal,
    bearings,
    filledBearings,
    candidatesFor,
    similarFor,
    onFill,
    onSave,
    onExit,
  } = props;

  const [openRelation, setOpenRelation] = useState<StudioRelation | null>(null);
  const [query, setQuery] = useState("");

  const cardH = mode === "create" ? CARD_CREATE_H : CARD.h;
  const cardTop = CY - cardH / 2;
  const cardLeft = CX - CARD.w / 2;

  const layouts = useMemo(
    () => bearings.map((b) => ({ view: b, layout: layoutLane(b, cardH) })),
    [bearings, cardH],
  );

  const openLayout = layouts.find((l) => l.view.relation === openRelation) ?? null;
  const pickerRows = openRelation ? candidatesFor(openRelation, query) : [];
  const similarHit =
    openRelation && similarFor ? similarFor(openRelation, query) : null;

  const openPicker = (relation: StudioRelation) => {
    setOpenRelation((cur) => (cur === relation ? null : relation));
    setQuery("");
  };
  const pick = (candidate: CreateCandidate) => {
    if (!openRelation) return;
    onFill(openRelation, candidate);
    setOpenRelation(null);
    setQuery("");
  };

  return (
    <div
      className="relative grid h-[100dvh] min-h-0 grid-rows-[52px_1fr_64px] overflow-hidden bg-[color:var(--color-canvas)]"
      data-testid="studio-compass-stage"
    >
      {/* ── Top bar ── */}
      <header className="relative z-[6] flex items-center gap-3.5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5">
        <div className="flex h-8 w-[300px] items-center gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body text-[color:var(--color-text-quaternary)]">
          <Search size={14} aria-hidden className="flex-none" />
          <span className="truncate">{labels.searchPlaceholder}</span>
        </div>
        <div className="flex items-center gap-2 text-caption text-[color:var(--color-text-tertiary)]">
          <span className="font-semibold text-[color:var(--color-text-secondary)]">{focal.name || "—"}</span>
          <span className="text-[color:var(--color-text-quaternary)]">·</span>
          <span className="rounded-[5px] border border-[color:var(--color-border-soft)] px-1.5 py-px text-label tracking-[0.02em]">
            {focal.kindLabel}
          </span>
          {focal.domainLabel ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">·</span>
              <span>{focal.domainLabel}</span>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onExit}
          data-testid="studio-exit"
          className="ml-auto flex h-[30px] items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-3 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        >
          <span className="text-[color:var(--color-text-quaternary)]">✕</span> {labels.exit}
        </button>
      </header>

      {/* ── Compass board ── */}
      <div
        className="relative min-h-0 overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(var(--color-divider) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          backgroundPosition: "14px 12px",
        }}
      >
        {/* flow cue — top-left wayfinding */}
        <div className="absolute left-12 top-8 z-[4] flex items-center gap-3" data-testid="studio-flow-cue">
          <MiniRose bearings={bearings} />
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-[0.05em] text-[color:var(--color-text-quaternary)]">
              {labels.flowEyebrow}
            </span>
            <span className="text-body text-[color:var(--color-text-secondary)]">
              {labels.flowCount(filledBearings, 4)}
            </span>
          </div>
        </div>

        {/* one calm frame prompt — top center */}
        <div className="absolute left-1/2 top-4 z-[4] -translate-x-1/2 whitespace-nowrap text-center text-callout tracking-[-0.006em] text-[color:var(--color-text-secondary)]">
          {labels.framePrompt(focal.name || "…")}
        </div>

        {/* rare relations — top right */}
        <button
          type="button"
          className="absolute right-5 top-3.5 z-[4] flex h-7 items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-2.5 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        >
          <span className="text-[color:var(--color-text-quaternary)]">＋</span> {labels.moreRelations}
        </button>

        {/* the fixed-coordinate board, centered */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: BOARD.w, height: BOARD.h }}
        >
          {/* struts overlay */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={BOARD.w}
            height={BOARD.h}
            viewBox={`0 0 ${BOARD.w} ${BOARD.h}`}
            aria-hidden
          >
            {layouts.map(({ view, layout }) =>
              layout.struts.map((d, i) => (
                <path
                  key={`${view.bearing}-${i}`}
                  d={d}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-[stroke] duration-200 motion-reduce:transition-none"
                  stroke={
                    view.filled
                      ? "var(--color-indigo)"
                      : view.expected
                        ? "var(--color-amber-muted-a62)"
                        : "var(--color-border-strong)"
                  }
                  strokeWidth={view.filled ? 1.75 : 1.5}
                  strokeDasharray={view.filled ? undefined : "4 6"}
                />
              )),
            )}
            {layouts.map(({ view }) =>
              view.filled && (view.bearing === "left" || view.bearing === "right") ? (
                <circle
                  key={`dot-${view.bearing}`}
                  cx={view.bearing === "right" ? CX + CARD.w / 2 + 62 : CX - CARD.w / 2 - 62}
                  cy={CY}
                  r={2}
                  fill="var(--color-indigo)"
                />
              ) : null,
            )}
          </svg>

          {/* center focal / draft card */}
          <CenterCard {...props} cardH={cardH} cardTop={cardTop} cardLeft={cardLeft} bearings={bearings} />

          {/* lanes */}
          {layouts.map(({ view, layout }) => (
            <LaneRender
              key={view.bearing}
              view={view}
              layout={layout}
              labels={labels}
              kindLabelFor={kindLabelFor}
              onOpen={() => openPicker(view.relation)}
            />
          ))}

          {/* inline anchored picker */}
          {openRelation && openLayout ? (
            <InlinePicker
              anchor={openLayout.layout.anchor}
              relation={openRelation}
              question={bearings.find((b) => b.relation === openRelation)?.question ?? ""}
              labels={labels}
              rows={pickerRows}
              similarHit={similarHit}
              kindLabelFor={kindLabelFor}
              query={query}
              onQuery={setQuery}
              onPick={pick}
              onClose={() => setOpenRelation(null)}
              onCreateNew={props.onCreateNew}
            />
          ) : null}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <footer className="relative z-[6] flex items-center gap-4 border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5">
        <span
          aria-hidden
          className="h-4 w-4 flex-none rounded-[3px]"
          style={{
            borderTop: "1.4px dashed var(--color-border-strong)",
            borderBottom: "1.4px dashed var(--color-border-strong)",
            borderLeft: "1.6px solid var(--color-indigo)",
            borderRight: "1.6px solid var(--color-indigo)",
          }}
        />
        <span className="text-caption text-[color:var(--color-text-secondary)]" data-testid="studio-bottom-progress">
          {labels.bottomProgress(filledBearings, 4)}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.saveHint}</span>
          <button
            type="button"
            data-testid="studio-save"
            disabled={props.canSave === false}
            onClick={onSave}
            className="flex h-[34px] items-center gap-2 rounded-lg bg-[color:var(--color-indigo)] px-4 text-caption font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-40"
          >
            {mode === "create" ? <Check size={15} aria-hidden /> : null}
            {labels.save}
            <span className="opacity-75">→</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Center focal / draft card ────────────────────────────────────────────────
function CenterCard(
  props: StudioCompassProps & {
    cardH: number;
    cardTop: number;
    cardLeft: number;
    bearings: CompassBearingView[];
  },
) {
  const { mode, focal, cardH, cardTop, cardLeft, bearings } = props;
  const borderFor = (bearing: StudioBearing) => {
    const v = bearings.find((b) => b.bearing === bearing);
    if (v?.filled) return "2px solid var(--color-indigo)";
    if (v?.expected) return "1.5px dashed var(--color-amber-muted-a62)";
    return "1.5px dashed var(--color-border-strong)";
  };
  return (
    <div
      className="absolute flex flex-col rounded-[14px] bg-[color:var(--color-elevated)] px-[22px] py-[18px]"
      data-testid="studio-center-card"
      style={{
        left: cardLeft,
        top: cardTop,
        width: CARD.w,
        height: cardH,
        borderTop: borderFor("up"),
        borderBottom: borderFor("down"),
        borderRight: borderFor("right"),
        borderLeft: borderFor("left"),
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "create" && props.createKinds ? (
          <div role="group" className="flex gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[3px]">
            {props.createKinds.map((k) => (
              <button
                key={k.value}
                type="button"
                data-testid={`studio-create-kind-${k.value}`}
                aria-pressed={props.createKind === k.value}
                onClick={() => props.onCreateKind?.(k.value)}
                className={cn(
                  "rounded-[5px] px-2 py-1 text-label transition-colors",
                  props.createKind === k.value
                    ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)] font-semibold"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        ) : (
          <>
            <span className="rounded-[5px] border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a12)] px-1.5 py-px text-label tracking-[0.03em] text-[color:var(--color-indigo-text-soft)]">
              {focal.kindLabel}
            </span>
            {focal.domainLabel ? (
              <span className="text-caption text-[color:var(--color-text-tertiary)]">{focal.domainLabel}</span>
            ) : null}
          </>
        )}
      </div>

      {mode === "create" ? (
        <input
          data-testid="studio-create-name"
          value={focal.name}
          onChange={(e) => props.onCreateName?.(e.target.value)}
          placeholder={props.labels.createNamePlaceholder}
          className="w-full bg-transparent text-large font-semibold leading-[1.08] tracking-[-0.022em] text-[color:var(--color-text-primary)] outline-none placeholder:font-normal placeholder:text-[color:var(--color-text-quaternary)]"
        />
      ) : (
        <div className="text-large font-semibold leading-[1.08] tracking-[-0.022em] text-[color:var(--color-text-primary)]">
          {focal.name}
        </div>
      )}

      {mode === "create" && props.createDomains && props.createDomains.length > 0 ? (
        <select
          data-testid="studio-create-domain"
          value={props.createDomainValue ?? ""}
          onChange={(e) => props.onCreateDomain?.(e.target.value || null)}
          className="mt-2.5 w-full rounded-[8px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-label text-[color:var(--color-text-secondary)] outline-none"
        >
          <option value="">{props.labels.createDomainNone}</option>
          {props.createDomains.map((d) => (
            <option key={d.value} value={d.value}>
              {d.title}
            </option>
          ))}
        </select>
      ) : null}

      {mode === "create" ? (
        <textarea
          data-testid="studio-create-definition"
          value={focal.definition}
          onChange={(e) => props.onCreateDefinition?.(e.target.value)}
          placeholder={props.labels.createDefinitionPlaceholder}
          rows={2}
          className="mt-2.5 w-full resize-none bg-transparent text-caption leading-[1.55] text-[color:var(--color-text-tertiary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
        />
      ) : (
        <div className="mt-3 max-w-[322px] text-caption leading-[1.55] text-[color:var(--color-text-tertiary)] line-clamp-3">
          {focal.definition || ""}
        </div>
      )}

      {mode === "create" && props.createSimilarHit ? (
        <div
          data-testid="studio-create-similar"
          className="mt-2 flex items-start gap-2 rounded-[8px] border px-2.5 py-1.5 text-label leading-[1.5] text-[color:var(--color-text-tertiary)]"
          style={{ borderColor: "var(--color-amber-muted-a34)", background: "var(--color-amber-muted-a18)" }}
        >
          <span className="flex-none text-[color:var(--color-amber-muted-a62)]">⚠</span>
          <span className="min-w-0">
            {props.labels.createSimilar(props.createSimilarHit.title, props.kindLabelFor(props.createSimilarHit.kind))}{" "}
            <button
              type="button"
              onClick={() => props.onOpenSimilar?.(props.createSimilarHit!.slug)}
              className="font-semibold text-[color:var(--color-indigo-text-soft)]"
            >
              {props.labels.createSimilarOpen}
            </button>
            {" · "}
            <button
              type="button"
              onClick={() => props.onDismissSimilar?.()}
              className="text-[color:var(--color-text-quaternary)]"
            >
              {props.labels.createSimilarAnyway}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── One lane (satellites / socket / lane head + fold) ────────────────────────
function LaneRender({
  view,
  layout,
  labels,
  kindLabelFor,
  onOpen,
}: {
  view: CompassBearingView;
  layout: LaneLayout;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  onOpen: () => void;
}) {
  return (
    <>
      {/* lane head label for a filled lane */}
      {view.filled ? (
        <div
          className="absolute z-[3] flex items-center gap-1.5 whitespace-nowrap text-label tracking-[0.01em] text-[color:var(--color-text-tertiary)]"
          style={laneHeadPos(view, layout)}
        >
          <span className="h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo)]" />
          {view.laneLabel}
        </div>
      ) : null}

      {/* satellites */}
      {layout.sats.map(({ sat, x, y }) => (
        <div
          key={sat.id}
          data-testid={`studio-satellite-${view.bearing}`}
          className="absolute z-[2] flex items-center gap-2.5 rounded-[10px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3"
          style={{ left: x, top: y, width: SAT.w, height: SAT.h }}
        >
          <KindGlyph kind={sat.kind} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body font-medium text-[color:var(--color-text-primary)]">{sat.title}</span>
            <span className="truncate text-label text-[color:var(--color-text-quaternary)]">{kindLabelFor(sat.kind)}</span>
          </span>
        </div>
      ))}

      {/* fold */}
      {layout.fold ? (
        <div
          className="absolute z-[2] flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-soft)] px-3 text-caption text-[color:var(--color-text-tertiary)]"
          style={{ left: layout.fold.x, top: layout.fold.y, width: SAT.w, height: 30 }}
        >
          <span className="font-semibold text-[color:var(--color-text-secondary)]">+{layout.fold.count}</span>
          {labels.foldMore(layout.fold.count)}
          <span className="ml-auto text-[color:var(--color-text-quaternary)]">⌄</span>
        </div>
      ) : null}

      {/* empty socket */}
      {layout.socket ? (
        <button
          type="button"
          data-testid={`studio-socket-${view.bearing}`}
          data-relation={view.relation}
          onClick={onOpen}
          className={cn(
            "absolute z-[2] flex flex-col items-start justify-center gap-1 rounded-[12px] px-4 text-left transition-colors",
          )}
          style={{
            left: layout.socket.x,
            top: layout.socket.y,
            width: layout.socket.w,
            height: layout.socket.h,
            border: view.recommended
              ? "2px dashed var(--color-indigo-a46)"
              : view.expected
                ? "1.5px dashed var(--color-amber-muted-a62)"
                : "1.5px dashed var(--color-border-strong)",
            background: view.recommended
              ? "var(--color-indigo-a12)"
              : view.expected
                ? "var(--color-amber-muted-a18)"
                : "transparent",
          }}
        >
          {view.recommended ? (
            <span className="inline-flex items-center gap-1 rounded-[5px] bg-[color:var(--color-indigo-a16)] px-1.5 py-0.5 text-label font-semibold tracking-[0.02em] text-[color:var(--color-indigo-text-soft)]">
              ◈ {labels.guideBadge}
            </span>
          ) : view.expected ? (
            <span className="inline-flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-amber-signal-a60)]" /> {view.emptyHint}
            </span>
          ) : (
            <span className="text-label text-[color:var(--color-text-quaternary)]">{view.emptyHint}</span>
          )}
          <span className="flex items-center gap-2 text-callout font-medium text-[color:var(--color-text-secondary)]">
            <span className="text-[color:var(--color-text-quaternary)]">＋</span>
            {view.question}
          </span>
        </button>
      ) : null}
    </>
  );
}

function laneHeadPos(view: CompassBearingView, layout: LaneLayout): React.CSSProperties {
  if (view.bearing === "right") return { left: layout.sats[0]?.x ?? 0, top: (layout.sats[0]?.y ?? CY) - 20 };
  if (view.bearing === "left") return { left: layout.sats[0]?.x ?? 0, top: (layout.sats[0]?.y ?? CY) - 20 };
  if (view.bearing === "up") return { left: CX - 60, top: (layout.sats[0]?.y ?? 0) - 20 };
  return { left: CX - 60, top: (layout.sats[layout.sats.length - 1]?.y ?? 0) + SAT.h + 6 };
}

// ── Inline anchored picker (dark canonical) ──────────────────────────────────
function InlinePicker({
  anchor,
  relation,
  question,
  labels,
  rows,
  similarHit,
  kindLabelFor,
  query,
  onQuery,
  onPick,
  onClose,
  onCreateNew,
}: {
  anchor: { x: number; y: number };
  relation: StudioRelation;
  question: string;
  labels: StudioCompassLabels;
  rows: CreateCandidate[];
  similarHit: CreateCandidate | null;
  kindLabelFor: (kind: string) => string;
  query: string;
  onQuery: (q: string) => void;
  onPick: (c: CreateCandidate) => void;
  onClose: () => void;
  onCreateNew?: () => void;
}) {
  const W = 300;
  // Keep the popover inside the board horizontally.
  const left = Math.min(Math.max(anchor.x - W / 2, 8), BOARD.w - W - 8);
  const placeBelow = anchor.y < BOARD.h / 2;
  const top = placeBelow ? anchor.y + 16 : undefined;
  const bottom = placeBelow ? undefined : BOARD.h - anchor.y + 16;
  return (
    <div
      data-testid="studio-picker"
      data-relation={relation}
      className="absolute z-[8] rounded-[13px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
      style={{ left, top, bottom, width: W, boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}
    >
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="text-caption font-semibold text-[color:var(--color-text-secondary)]">{labels.pickerTitle(question)}</span>
        <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.pickerSub}</span>
        <button type="button" onClick={onClose} className="ml-auto text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]">
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
        <Search size={13} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
        <input
          autoFocus
          data-testid="studio-picker-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={labels.pickerPlaceholder}
          className="w-full bg-transparent text-body text-[color:var(--color-text-secondary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
        />
      </div>
      <div className="max-h-[220px] overflow-y-auto p-1.5">
        {rows.length === 0 ? (
          <div className="px-3 py-3 text-center text-label text-[color:var(--color-text-quaternary)]">{labels.pickerEmpty}</div>
        ) : (
          rows.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`studio-picker-row-${c.id}`}
              onClick={() => onPick(c)}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-indigo-a08)]"
            >
              <KindGlyph kind={c.kind} />
              <span className="truncate text-body text-[color:var(--color-text-primary)]">{c.title}</span>
              <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{labels.pickerKind(kindLabelFor(c.kind))}</span>
            </button>
          ))
        )}
      </div>
      {similarHit ? (
        <div
          data-testid="studio-picker-similar"
          className="mx-2 mb-1.5 flex items-start gap-2 rounded-[9px] border px-2.5 py-2 text-label leading-[1.5] text-[color:var(--color-text-tertiary)]"
          style={{ borderColor: "var(--color-amber-muted-a34)", background: "var(--color-amber-muted-a18)" }}
        >
          <span className="flex-none text-[color:var(--color-amber-muted-a62)]">⚠</span>
          <span className="min-w-0">
            {labels.similarSuggest(similarHit.title)}{" "}
            <button
              type="button"
              data-testid="studio-picker-similar-accept"
              onClick={() => onPick(similarHit)}
              className="font-semibold text-[color:var(--color-indigo-text-soft)]"
            >
              {labels.similarAccept}
            </button>
          </span>
        </div>
      ) : null}
      <div className="border-t border-[color:var(--color-divider)] p-2">
        <button
          type="button"
          data-testid="studio-picker-create-new"
          onClick={onCreateNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--color-border-strong)] py-2 text-caption text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <Plus size={13} aria-hidden className="text-[color:var(--color-text-tertiary)]" />
          {labels.pickerCreateNew}
        </button>
      </div>
    </div>
  );
}

// ── Mini compass rose (flow cue) — the four bearings at a glance ──────────────
function MiniRose({ bearings }: { bearings: CompassBearingView[] }) {
  const by = (b: StudioBearing) => bearings.find((v) => v.bearing === b);
  const pip = (b: StudioBearing, cx: number, cy: number) => {
    const v = by(b);
    if (v?.filled) return <circle cx={cx} cy={cy} r={2.6} fill="var(--color-indigo)" />;
    if (v?.recommended)
      return (
        <>
          <circle cx={cx} cy={cy} r={2.6} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={1} fill="var(--color-indigo)" />
        </>
      );
    if (v?.expected) return <circle cx={cx} cy={cy} r={2.6} fill="none" stroke="var(--color-amber-muted-a62)" strokeWidth={1.5} />;
    return <circle cx={cx} cy={cy} r={2.6} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />;
  };
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className="flex-none" aria-hidden>
      <circle cx={20} cy={20} r={15} fill="none" stroke="var(--color-border-soft)" strokeWidth={1} strokeDasharray="1 3.6" />
      {pip("up", 20, 5)}
      {pip("right", 35, 20)}
      {pip("down", 20, 35)}
      {pip("left", 5, 20)}
    </svg>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, Zap } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { TopologyMapV2 } from "@/widgets/topology-map-v2";
import type { StudioMapGraph } from "../lib/build-studio-map";
import type { StudioGem, StudioGemKind, StudioItem } from "../lib/build-studio-item";

/**
 * Presentational "강화(enhancement) screen" for one ontology node. The central
 * visual is the app's OWN topology renderer (`TopologyMapV2`) focused on the
 * node's ego world — same amber hexagon hub, comet-dot dashed edges, and clean
 * node tiles as `/topology` — NOT a hand-drawn hexagon skin. The enhancement
 * framing (level, ability stats, enhancement sockets, actions) is restrained
 * chrome around that map, painted from the app's normal `--color-*` tokens; the
 * `--studio-*` game palette survives only as small level/socket accents.
 *
 * NO next-intl / navigation deps: every string is a resolved `label`, so this
 * renders in isolation and is unit-testable (see `StudioArena.test.tsx`). The
 * data hook + label resolution live in `OntologyStudioPage`.
 */

export interface StudioArenaLabels {
  mode: string;
  close: string;
  statsTitle: string;
  socketsTitle: string;
  /** axis id → localized stat name. */
  axis: Record<StudioGemKind | "definition" | "evidence", string>;
  statConfirmed: string;
  statMissing: string;
  /** e.g. "강화 Lv.{from} → Lv.{to}". */
  level: (from: number, to: number) => string;
  levelMax: (level: number) => string;
  /** Leading word of the gauge note (e.g. "강화도"). */
  gaugeLead: string;
  /** Trailing clause of the gauge note (e.g. "· 상위 개념을 넣으면"). */
  gaugeTrail: string;
  /** Fully-enhanced note (e.g. "강화도 100% · 모든 축 완성"). */
  gaugeMax: (percent: number) => string;
  isaTag: string;
  /** e.g. `"{title}은(는) 무엇의 한 종류인가?"`. */
  isaPrompt: (title: string) => string;
  relationMeta: (count: number) => string;
  relatesPick: string;
  relatesEmptyHint: string;
  add: string;
  readOnlyNote: string;
  enhance: string;
  enhanceSub: string;
  agent: string;
  /** Screen-reader label for the embedded map canvas (i18n). */
  mapAria: string;
}

const GEM_CLASS: Record<StudioGemKind, string> = {
  dependsOn: "studio-gem--dep",
  contains: "studio-gem--con",
  relates: "studio-gem--rel",
  isA: "studio-gem--isa",
};

/** Stat-rail markers share the relation cuts; definition/evidence stay a dot. */
const STATMARK_SHAPE: Record<string, string> = {
  contains: "studio-statmark--con",
  dependsOn: "studio-statmark--dep",
  relates: "studio-statmark--rel",
  isA: "studio-statmark--isa",
};

const capText = "text-caption uppercase tracking-[0.14em] font-bold";

export interface StudioArenaProps {
  item: StudioItem;
  /** Ego subgraph for the focal node, adapted to the real map renderer. */
  map: StudioMapGraph;
  labels: StudioArenaLabels;
  /** Fired by 강화하기 / 넣기 / 에이전트 — Slice 1 shows a "next slice" notice. */
  onDeferredAction: () => void;
  /** Slice 2 — enter CREATE (만들기) mode. Omitted → the entry is not rendered. */
  onCreate?: () => void;
  createLabel?: string;
}

export function StudioArena({
  item,
  map,
  labels,
  onDeferredAction,
  onCreate,
  createLabel,
}: StudioArenaProps) {
  const { node, stats, score, projectedScore } = item;
  const maxed = score.level >= score.pips.length;
  const gain = projectedScore.percent - score.percent;

  // Enter the focal node's "realm" (영역) one tick after mount so the map frames
  // THIS node's world — the warded, centered ego view the arena is about —
  // instead of the wide global overview. The realm reducer fits to the realm
  // content bbox and draws the warding ring; deferring by a frame lets the
  // world initialize first so the entering transition has real bounds to tween.
  const [realmRoot, setRealmRoot] = useState<string | null>(null);
  useEffect(() => {
    // rAF (not a synchronous set) so the map mounts at overview, then enters the
    // realm on the next frame once the world has real bounds to tween into.
    const id = requestAnimationFrame(() => setRealmRoot(node.id));
    return () => cancelAnimationFrame(id);
  }, [node.id]);

  const statValue = (key: string): { value: string; done: boolean; delta?: string } => {
    switch (key) {
      case "definition":
        return { value: stats.hasDefinition ? labels.statConfirmed : labels.statMissing, done: stats.hasDefinition };
      case "evidence":
        return { value: String(stats.evidenceCount), done: stats.evidenceCount > 0 };
      case "contains":
        return { value: String(stats.containsCount), done: stats.containsCount > 0 };
      case "dependsOn":
        return { value: String(stats.dependsOnCount), done: stats.dependsOnCount > 0 };
      case "relates":
        return { value: String(stats.relatesCount), done: stats.relatesCount > 0 };
      case "isA":
        return { value: "0", done: false, delta: gain > 0 ? `+${gain}%` : undefined };
      default:
        return { value: "0", done: false };
    }
  };

  const filledGems = item.gems.filter((g) => g.kind !== "isA");

  return (
    <div
      className="studio-stage relative grid h-[100dvh] min-h-0 grid-rows-[54px_1fr_82px] overflow-hidden bg-[color:var(--color-canvas)]"
      data-testid="studio-stage"
    >
      {/* Header — breadcrumb + mode badge + close. */}
      <header className="relative z-[5] flex items-center gap-4 border-b border-[color:var(--color-divider)] px-[22px]">
        <div className="flex items-center gap-2.5 text-label text-[color:var(--color-text-tertiary)]">
          {node.domainLabel ? (
            <>
              <span>{node.domainLabel}</span>
              <span className="h-[3px] w-[3px] rounded-full bg-[color:var(--color-text-quaternary)]" />
            </>
          ) : null}
          <span className="font-semibold text-[color:var(--color-text-secondary)]">{node.label}</span>
          <span
            className={cn(
              capText,
              "ml-1 rounded-md border px-2 py-1 text-[color:var(--studio-gold-bright)]",
            )}
            style={{
              background: "var(--studio-gold-a20)",
              borderColor: "var(--studio-gold-a45)",
            }}
          >
            {labels.mode}
          </span>
        </div>
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            data-testid="studio-create-entry"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a10)] px-2.5 py-1.5 text-label font-semibold text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a16)]"
          >
            <Plus size={13} aria-hidden />
            {createLabel}
          </button>
        ) : null}
        <span
          data-testid="studio-close"
          className={cn(
            "rounded-lg border border-[color:var(--color-border-soft)] px-2.5 py-1.5 text-label text-[color:var(--color-text-quaternary)]",
            !onCreate && "ml-auto",
          )}
        >
          {labels.close}
        </span>
      </header>

      {/* Arena — stats · MAP · sockets. */}
      <div className="relative z-[3] grid min-h-0 items-stretch gap-0 max-lg:grid-cols-1 lg:grid-cols-[300px_1fr_300px]">
        {/* Left — 능력치 (stats). */}
        <aside className="flex flex-col justify-center gap-3.5 pl-[26px] pr-2 max-lg:hidden">
          <PanelHeader title={labels.statsTitle} />
          {score.axes.map((axis) => {
            const sv = statValue(axis.key);
            return (
              <div
                key={axis.key}
                className={cn(
                  "relative flex items-center gap-3 overflow-hidden rounded-[11px] border px-3 py-2.5",
                  "border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]",
                )}
              >
                <span
                  className={cn("studio-statmark", STATMARK_SHAPE[axis.key], sv.done && "is-done")}
                />
                <span className="text-body text-[color:var(--color-text-secondary)]">{labels.axis[axis.key]}</span>
                <span className="ml-auto text-body-lg font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                  {sv.value}
                </span>
                {sv.delta ? (
                  <span
                    className="text-label font-bold tabular-nums"
                    style={{ color: "var(--studio-emerald)" }}
                  >
                    {sv.delta}
                  </span>
                ) : null}
              </div>
            );
          })}
        </aside>

        {/* Center — the node's real map (ego world) framed by level + gauge. */}
        <div className="flex min-h-0 flex-col px-4 py-3 max-lg:px-2">
          {/* Level + progress pips — restrained gold accent, no glow. */}
          <div className="mb-2.5 flex items-center justify-center gap-3">
            <span className="text-label font-extrabold uppercase tracking-[0.14em] text-[color:var(--studio-gold-bright)]">
              {maxed ? labels.levelMax(score.level) : labels.level(score.level, score.nextLevel)}
            </span>
            <div className="flex gap-1.5">
              {score.pips.map((pip, i) => (
                <span
                  key={i}
                  className={cn(
                    "studio-pip",
                    pip === "on" && "studio-pip--on",
                    pip === "next" && "studio-pip--next studio-anim-pip",
                  )}
                />
              ))}
            </div>
          </div>

          {/* The embedded real map — this IS the central visual. */}
          <div
            className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]"
            data-testid="studio-map"
          >
            <TopologyMapV2
              nodes={map.nodes}
              edges={map.edges}
              focus={{ selectedSlug: null }}
              realmRootId={realmRoot}
              livePhysics={false}
              fitViewToken={0}
              relayoutToken={0}
              minimal
              canvasLabel={labels.mapAria}
            />
          </div>

          {/* Gauge note — app-native surface, restrained gold projected value. */}
          <div
            className="mx-auto mt-2.5 flex items-center gap-2.5 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-1.5 text-label text-[color:var(--color-text-secondary)]"
            data-testid="studio-gauge-note"
          >
            {maxed ? (
              <span className="font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                {labels.gaugeMax(score.percent)}
              </span>
            ) : (
              <>
                <span>{labels.gaugeLead}</span>
                <span className="font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                  {score.percent}%
                </span>
                <span className="text-[color:var(--color-text-quaternary)]">→</span>
                <span className="font-semibold tabular-nums text-[color:var(--studio-gold-bright)]">
                  {projectedScore.percent}%
                </span>
                <span className="text-[color:var(--color-text-tertiary)]">{labels.gaugeTrail}</span>
              </>
            )}
          </div>
        </div>

        {/* Right — 강화 슬롯 (sockets). */}
        <aside className="flex flex-col justify-center gap-3 pl-2 pr-[26px] max-lg:hidden">
          <PanelHeader title={labels.socketsTitle} gold />
          {/* is_a — always-empty gold socket (the new axis). */}
          <button
            type="button"
            onClick={onDeferredAction}
            data-testid="studio-socket-isA"
            className="flex items-center gap-3 overflow-hidden rounded-[13px] border border-dashed p-3 text-left"
            style={{ borderColor: "var(--studio-gold-a45)", background: "var(--studio-gold-a20)" }}
          >
            <span className="studio-gem studio-gem--isa studio-anim-isa-pulse h-10 w-9 flex-none text-[13px]">↑</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-body font-semibold text-[color:var(--color-text-primary)]">
                {labels.axis.isA}
                <span
                  className="rounded font-extrabold"
                  style={{
                    fontSize: "8.5px",
                    letterSpacing: "0.05em",
                    color: "var(--studio-gold-bright)",
                    background: "var(--studio-gold-a20)",
                    padding: "1px 5px",
                  }}
                >
                  {labels.isaTag}
                </span>
              </span>
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {labels.isaPrompt(node.label)}
              </span>
            </span>
            <span className="flex-none text-label font-semibold" style={{ color: "var(--studio-gold-bright)" }}>
              {labels.add}
            </span>
          </button>

          {filledGems.map((gem) =>
            gem.filled ? (
              <FilledSocket key={gem.kind} gem={gem} labels={labels} />
            ) : (
              <EmptySocket key={gem.kind} gem={gem} labels={labels} onClick={onDeferredAction} />
            ),
          )}
        </aside>
      </div>

      {/* Footer — ledger + actions. */}
      <footer className="relative z-[5] flex items-center gap-4 border-t border-[color:var(--color-divider)] px-[22px]">
        <div className="flex items-center gap-2.5 text-label text-[color:var(--color-text-tertiary)]">
          <span className="text-body-lg font-bold tabular-nums text-[color:var(--color-text-primary)]">
            {score.percent}%
          </span>
          <span>{labels.readOnlyNote}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onDeferredAction}
            data-testid="studio-agent"
            className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-strong)] px-4 py-2.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <Bot size={15} aria-hidden />
            {labels.agent}
          </button>
          <button
            type="button"
            onClick={onDeferredAction}
            data-testid="studio-enhance"
            className="inline-flex items-center gap-2.5 rounded-[12px] bg-[color:var(--color-indigo-brand)] px-[30px] py-3 text-body-lg font-extrabold tracking-[0.02em] text-white transition-colors hover:bg-[color:var(--color-indigo-hover)]"
          >
            <Zap size={18} aria-hidden />
            {labels.enhance}
            <span className="text-caption font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
              {labels.enhanceSub}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}

function PanelHeader({ title, gold }: { title: string; gold?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid h-[22px] w-[22px] place-items-center rounded-md text-[12px]"
        style={
          gold
            ? { background: "var(--studio-gold-a20)", color: "var(--studio-gold-bright)" }
            : { background: "var(--color-indigo-a20)", color: "var(--color-indigo-accent)" }
        }
      >
        {gold ? "◆" : "▤"}
      </span>
      <span className="text-label font-bold uppercase tracking-[0.06em] text-[color:var(--color-text-secondary)]">
        {title}
      </span>
    </div>
  );
}

function FilledSocket({ gem, labels }: { gem: StudioGem; labels: StudioArenaLabels }) {
  return (
    <div
      data-testid={`studio-socket-${gem.kind}`}
      data-filled="true"
      className="flex items-center gap-3 overflow-hidden rounded-[13px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3"
    >
      <span className={cn("studio-gem h-10 w-9 flex-none", GEM_CLASS[gem.kind])} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-body font-semibold text-[color:var(--color-text-primary)]">
          {labels.axis[gem.kind]}
          <span className="text-caption normal-case text-[color:var(--color-text-quaternary)]">
            {labels.relationMeta(gem.count)}
          </span>
        </span>
        <span
          className="mt-0.5 inline-block max-w-full truncate rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] px-1.5 py-0.5 text-caption text-[color:var(--color-text-secondary)]"
          title={gem.neighbors.join(" · ")}
        >
          {gem.neighbors.join(" · ")}
        </span>
      </span>
    </div>
  );
}

function EmptySocket({
  gem,
  labels,
  onClick,
}: {
  gem: StudioGem;
  labels: StudioArenaLabels;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`studio-socket-${gem.kind}`}
      data-filled="false"
      className="flex items-center gap-3 overflow-hidden rounded-[13px] border border-dashed border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a10)] p-3 text-left"
    >
      <span className="studio-gem studio-gem--empty h-10 w-9 flex-none text-[13px]">＋</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-body font-semibold text-[color:var(--color-text-primary)]">
          {labels.axis[gem.kind]}
          <span className="text-caption normal-case text-[color:var(--color-text-quaternary)]">
            {labels.relatesPick}
          </span>
        </span>
        <span className="text-caption text-[color:var(--color-text-quaternary)]">{labels.relatesEmptyHint}</span>
      </span>
      <span className="flex-none text-label font-semibold text-[color:var(--color-indigo-accent)]">{labels.add}</span>
    </button>
  );
}

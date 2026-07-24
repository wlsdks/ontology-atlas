"use client";

import type { CSSProperties } from "react";
import { Bot, Plus, Zap } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { StudioGem, StudioGemKind, StudioItem } from "../lib/build-studio-item";

/**
 * Presentational "강화(enhancement) screen" for one ontology node — the game
 * item stage. NO next-intl / navigation deps: every string is a resolved
 * `label`, so this renders in isolation and is unit-testable (see
 * `StudioArena.test.tsx`). The data hook + label resolution live in
 * `OntologyStudioPage`.
 *
 * SCOPED CHARTER EXCEPTION: the glow/gradient/aura/particle/rarity-color it
 * paints come only from `--studio-*` tokens under `.studio-stage`
 * (app/globals.css). See docs/DESIGN-SYSTEM.md "Ontology Studio — game-energy
 * exception".
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
}

const GEM_CLASS: Record<StudioGemKind, string> = {
  dependsOn: "studio-gem--dep",
  contains: "studio-gem--con",
  relates: "studio-gem--rel",
  isA: "studio-gem--isa",
};

const ORBIT_CLASS: Record<StudioGemKind, string> = {
  dependsOn: "studio-orbit-gem--dep",
  contains: "studio-orbit-gem--con",
  relates: "studio-orbit-gem--rel",
  isA: "studio-orbit-gem--isa",
};

/** Empty socket keeps its relation's CUT (hole variant) so it reads as "the
 *  slot a {kind} gem seats into" — the puzzle fit. */
const HOLE_CLASS: Record<"dependsOn" | "relates", string> = {
  dependsOn: "studio-gem--h-dep",
  relates: "studio-gem--h-rel",
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
  labels: StudioArenaLabels;
  kindLabel: (kind: string) => string;
  /** Fired by 강화하기 / 넣기 / 에이전트 — Slice 1 shows a "next slice" notice. */
  onDeferredAction: () => void;
  /** Static particle positions (avoids `Math.random` in render → SSR-stable). */
  particleSeeds: ReadonlyArray<{ left: number; top: number; dur: number; delay: number; opacity: number }>;
  /** Slice 2 — enter CREATE (만들기) mode. Omitted → the entry is not rendered. */
  onCreate?: () => void;
  createLabel?: string;
}

export function StudioArena({
  item,
  labels,
  kindLabel,
  onDeferredAction,
  particleSeeds,
  onCreate,
  createLabel,
}: StudioArenaProps) {
  const { node, stats, score, projectedScore } = item;
  const maxed = score.level >= score.pips.length;
  const gain = projectedScore.percent - score.percent;

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
  const orbitCount = item.orbits.length;

  return (
    <div
      className="studio-stage relative grid h-[100dvh] min-h-0 grid-rows-[54px_1fr_82px] overflow-hidden"
      data-testid="studio-stage"
    >
      {/* Dramatic background: focal glow, rotating rays, floating particles. */}
      <div className="studio-bg" aria-hidden />
      <div className="studio-rays studio-anim-spin" aria-hidden />
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
        {particleSeeds.map((p, i) => (
          <span
            key={i}
            className="studio-particle studio-anim-rise"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

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
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-label font-semibold transition-colors"
            style={{
              color: "var(--studio-indigo-bright)",
              borderColor: "var(--studio-indigo-a45)",
              background: "var(--studio-indigo-a10)",
            }}
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

      {/* Arena — stats · item · sockets. */}
      <div className="relative z-[3] grid min-h-0 items-center gap-0 max-lg:grid-cols-1 lg:grid-cols-[300px_1fr_300px]">
        {/* Left — 능력치 (stats). */}
        <aside className="flex flex-col gap-3.5 self-center pl-[26px] pr-2 max-lg:hidden">
          <PanelHeader title={labels.statsTitle} />
          {score.axes.map((axis) => {
            const sv = statValue(axis.key);
            return (
              <div
                key={axis.key}
                className={cn(
                  "relative flex items-center gap-3 overflow-hidden rounded-[11px] border px-3 py-2.5",
                  "border-[color:var(--color-border-soft)]",
                )}
                style={{ background: "linear-gradient(100deg,var(--color-overlay-2),var(--color-overlay-1))" }}
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
                    style={{ color: "var(--studio-emerald)", textShadow: "0 0 10px var(--studio-emerald-a20)" }}
                  >
                    {sv.delta}
                  </span>
                ) : null}
              </div>
            );
          })}
        </aside>

        {/* Center — the item. */}
        <div className="flex flex-col items-center justify-self-center self-center">
          <div className="mb-1.5 flex flex-col items-center gap-1.5">
            <span
              className={cn("text-label font-extrabold uppercase tracking-[0.14em]")}
              style={{ color: "var(--studio-gold-bright)", textShadow: "0 0 14px var(--studio-gold-a45)" }}
            >
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

          <div className="studio-anim-bob relative grid h-[300px] w-[280px] place-items-center">
            <div className="studio-aura studio-anim-aura" aria-hidden />
            {/* Orbiting equipped gems + the empty gold is_a orb. */}
            <div className="studio-orbit" aria-hidden>
              {item.orbits.map((orb, i) => {
                const angle = -90 + i * (360 / Math.max(orbitCount, 1));
                return (
                  <span
                    key={i}
                    className={cn("studio-orbit-gem studio-anim-orbit-twinkle", ORBIT_CLASS[orb.kind])}
                    style={
                      {
                        ["--a"]: `${angle}deg`,
                        animationDelay: `${(i * 0.53) % 4.6}s`,
                      } as CSSProperties
                    }
                  />
                );
              })}
            </div>
            <div className="studio-hex studio-anim-hex-sheen" data-testid="studio-hex">
              <div className="relative z-[2] flex flex-col items-center gap-1.5 px-4 text-center">
                <span
                  className="text-caption font-extrabold uppercase tracking-[0.16em]"
                  style={{ color: "var(--studio-gold-bright)", textShadow: "0 0 12px var(--studio-gold-a45)" }}
                >
                  {kindLabel(node.kind)}
                </span>
                <span
                  className="text-title font-bold tracking-[-0.02em] text-white"
                  style={{ textShadow: "0 2px 18px rgba(107,120,230,0.55)" }}
                >
                  {node.label}
                </span>
                {node.domainLabel ? (
                  <span className="text-label text-[color:var(--color-text-tertiary)]">{node.domainLabel}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="mt-4 flex items-center gap-2.5 rounded-full border border-[color:var(--color-border-soft)] px-4 py-1.5 text-label text-[color:var(--color-text-secondary)]"
            style={{ background: "rgba(13,14,21,0.6)" }}
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
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: "var(--studio-gold-bright)", textShadow: "0 0 12px var(--studio-gold-a45)" }}
                >
                  {projectedScore.percent}%
                </span>
                <span className="text-[color:var(--color-text-tertiary)]">{labels.gaugeTrail}</span>
              </>
            )}
          </div>
        </div>

        {/* Right — 강화 슬롯 (sockets). */}
        <aside className="flex flex-col gap-3 self-center pl-2 pr-[26px] max-lg:hidden">
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
            className="studio-enhance studio-anim-sweep inline-flex items-center gap-2.5 rounded-[12px] px-[30px] py-3 text-body-lg font-extrabold tracking-[0.02em] text-white transition-transform hover:-translate-y-px"
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
            : { background: "var(--studio-indigo-a20)", color: "var(--studio-indigo-bright)" }
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
      className="flex items-center gap-3 overflow-hidden rounded-[13px] border border-[color:var(--color-border-soft)] p-3"
      style={{ background: "linear-gradient(100deg,var(--color-overlay-2),var(--color-overlay-1))" }}
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
          className="mt-0.5 inline-block max-w-full truncate rounded-md border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-caption text-[color:var(--color-text-secondary)]"
          style={{ background: "var(--color-overlay-2)" }}
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
      className="flex items-center gap-3 overflow-hidden rounded-[13px] border border-dashed p-3 text-left"
      style={{ borderColor: "var(--studio-indigo-a45)", background: "var(--studio-indigo-a10)" }}
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
      <span className="flex-none text-label font-semibold text-[color:var(--studio-indigo-bright)]">{labels.add}</span>
    </button>
  );
}

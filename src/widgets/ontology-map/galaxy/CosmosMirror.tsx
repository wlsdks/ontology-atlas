"use client";

import { useEffect, useRef, useState } from "react";
import { shouldAnnounceDeadEnd } from "../interaction/keyboard-walk";
import type { CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosPaintRecord } from "./cosmos-types";

export interface CosmosMirrorLabels {
  list: string;
  galaxyRow: (name: string, count: number) => string;
}

const MARK_TRAILING_MS = 120;

function Row({ id, text, selectedId, onSelect }: { id: string; text: string; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <button type="button" tabIndex={-1} aria-pressed={selectedId === id} data-cosmos-id={id} onClick={() => onSelect(id)}>
      {text}
    </button>
  );
}

export function CosmosMirror({
  layout,
  selectedId,
  onSelect,
  labels,
  marks,
  restSignal,
  deadEndSignal,
  walkNotice,
}: {
  layout: CosmosLayout;
  selectedId: string | null;
  onSelect: (id: string) => void;
  labels: CosmosMirrorLabels | null;
  marks: readonly CosmosPaintRecord[];
  restSignal: number;
  deadEndSignal: number;
  walkNotice: string | null;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const marksRef = useRef(marks);
  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || restSignal === 0) return;
    list.dataset.cosmosReady = "false";
    const timer = window.setTimeout(() => {
      const byId = new Map(marksRef.current.map((m) => [m.id, m]));
      for (const row of list.querySelectorAll<HTMLElement>("[data-cosmos-id]")) {
        const m = byId.get(row.dataset.cosmosId ?? "");
        if (!m) continue;
        const value = `${Math.round(m.x)},${Math.round(m.y)},${Math.round(m.r)}`;
        if (row.dataset.mark !== value) row.dataset.mark = value;
      }
      list.dataset.cosmosReady = "true";
    }, MARK_TRAILING_MS);
    return () => window.clearTimeout(timer);
  }, [restSignal, layout]);

  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const lastNoticeAt = useRef<number | null>(null);
  const seenDeadEnd = useRef(deadEndSignal);
  useEffect(() => {
    if (seenDeadEnd.current === deadEndSignal) return;
    seenDeadEnd.current = deadEndSignal;
    if (!walkNotice) return;
    const now = performance.now();
    if (!shouldAnnounceDeadEnd(lastNoticeAt.current, now)) return;
    lastNoticeAt.current = now;
    setNotice({ text: walkNotice, key: deadEndSignal });
  }, [deadEndSignal, walkNotice]);

  const core = layout.core;
  return (
    <div className="sr-only">
      <ul ref={listRef} data-testid="cosmos-galaxy-list" data-cosmos-ready="false" aria-label={labels?.list}>
        {core.id ? (
          <li>
            <Row id={core.id} text={core.label} selectedId={selectedId} onSelect={onSelect} />
          </li>
        ) : null}
        {layout.galaxies.map((g) => (
          <li key={g.id}>
            <Row id={g.id} text={labels ? labels.galaxyRow(g.label, g.members) : `${g.label}, ${g.members}`} selectedId={selectedId} onSelect={onSelect} />
            {g.clusters.length > 0 ? (
              <ul>
                {g.clusters.map((c) => (
                  <li key={c.id}>
                    <Row id={c.id} text={c.label} selectedId={selectedId} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" data-testid="cosmos-walk-notice">
        {notice ? <span key={notice.key}>{notice.text}</span> : null}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * S2.1a — 토폴로지에서 새 온톨로지 노드를 만드는 작은 form (presentational).
 *
 * ontology-first: 그래프 위에서 바로 노드를 만든다(빌더 조립 대신). title +
 * kind + optional domain → `onCreate` 콜백. 실제 vault write(createDoc)는
 * HomePage 글루(S2.1b)가 담당. 라벨 prop 주입 → 순수 컴포넌트, 단위 test 용이.
 *
 * 디자인 헌장 준수: 무채색 + 단일 인디고, glow/scale 없음.
 */

export type CreateNodeKind = "domain" | "capability" | "element";

export interface CreateNodeFormLabels {
  heading: string;
  titlePlaceholder: string;
  kind: string;
  domain: string;
  domainPlaceholder: string;
  create: string;
  cancel: string;
  kindLabels: Record<CreateNodeKind, string>;
}

const KINDS: readonly CreateNodeKind[] = ["domain", "capability", "element"];

export function CreateNodeForm({
  onCreate,
  onCancel,
  labels,
  defaultKind = "capability",
}: {
  onCreate: (input: { title: string; kind: CreateNodeKind; domain?: string }) => void | Promise<void>;
  onCancel?: () => void;
  labels: CreateNodeFormLabels;
  defaultKind?: CreateNodeKind;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreateNodeKind>(defaultKind);
  const [domain, setDomain] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = title.trim().length > 0 && !creating;

  const submit = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await onCreate({
        title: title.trim(),
        kind,
        domain: domain.trim() || undefined,
      });
      setTitle("");
      setDomain("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label={labels.heading}
      data-testid="create-node-form"
      className="rounded-2xl border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.05)] px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
          {labels.heading}
        </p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={labels.cancel}
            data-testid="create-node-cancel"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-col gap-2">
        <input
          type="text"
          value={title}
          autoFocus
          disabled={creating}
          placeholder={labels.titlePlaceholder}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          aria-label={labels.titlePlaceholder}
          data-testid="create-node-title"
          className="h-8 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 text-[12px] text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
        />
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {labels.kind}
            </span>
            <select
              value={kind}
              disabled={creating}
              onChange={(e) => setKind(e.target.value as CreateNodeKind)}
              aria-label={labels.kind}
              data-testid="create-node-kind"
              className="h-8 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 text-[12px] text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {labels.kindLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <input
            type="text"
            value={domain}
            disabled={creating}
            placeholder={labels.domainPlaceholder}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            aria-label={labels.domain}
            data-testid="create-node-domain"
            className="h-8 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 text-[12px] text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canCreate}
          data-testid="create-node-submit"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset disabled:opacity-50"
        >
          <Plus size={12} aria-hidden />
          {labels.create}
        </button>
      </div>
    </section>
  );
}

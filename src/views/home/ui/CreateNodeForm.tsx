"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Select, controlClass } from "@/shared/ui";

/**
 * S2.1a — 토폴로지에서 새 온톨로지 노드를 만드는 작은 form (presentational).
 *
 * ontology-first: 그래프 위에서 바로 노드를 만든다(빌더 조립 대신). title +
 * kind + optional domain → `onCreate` 콜백. 실제 vault write(createDoc)는
 * HomePage 글루(S2.1b)가 담당. 라벨 prop 주입 → 순수 컴포넌트, 단위 test 용이.
 *
 * 디자인 헌장 준수: 무채색 + 단일 인디고, glow/scale 없음.
 */

export type CreateNodeKind = "project" | "domain" | "capability" | "element";

export interface CreateNodeFormLabels {
  headingId?: string;
  heading: string;
  titlePlaceholder: string;
  kind: string;
  /** 도메인 선택 aria 라벨. */
  domain: string;
  /** #8 평문화 — 도메인 피커의 보이는 질문 라벨("어느 묶음(도메인)에 넣을까요? (선택)"). */
  domainQuestion: string;
  /** #8 — "도메인 없음" 옵션 라벨(도메인 미배정). */
  domainNone: string;
  /** #8 — "도메인" 이 뭔지 비개발자용 한 줄 설명. */
  domainHelper: string;
  create: string;
  cancel: string;
  kindLabels: Record<CreateNodeKind, string>;
  /** 어권별 이름 UI — `localeNames` 를 넘길 때만 쓰인다. */
  primaryNamePlaceholder: string;
  secondaryNamePlaceholder: string;
  localeNamesHint: string;
  primaryLocaleRequired: string;
}

// 2026-07-24 온보딩 QA — 시작 체크리스트 1단계("첫 프로젝트 만들기")가
// 만들 수 없는 것을 시키고 있었다. 쓰기 경로(vaultFolderForKind)는 이미
// project 를 지원하므로 선택지에 추가한다. 계층 순서(프로젝트→도메인→
// 역량→요소)로 나열.
const KINDS: readonly CreateNodeKind[] = ["project", "domain", "capability", "element"];

export function CreateNodeForm({
  onCreate,
  onCancel,
  localeNames,
  labels,
  defaultKind = "capability",
  defaultDomain = "",
  domainOptions = [],
}: {
  onCreate: (input: {
    title: string;
    kind: CreateNodeKind;
    domain?: string;
    /** 어권별 표시 이름 — `{ ko, en }` → `display_ko` / `display_en`. */
    localeLabels?: Record<string, string>;
  }) => void | Promise<void>;
  onCancel?: () => void;
  labels: CreateNodeFormLabels;
  defaultKind?: CreateNodeKind;
  /**
   * 미리 고른 도메인 (2026-08-03) — 지도의 도메인 노드에서 「이어서 새로
   * 만들기」로 열면 그 도메인이 이미 골라져 있다. 사람이 방금 누른 노드를
   * 다시 고르게 하는 것은 물어볼 필요 없는 것을 묻는 것이다.
   */
  defaultDomain?: string;
  /**
   * #8 평문화 — 기존 도메인 목록(값 = bare tail-slug, 라벨 = 표시 이름).
   * 자유 입력 slug 대신 이 목록 + "도메인 없음" 에서 고른다(비개발자가
   * slug 를 알 필요 없음). 빈 목록이면 "도메인 없음" 만 노출된다(새 볼트 —
   * 도메인을 먼저 만든 뒤 배정하면 된다).
   */
  domainOptions?: readonly { value: string; label: string }[];
  /**
   * 어권별 이름 입력 계약 (소유자 지시 2026-07-24). 지금 화면 언어가
   * `primaryLocale`, 나머지가 `secondaryLocale`. **자기 화면 언어 칸은
   * 필수** — 다른 언어만 채우고 넘어가면 정작 본인 화면에서 원문 title 이
   * 그대로 보이는 사고가 난다. 생략하면 종전 단일 이름 폼(하위호환).
   */
  localeNames?: {
    primaryLocale: string;
    secondaryLocale: string;
  };
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreateNodeKind>(defaultKind);
  const [domain, setDomain] = useState(defaultDomain);
  const [secondaryName, setSecondaryName] = useState("");
  const [creating, setCreating] = useState(false);

  const primaryEmpty = title.trim().length === 0;
  // "다른 언어만 채운" 상태 — 저장을 막고 이유를 그 자리에서 말한다(모달
  // 대신 인라인: 입력 중 흐름을 끊지 않으면서 규칙을 즉시 학습시킨다).
  const secondaryOnly = Boolean(localeNames) && primaryEmpty && secondaryName.trim().length > 0;
  const canCreate = !primaryEmpty && !creating;

  const submit = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const localeLabels = localeNames
        ? {
            [localeNames.primaryLocale]: title.trim(),
            ...(secondaryName.trim()
              ? { [localeNames.secondaryLocale]: secondaryName.trim() }
              : {}),
          }
        : undefined;
      await onCreate({
        title: title.trim(),
        kind,
        domain: domain.trim() || undefined,
        localeLabels,
      });
      setTitle("");
      setDomain("");
      setSecondaryName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label={labels.heading}
      data-testid="create-node-form"
      data-surface-role="blocking-edit-surface"
      data-elevation-contract="solid-panel-over-dimmed-map"
      data-surface-token="--topology-blocking-composer-surface"
      data-border-token="--topology-blocking-composer-border"
      data-shadow-token="--topology-blocking-composer-shadow"
      className="rounded-card border border-[color:var(--topology-blocking-composer-border)] bg-[color:var(--topology-blocking-composer-surface)] px-5 py-4 shadow-[var(--topology-blocking-composer-shadow)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          id={labels.headingId}
          className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-accent)]"
        >
          {labels.heading}
        </p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={labels.cancel}
            data-testid="create-node-cancel"
            className={controlClass({
              shape: "icon",
              size: "sm",
              tone: "muted",
              className:
                "hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset",
            })}
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-3.5 flex flex-col gap-3.5">
        <input
          type="text"
          value={title}
          autoFocus
          disabled={creating}
          placeholder={localeNames ? labels.primaryNamePlaceholder : labels.titlePlaceholder}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          aria-label={localeNames ? labels.primaryNamePlaceholder : labels.titlePlaceholder}
          data-testid="create-node-title"
          className="h-[var(--control-h-lg)] rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-body text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:outline-none"
        />
        {localeNames ? (
          <>
            {/* 어권별 이름 (소유자 지시 2026-07-24) — 위 칸이 지금 화면
                언어(필수), 이 칸이 다른 언어(선택). 배지로 어느 칸이 어느
                언어인지 한눈에 구분한다. */}
            <input
              type="text"
              value={secondaryName}
              disabled={creating}
              placeholder={labels.secondaryNamePlaceholder}
              onChange={(e) => setSecondaryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              aria-label={labels.secondaryNamePlaceholder}
              data-testid="create-node-title-secondary"
              className="h-[var(--control-h-lg)] rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-body text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:outline-none"
            />
            {secondaryOnly ? (
              <p
                role="alert"
                data-testid="create-node-primary-required"
                className="text-label leading-relaxed text-[color:var(--color-status-warning)]"
              >
                {labels.primaryLocaleRequired}
              </p>
            ) : (
              <p className="text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
                {labels.localeNamesHint}
              </p>
            )}
          </>
        ) : null}
        {/* 종류 — 한 줄 라벨 + 캐노니컬 Select(#4). */}
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {labels.kind}
          </span>
          <Select
            size="lg"
            value={kind}
            disabled={creating}
            onChange={(v) => setKind(v as CreateNodeKind)}
            ariaLabel={labels.kind}
            data-testid="create-node-kind"
            options={KINDS.map((k) => ({ value: k, label: labels.kindLabels[k] }))}
          />
        </label>
        {/* #8 평문화 — 자유 입력 slug 대신 기존 도메인 이름 목록 + "도메인
            없음" 을 캐노니컬 Select 로 고른다. 비개발자가 slug 를 알 필요가
            없고, 값은 저장 시 canonicalizeDomainRef 를 지난다(HomePage 글루). */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {labels.domainQuestion}
          </span>
          <Select
            size="lg"
            value={domain}
            disabled={creating}
            onChange={(v) => setDomain(v)}
            ariaLabel={labels.domain}
            data-testid="create-node-domain"
            options={[
              { value: "", label: labels.domainNone },
              ...domainOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
          <p className="text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
            {labels.domainHelper}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canCreate}
          data-testid="create-node-submit"
          className="inline-flex h-[var(--control-h-lg)] items-center justify-center gap-1.5 rounded-full border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-3 text-body font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] transition-colors hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset disabled:opacity-50"
        >
          <Plus size={13} aria-hidden />
          {labels.create}
        </button>
      </div>
    </section>
  );
}

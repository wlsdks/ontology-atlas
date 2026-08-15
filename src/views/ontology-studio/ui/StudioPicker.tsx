"use client";

/**
 * 앵커드 피커 + 상단 노드 검색 — `StudioCompass.tsx` 분할 2탄 (2026-08-13).
 *
 * 소켓을 누르면 그 바깥쪽에 붙는 후보 피커(`InlinePicker`/`placePicker`)와,
 * 무대에 올릴 노드를 찾는 상단 검색(`NodeSearch`). 보드 기하는
 * `studio-board-geometry`, 종류 글리프는 `StudioKindGlyph` 를 본체와 공유한다.
 * 본체에서 받는 것은 타입뿐이라(type-only) 순환이 아니다.
 */

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { IconButton, controlClass } from "@/shared/ui";
import { fieldClass } from "@/shared/ui/control-class";
import { rankCandidates } from "../lib/match-candidate";
import { cn } from "@/shared/lib/cn";
import type { StudioBearing, StudioRelation } from "../lib/build-studio-item";
import type { CreateCandidate } from "../lib/build-create-node";
import type { PickerDiscovery, PickerSuggestionReason } from "../lib/build-picker-discovery";
import { BOARD, clampY } from "./studio-board-geometry";
import { KindGlyph } from "./StudioKindGlyph";
import type { StudioCompassLabels } from "./StudioCompass";

/**
 * Anchor the picker to the clicked socket on its OUTWARD side so it never covers
 * the center card and always stays inside the board (#6):
 *   up   → right gutter, top-aligned to the socket
 *   down → right gutter, bottom-anchored
 *   left → top-aligned to the left socket (stays left of the card)
 *   right→ top-aligned to the right socket (stays right of the card)
 */
export function placePicker(
  bearing: StudioBearing,
  socket: { x: number; y: number; w: number; h: number },
  cardLeft: number,
  cardRight: number,
): { left: number; top: number; maxHeight: number } {
  const W = 300;
  const GAP = 14;
  const PAD = 8;
  const rightGutter = Math.min(cardRight + GAP, BOARD.w - PAD - W);
  const CAP = 384;
  if (bearing === "up") {
    const top = clampY(socket.y, 160);
    return { left: rightGutter, top, maxHeight: Math.min(CAP, BOARD.h - PAD - top) };
  }
  if (bearing === "down") {
    const maxHeight = Math.min(CAP, BOARD.h - 2 * PAD);
    return { left: rightGutter, top: Math.max(PAD, BOARD.h - PAD - maxHeight), maxHeight };
  }
  // left / right — kept on the socket's side of the card, top-aligned to the
  // socket and clamped into the board.
  //
  // **왜 "소켓 아래로 떨어뜨리기" 를 그만뒀나 (2026-07-29 도그푸딩 실측).**
  // 좌우 소켓은 무대 세로 중앙에 앉는다. 그 아래로만 열면 패널이 쓸 수 있는
  // 높이는 판의 절반뿐이고, 크롬(머리말+검색+새로 만들기)이 126px 를 먼저
  // 가져간 뒤 **목록에 96px 가 남았다 — 여덟 줄 중 2.67줄.** 고르라고 연 표면
  // 에서 고를 것이 화면의 43% 밖에 없고, 바로 위 260px 는 비어 있었다.
  //
  // 소켓을 덮는 것은 새 문법이 아니다 — `up`/`down` 방위는 처음부터 그렇게
  // 열렸다(둘 다 판 전체 높이를 쓴다). 좌우만 다른 규칙을 쓰고 있었고, 그
  // 대가를 목록이 냈다. 덮어도 맥락이 안 끊기는 이유는 패널 머리말이 어느
  // 소켓인지("이 노드가 기대는 것은?")를 다시 말하기 때문이다.
  const maxHeight = Math.min(CAP, BOARD.h - 2 * PAD);
  const top = clampY(socket.y, maxHeight);
  const left =
    bearing === "left"
      ? Math.min(Math.max(socket.x, PAD), Math.max(PAD, cardLeft - GAP - W))
      : Math.max(Math.min(socket.x + socket.w - W, BOARD.w - PAD - W), cardRight + GAP);
  return { left, top, maxHeight };
}

/** Quiet section eyebrow inside the discovery picker (추천 / 둘러보기). */
function PickerSectionHeading({ label }: { label: string }) {
  return (
    <div className="px-2.5 pb-1 pt-1.5 text-label uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
      {label}
    </div>
  );
}

export function InlinePicker({
  exiting,
  socket,
  bearing,
  cardLeft,
  cardRight,
  relation,
  question,
  labels,
  rows,
  similarHit,
  discoveryFor,
  kindLabelFor,
  query,
  onQuery,
  onPick,
  onClose,
  onCreateNew,
  canCreateNew,
}: {
  /** 퇴장 창(140ms) 동안 `true` — 되접히며 나가고, 그 사이 조작을 받지 않는다. */
  exiting: boolean;
  socket: { x: number; y: number; w: number; h: number };
  bearing: StudioBearing;
  cardLeft: number;
  cardRight: number;
  relation: StudioRelation;
  question: string;
  labels: StudioCompassLabels;
  rows: CreateCandidate[];
  similarHit: CreateCandidate | null;
  discoveryFor?: (relation: StudioRelation) => PickerDiscovery;
  kindLabelFor: (kind: string) => string;
  query: string;
  onQuery: (q: string) => void;
  onPick: (c: CreateCandidate) => void;
  onClose: () => void;
  onCreateNew?: (ctx?: { relation: StudioRelation; query: string }) => void;
  canCreateNew: boolean;
}) {
  const W = 300;
  const { left, top, maxHeight } = placePicker(bearing, socket, cardLeft, cardRight);
  // Reserve chrome (header + search + create footer) so the list scrolls within.
  // 실측값이다 — 머리말 41 + 검색 47 + 「새로 만들기」 38 = 126. 초안의 156 은
  // 어림값이라 패널이 허용 높이보다 30px 짧게 열렸고, 그 30px 를 목록이 냈다.
  const PICKER_CHROME = 126;
  const listMax = Math.max(96, maxHeight - PICKER_CHROME);

  // ── Slice 3 — discovery (추천 + 둘러보기) while the search box is empty ──
  // Computed once per socket-open (this component is keyed by relation, so it
  // remounts on socket switch) and dropped the moment the user starts typing.
  const emptyQuery = query.trim() === "";
  const discovery = useMemo(
    () => (emptyQuery && discoveryFor ? discoveryFor(relation) : null),
    [emptyQuery, discoveryFor, relation],
  );
  // Which domain the 둘러보기 drill-down is inside (null = top-level domain list).
  const [browseKey, setBrowseKey] = useState<string | null>(null);
  // 묶음이 하나뿐이면 접힌 층을 건너뛴다 — 후보 1개가 「도메인 없음 (1)」 뒤에
  // 숨어 한 번 더 눌러야 보였다(2026-08-13 flow 실측, 2노드 볼트). 자동 진입일
  // 때는 되돌아갈 목록도 없으므로 뒤로 줄도 그리지 않는다.
  const soleDomainKey =
    discovery && discovery.domains.length === 1 ? discovery.domains[0].key : null;
  const effectiveBrowseKey = browseKey ?? soleDomainKey;
  const reasonLabel = (reason: PickerSuggestionReason): string =>
    reason === "sameDomain"
      ? labels.reasonSameDomain
      : reason === "titleSimilar"
        ? labels.reasonTitleSimilar
        : labels.reasonAdjacent;
  // #2 origin-scale — the picker grows from the socket it anchors to. It always
  // sits just below the socket, so the transform-origin is the top edge at the
  // socket's horizontal center (clamped inside the picker box).
  const originX = Math.max(0, Math.min(W, socket.x + socket.w / 2 - left));
  // 패널이 판 안으로 클램프되면 소켓보다 위에서 시작할 수 있다. 그때 성장
  // 원점을 패널 꼭대기(0)에 두면 **누른 곳이 아닌 데서** 열려서 인과가
  // 끊긴다 — 원점도 소켓을 따라간다.
  const originY = Math.max(0, Math.min(maxHeight, socket.y + socket.h / 2 - top));
  return (
    <div
      data-testid="studio-picker"
      data-relation={relation}
      /*
       * 나가는 동안은 **조작을 받지 않는다.** 클릭이 통과하지 않으면 뒤에서
       * 착지하는 소켓을 140ms 동안 가로막고, 초점이 남아 있으면 화면에서 사라진
       * 상자 안으로 Tab 이 들어간다.
       */
      inert={exiting || undefined}
      data-exiting={exiting ? "true" : undefined}
      className={cn(
        "absolute z-[8] flex flex-col rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]",
        exiting ? "studio-anchored-out pointer-events-none" : "studio-anchored-in",
      )}
      style={
        {
          left,
          top,
          width: W,
          maxHeight,
          boxShadow: "var(--shadow-elevation-2)",
          "--studio-anchor-origin": `${originX}px ${originY}px`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{labels.pickerTitle(question)}</span>
        <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.pickerSub}</span>
        <IconButton
          size="sm"
          tone="muted"
          label={labels.close}
          onClick={onClose}
          className="ml-auto hover:text-[color:var(--color-text-secondary)]"
        >
          <X size={ICON_SIZE.md} aria-hidden />
        </IconButton>
      </div>
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
        <Search size={ICON_SIZE.md} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
        <input
          autoFocus
          data-testid="studio-picker-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={labels.pickerPlaceholder}
          className={fieldClass({ frame: "bare", className: "w-full" })}
        />
      </div>
      <div className="overflow-y-auto p-1.5" style={{ maxHeight: listMax }} data-testid="studio-picker-body">
        {discovery ? (
          discovery.suggestions.length === 0 && discovery.domains.length === 0 ? (
            // #66 — 아직 검색하지 않았는데 "맞는 노드가 없어요" 는 거짓말이다.
            // 검색 전 빈 상태는 다음 행동(새로 만들기)을 알려준다.
            // 흐름 점검 2026-07-26 — 이 상태의 실제 조건은 "볼트가 비었다" 가
            // 아니라 "이 소켓의 후보 풀이 비었다" 다(초점 자신·이미 이어진
            // 이웃·이 방위가 허용하지 않는 kind 를 뺀 나머지가 0). 5노드
            // 볼트에서도 뜨는데 문구가 볼트 전체를 부정하면 오해가 된다.
            <div
              data-testid="studio-picker-browse-empty"
              className="px-3 py-3 text-center text-label leading-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
            >
              {labels.pickerBrowseEmpty}
            </div>
          ) : (
            <>
              {/* 추천 — up to 5 likely candidates, each with a muted reason. */}
              {discovery.suggestions.length > 0 ? (
                <div data-testid="studio-picker-suggest" className="mb-1">
                  <PickerSectionHeading label={labels.suggestHeading} />
                  {discovery.suggestions.map((s) => (
                    <button
                      key={s.candidate.id}
                      type="button"
                      data-testid={`studio-suggest-row-${s.candidate.id}`}
                      onClick={() => onPick(s.candidate)}
                      className={controlClass({
                        shape: "row",
                        className:
                          "hover:bg-[color:var(--color-indigo-a08)]",
                      })}
                    >
                      <KindGlyph kind={s.candidate.kind} />
                      <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)]">{s.candidate.title}</span>
                      <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{reasonLabel(s.reason)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 둘러보기 — domain drill-down (default = domain list). */}
              <div data-testid="studio-picker-browse">
                <PickerSectionHeading label={labels.browseHeading} />
                {effectiveBrowseKey === null ? (
                  discovery.domains.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      data-testid={`studio-browse-domain-${d.key}`}
                      onClick={() => setBrowseKey(d.key)}
                      className={controlClass({
                        shape: "row",
                        className:
                          "hover:bg-[color:var(--color-indigo-a08)]",
                      })}
                    >
                      <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                        {d.title ?? labels.browseNoDomain}
                      </span>
                      <span className="ml-auto flex-none rounded-chip border border-[color:var(--color-border-soft)] px-1.5 py-px text-label text-[color:var(--color-text-quaternary)]">
                        {d.count}
                      </span>
                      <ChevronDown size={ICON_SIZE.md} aria-hidden className="-rotate-90 flex-none text-[color:var(--color-text-quaternary)]" />
                    </button>
                  ))
                ) : (
                  <>
                    {soleDomainKey === null ? (
                    <button
                      type="button"
                      data-testid="studio-browse-back"
                      onClick={() => setBrowseKey(null)}
                      className={controlClass({
                        shape: "row",
                        size: "sm",
                      })}
                    >
                      {labels.browseBack}
                    </button>
                    ) : null}
                    {(discovery.nodesByDomain[effectiveBrowseKey] ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        data-testid={`studio-browse-node-${c.id}`}
                        onClick={() => onPick(c)}
                        className={controlClass({
                        shape: "row",
                        className:
                          "hover:bg-[color:var(--color-indigo-a08)]",
                      })}
                      >
                        <KindGlyph kind={c.kind} />
                        <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)]">{c.title}</span>
                        <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{labels.pickerKind(kindLabelFor(c.kind))}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )
        ) : rows.length === 0 ? (
          <div className="px-3 py-3 text-center text-label text-[color:var(--color-text-quaternary)]">{labels.pickerEmpty}</div>
        ) : (
          rows.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`studio-picker-row-${c.id}`}
              onClick={() => onPick(c)}
              className={controlClass({
                        shape: "row",
                        className:
                          "hover:bg-[color:var(--color-indigo-a08)]",
                      })}
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
          className="mx-2 mb-1.5 flex items-start gap-2 rounded-card border px-2.5 py-2 text-label leading-label text-[color:var(--color-text-tertiary)]"
          style={{ borderColor: "var(--color-amber-muted-a34)", background: "var(--color-amber-muted-a18)" }}
        >
          <span className="flex-none text-[color:var(--color-amber-muted-a62)]">⚠</span>
          <span className="min-w-0">
            {labels.similarSuggest(similarHit.title)}{" "}
            <button
              type="button"
              data-testid="studio-picker-similar-accept"
              onClick={() => onPick(similarHit)}
              // 문장 속 컨트롤 — `link` 의 `min-h-11` 이 힌트 줄을 44px 로 밀어 올린다.
              className={controlClass({ shape: "link", tone: "accentOnTint", className: "rounded-chip font-[var(--font-weight-emphasis)]" })}
            >
              {labels.similarAccept}
            </button>
          </span>
        </div>
      ) : null}
      {canCreateNew ? <div className="border-t border-[color:var(--color-divider)] p-2">
        <button
          type="button"
          data-testid="studio-picker-create-new"
          onClick={() => onCreateNew?.({ relation, query })}
          className={controlClass({ shape: "card", tone: "secondary", className: "w-full justify-center gap-1.5 border-dashed border-[color:var(--color-border-strong)] py-2 text-caption hover:text-[color:var(--color-text-primary)]" })}
        >
          <Plus size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-text-tertiary)]" />
          {labels.pickerCreateNew}
        </button>
      </div> : null}
    </div>
  );
}

// ── Top-bar node search — type → filtered vault nodes → load onto the stage ───
export function NodeSearch({
  placeholder,
  nodes,
  kindLabelFor,
  pickerKind,
  emptyLabel,
  currentName,
  onOpenNode,
}: {
  placeholder: string;
  nodes?: CreateCandidate[];
  kindLabelFor: (kind: string) => string;
  pickerKind: (kindLabel: string) => string;
  emptyLabel: string;
  currentName: string;
  onOpenNode?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Static placeholder when the surface renders in isolation (no data / handler).
  if (!nodes || !onOpenNode) {
    return (
      <div className="flex h-8 w-[300px] items-center gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body text-[color:var(--color-text-quaternary)]">
        <Search size={ICON_SIZE.md} aria-hidden className="flex-none" />
        <span className="truncate">{placeholder}</span>
      </div>
    );
  }


  // #66 — 표시 이름 · canonical title · ref 를 함께 보고(정규화 포함),
  // 정확 일치 > 접두 > 부분 > ref 순으로 올린다 — 순위 없이 앞 8개만 자르면
  // 정확 일치가 컷에 잘릴 수 있다(2026-08-13 실측: 「주문」이 6위).
  const rows = rankCandidates(
    nodes.filter((n) => n.title !== currentName),
    query,
    8,
  );

  const pick = (id: string) => {
    onOpenNode(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      ref={boxRef}
      className="relative w-[300px]"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="flex h-8 items-center gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body focus-within:border-[color:var(--color-indigo-a46)]">
        <Search size={ICON_SIZE.md} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
        <input
          data-testid="studio-node-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Enter" && rows[0]) pick(rows[0].id);
          }}
          placeholder={placeholder}
          className={fieldClass({ frame: "bare", className: "w-full" })}
        />
      </div>
      {open ? (
        <div
          data-testid="studio-node-search-results"
          className="absolute left-0 top-[calc(100%+6px)] z-[9] w-[340px] overflow-hidden rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
          style={{ boxShadow: "var(--shadow-elevation-2)" }}
        >
          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <div className="px-3 py-3 text-center text-label text-[color:var(--color-text-quaternary)]">{emptyLabel}</div>
            ) : (
              rows.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  data-testid={`studio-node-search-row-${n.id}`}
                  onClick={() => pick(n.id)}
                  className={controlClass({
                        shape: "row",
                        className:
                          "hover:bg-[color:var(--color-indigo-a08)]",
                      })}
                >
                  <KindGlyph kind={n.kind} />
                  <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)] [word-break:keep-all]">{n.title}</span>
                  <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{pickerKind(kindLabelFor(n.kind))}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

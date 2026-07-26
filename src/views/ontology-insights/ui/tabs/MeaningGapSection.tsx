"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { MtimeConflictBadge } from "@/shared/ui/mtime-conflict-badge";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { MeaningGapKind } from "@/entities/knowledge-graph";
import type { DomainChoice, MeaningGapRow } from "../../lib/meaning-gap-rows";
import {
  HandoffCopyButton,
  RowActionMenu,
  type QueueRowAbilities,
  type QueueRowActionLabels,
} from "../parts/QueueRowActions";

/**
 * **한 문장으로 끝나는 할 일을 그 자리에서 끝내는 섹션** (비개발자 쓰기의 첫 칸).
 *
 * 왜 공방 딥링크로 충분하지 않은가: 한 문장 적는 일에 화면 전환이 끼면 완결률이
 * 죽는다. 공방은 관계 조립(여러 소켓)의 표면으로 남고, 여기는 **한 필드 쓰기
 * 전용**이다 — 새 라우트 0 · 새 모달 0 · 기존 행의 disclosure 확장.
 *
 * 지키는 계약:
 * - **바꿀 파일을 먼저 밝힌다.** 저장 버튼 위에 고칠 `.md` 경로와 어느 키에
 *   무엇이 적히는지가 문장으로 있다(#688 동의 문법의 축약형 — 변경이 1파일·1필드
 *   로 좁으므로 전면 다이얼로그는 과잉이다).
 * - **취소하면 0개 변경.** 취소·Esc 는 파일을 만지지 않는다. 적은 내용이 있으면
 *   한 번 더 눌러야 닫히므로(2단), 실수로 사라지지 않는다.
 * - **동시수정은 조용히 덮지 않는다.** 저장은 `expected_mtime` 을 들고 가고,
 *   그 사이 사람이나 에이전트가 같은 파일을 고쳤으면 저장이 거부되며 다시
 *   읽어온다 — 그 다음 저장은 새 기준 위에서 이루어진다.
 * - **누른 프레임에 잠긴다.** 두 번 눌러 두 번 쓰는 경로가 없다.
 * - **모션은 목록 행 펼침 문법 하나만 쓴다**(`.ai-row-disclosure`,
 *   `app/globals.css`) — 아래로만 자라고, 나가는 길이 들어온 길과 같다.
 */

export interface MeaningGapLabels extends QueueRowActionLabels {
  sectionTitle: string;
  hint: string;
  openMap: string;
  /** 인라인 입력 열기/닫기. */
  writeHere: string;
  writeHereClose: string;
  definitionPlaceholder: string;
  domainLegend: string;
  confirmDefinition: (file: string) => string;
  confirmDomain: (file: string, value: string) => string;
  save: string;
  saving: string;
  cancel: string;
  cancelArmed: string;
  saved: string;
  failed: (message: string) => string;
  conflict: string;
  needsText: string;
  needsDomain: string;
  /** 읽기 전용 세션에서 이 섹션 아래에 붙는 한 줄. */
  readOnlyHint: string;
}

type RowPhase =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "saved"; written: string }
  | { kind: "failed"; message: string }
  | { kind: "conflict" };

interface RowUiState {
  value: string;
  /** 취소가 "적은 내용이 사라진다" 를 알린 상태(2단 확정). */
  cancelArmed: boolean;
  phase: RowPhase;
}

const EMPTY_UI: RowUiState = { value: "", cancelArmed: false, phase: { kind: "editing" } };
/** 저장 확인 줄이 화면에 머무는 시간 — 그 뒤 행은 큐에서 빠진다. */
const SAVED_ROW_LINGER_MS = 2200;

export interface MeaningGapSectionProps {
  gapKind: MeaningGapRow["gap"];
  rows: MeaningGapRow[];
  totalCount: number;
  abilities: QueueRowAbilities;
  /** 소속 미정 행에서 고를 후보. 정의 없음 행에서는 쓰이지 않는다. */
  domainChoices?: DomainChoice[];
  mapHref: (nodeId: string) => string;
  sourceHref: (nodeId: string) => string | null;
  builderHref: (nodeId: string) => string;
  /**
   * S7 이음새 — 이 행을 지도의 에이전트에게 넘기는 주소. 데스크톱 앱에만
   * 있는 표면이라 없으면 항목이 나타나지 않는다(열리지 않을 문을 그리지
   * 않는다). `gap` 을 받는 이유: 문장의 **종류**만 나르고 문장 자체는
   * 도착지의 첫 마디 생성기가 짓는다.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind) => string | null;
  /**
   * 실제 쓰기 — 볼트 프론트매터 한 필드. 호출부가 `updateFrontmatter` 로
   * 연결하고 `expectedMtime` 을 함께 넘긴다. 성공하면 resolve, 충돌이면
   * `VaultConflictError` 를 throw 한다.
   */
  onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
  moreCount: (count: number) => string;
  labels: MeaningGapLabels;
}

export function MeaningGapSection({
  gapKind,
  rows,
  totalCount,
  abilities,
  domainChoices = [],
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  onWrite,
  moreCount,
  labels,
}: MeaningGapSectionProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [uiById, setUiById] = useState<ReadonlyMap<string, RowUiState>>(new Map());
  /**
   * 손대고 있는 행의 스냅샷 — 그 행이 큐 데이터에서 빠져도 계속 그린다.
   *
   * 두 가지를 같은 장치로 해결한다: ① 저장 성공 직후 공백이 메워져 행이
   * 데이터에서 사라지는데, 확인 줄은 잠깐 남아야 "저장했는데 아무 일도
   * 없었다" 로 읽히지 않는다 — 시간이 지나 사라지는 것이 곧 "큐에서 빠졌다"
   * 의 얼굴이다. ② 저장 전에 볼트가 다시 읽히거나 남이 같은 파일을 고쳐
   * 행 목록이 흔들려도 **적던 문장은 사라지지 않는다.**
   */
  const [pinnedRows, setPinnedRows] = useState<readonly MeaningGapRow[]>([]);
  const pin = useCallback((row: MeaningGapRow) => {
    setPinnedRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
  }, []);
  // 누른 프레임에 잠근다 — setState 는 다음 렌더까지 반영되지 않으므로
  // 중복 저장 가드는 반드시 동기 저장소여야 한다.
  const savingIdsRef = useRef<Set<string>>(new Set());

  const patchUi = useCallback((id: string, next: Partial<RowUiState>) => {
    setUiById((prev) => {
      const map = new Map(prev);
      map.set(id, { ...(map.get(id) ?? EMPTY_UI), ...next });
      return map;
    });
  }, []);

  const closeRow = useCallback((id: string) => {
    setOpenRowId((current) => (current === id ? null : current));
    setPinnedRows((prev) => prev.filter((row) => row.id !== id));
    setUiById((prev) => {
      if (!prev.has(id)) return prev;
      const map = new Map(prev);
      map.delete(id);
      return map;
    });
  }, []);

  const handleSave = useCallback(
    async (row: MeaningGapRow, value: string) => {
      if (savingIdsRef.current.has(row.id)) return;
      savingIdsRef.current.add(row.id);
      patchUi(row.id, { phase: { kind: "saving" }, cancelArmed: false });
      try {
        await onWrite(row, value);
        savingIdsRef.current.delete(row.id);
        pin(row);
        patchUi(row.id, { phase: { kind: "saved", written: value } });
        window.setTimeout(() => closeRow(row.id), SAVED_ROW_LINGER_MS);
      } catch (error) {
        savingIdsRef.current.delete(row.id);
        if (error instanceof Error && error.name === "VaultConflictError") {
          patchUi(row.id, { phase: { kind: "conflict" } });
          return;
        }
        patchUi(row.id, {
          phase: { kind: "failed", message: error instanceof Error ? error.message : String(error) },
        });
      }
    },
    [closeRow, onWrite, patchUi, pin],
  );

  const liveIds = new Set(rows.map((row) => row.id));
  // 붙잡아 둔 행은 **원래 자리에** 그린다. 뒤에 이어 붙이면 방금 손댄 행이
  // 형제 아래로 내려앉아, 내가 누른 행이 어디로 갔는지 눈으로 다시 찾아야
  // 한다(치수 규칙성). `buildMeaningGapRows` 와 같은 이름순으로 다시 세우면
  // 자리가 그대로 복원된다.
  const visibleRows = [...rows, ...pinnedRows.filter((row) => !liveIds.has(row.id))].sort(
    (a, b) => a.title.localeCompare(b.title),
  );
  if (visibleRows.length === 0) return null;
  const hiddenCount = Math.max(0, totalCount - rows.length);

  return (
    <section
      aria-label={labels.sectionTitle}
      data-testid={`do-next-${gapKind}`}
      className="flex flex-col"
    >
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-divider)] pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-body font-medium text-[color:var(--color-text-primary)]">
            {labels.sectionTitle}
          </span>
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {totalCount}
          </span>
        </div>
        <p className="text-label leading-snug text-[color:var(--color-text-quaternary)]">
          {labels.hint}
        </p>
      </div>
      {visibleRows.map((row) => (
        <MeaningGapRowView
          key={row.id}
          row={row}
          gapKind={gapKind}
          open={openRowId === row.id}
          ui={uiById.get(row.id) ?? EMPTY_UI}
          abilities={abilities}
          domainChoices={domainChoices}
          mapHref={mapHref}
          sourceHref={sourceHref}
          builderHref={builderHref}
          askAgentHref={askAgentHref}
          onOpen={() => {
            // 펼치는 순간 붙잡는다 — 그 뒤 볼트가 다시 읽혀도 적던 칸이
            // 화면에서 없어지지 않는다.
            pin(row);
            setOpenRowId(row.id);
          }}
          onClose={() => closeRow(row.id)}
          onPatch={(next) => patchUi(row.id, next)}
          onSave={(value) => void handleSave(row, value)}
          labels={labels}
        />
      ))}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-label text-[color:var(--color-text-quaternary)]">
          {moreCount(hiddenCount)}
        </p>
      ) : null}
      {!abilities.canWriteVault ? (
        <p
          data-testid="meaning-gap-readonly-hint"
          className="pt-2 text-label leading-snug text-[color:var(--color-text-quaternary)]"
        >
          {labels.readOnlyHint}
        </p>
      ) : null}
    </section>
  );
}

function MeaningGapRowView({
  row,
  gapKind,
  open,
  ui,
  abilities,
  domainChoices,
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  onOpen,
  onClose,
  onPatch,
  onSave,
  labels,
}: {
  row: MeaningGapRow;
  gapKind: MeaningGapRow["gap"];
  open: boolean;
  ui: RowUiState;
  abilities: QueueRowAbilities;
  domainChoices: DomainChoice[];
  mapHref: (nodeId: string) => string;
  sourceHref: (nodeId: string) => string | null;
  builderHref: (nodeId: string) => string;
  /**
   * S7 이음새 — 이 행을 지도의 에이전트에게 넘기는 주소. 데스크톱 앱에만
   * 있는 표면이라 없으면 항목이 나타나지 않는다(열리지 않을 문을 그리지
   * 않는다). `gap` 을 받는 이유: 문장의 **종류**만 나르고 문장 자체는
   * 도착지의 첫 마디 생성기가 짓는다.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind) => string | null;
  onOpen: () => void;
  onClose: () => void;
  onPatch: (next: Partial<RowUiState>) => void;
  onSave: (value: string) => void;
  labels: MeaningGapLabels;
}) {
  const saved = ui.phase.kind === "saved";
  const saving = ui.phase.kind === "saving";
  // 저장 확인 중에도 영역은 열려 있어야 한다 — 폼이 사라지고 확인 줄이
  // 들어오는 것이 같은 하나의 높이 전이를 지나야 "이 행이 고쳐진 행이 됐다"
  // 로 읽힌다(툭 접히면 그냥 다른 화면이다).
  const detailOpen = open || saved;
  const { mounted, boxRef, contentRef } = useRowDisclosure(detailOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && gapKind === "missing-definition") inputRef.current?.focus();
  }, [open, gapKind]);

  const dirty = ui.value.trim().length > 0;
  const requestClose = () => {
    // 적은 내용이 있으면 한 번 더 물어본다 — 되돌릴 길이 화면에 있어야 한다.
    if (dirty && !ui.cancelArmed) {
      onPatch({ cancelArmed: true });
      return;
    }
    onClose();
  };

  const canSave = dirty && !saving;
  const candidate = { id: row.id, title: row.title };
  const confirmLine =
    gapKind === "missing-definition"
      ? labels.confirmDefinition(row.ownSlug)
      : labels.confirmDomain(row.ownSlug, ui.value);

  return (
    <div
      data-testid="do-next-meaning-gap-row"
      className="min-w-0 border-b border-[color:var(--color-divider)] last:border-b-0"
      onKeyDown={(event) => {
        // Esc 2단 — 펼쳐져 있으면 이 행이 먹고(입력 취소), 접혀 있으면
        // 위로 흘려보낸다(탭/팔레트가 받는다).
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        requestClose();
      }}
    >
      {/* 헤더 밴드는 큐의 다른 섹션 행과 **같은 껍데기**(py-2.5 + 같은 열 순서)
          다. 이 섹션만 다른 높이를 쓰면 한 목록 안에서 리듬이 끊긴다. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2.5">
        <TopologyV2KindGlyph kind={row.nodeKind} size={13} />
        <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-secondary)]">
          {row.title}
        </span>
        <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
          {/* 저장이 끝난 행에는 열고 닫을 것이 없다 — 확인 줄이 상태를
              말하고, 곧 큐에서 빠진다. 남겨 두면 「접기」가 무엇을 접는지
              가리키지 못한다. */}
          {abilities.canWriteVault && !saved ? (
            <button
              type="button"
              data-testid="meaning-gap-write-toggle"
              aria-expanded={open}
              onClick={() => (open ? requestClose() : onOpen())}
              className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2.5 text-label transition-colors ${
                open
                  ? "border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-accent)]"
                  : "border-[color:var(--color-indigo-line-a22)] text-[color:var(--color-indigo-accent)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]"
              }`}
            >
              <Pencil size={11} aria-hidden />
              {open ? labels.writeHereClose : labels.writeHere}
            </button>
          ) : abilities.canWriteVault ? null : (
            <HandoffCopyButton
              payload={row.handoffPayload}
              labels={labels}
              abilities={abilities}
              compact
            />
          )}
          <Link
            href={mapHref(row.nodeId)}
            className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {labels.openMap}
          </Link>
          <RowActionMenu
            sourceHref={sourceHref(row.nodeId)}
            builderHref={builderHref(row.nodeId)}
            askAgentHref={askAgentHref?.(row.nodeId, row.gap) ?? null}
            handoffPayload={row.handoffPayload}
            candidate={candidate}
            abilities={abilities}
            labels={labels}
          />
        </span>
      </div>

      <div
        ref={boxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? "open" : "closed"}
        data-testid="meaning-gap-disclosure"
        // 접히는 동안에도 DOM 에 남으므로, 보이지 않는 입력칸이 탭 순서와
        // 스크린 리더에 남지 않게 즉시 비활성화한다.
        inert={!detailOpen}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body pb-3">
            <div
              key={saved ? "saved" : "draft"}
              className="ai-row-swap flex flex-col gap-2"
            >
              {saved ? (
                <p
                  data-testid="meaning-gap-saved"
                  role="status"
                  className="flex items-start gap-1.5 text-label leading-snug text-[color:var(--color-indigo-accent)]"
                >
                  <Check size={12} aria-hidden className="mt-0.5 shrink-0" />
                  <span>
                    {labels.saved}
                    <span className="text-[color:var(--color-text-tertiary)]">
                      {" · "}
                      {ui.phase.kind === "saved" ? ui.phase.written : ""}
                    </span>
                  </span>
                </p>
              ) : (
                <>
                  {gapKind === "missing-definition" ? (
                    <input
                      ref={inputRef}
                      data-testid="meaning-gap-definition-input"
                      type="text"
                      value={ui.value}
                      maxLength={160}
                      disabled={saving}
                      aria-label={labels.definitionPlaceholder}
                      placeholder={labels.definitionPlaceholder}
                      onChange={(event) =>
                        onPatch({ value: event.target.value, cancelArmed: false })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canSave) {
                          event.preventDefault();
                          onSave(ui.value.trim());
                        }
                      }}
                      // 한 문장에 1,300px 짜리 줄을 주면 읽는 눈이 화면을
                      // 가로지른다 — 측정선(measure)을 문장 길이에 맞춘다.
                      className="min-h-9 w-full max-w-2xl rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-2.5 text-body text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:outline-none disabled:opacity-60"
                    />
                  ) : (
                    <fieldset className="min-w-0" disabled={saving}>
                      <legend className="pb-1 text-label text-[color:var(--color-text-quaternary)]">
                        {labels.domainLegend}
                      </legend>
                      <div className="flex flex-wrap gap-1.5">
                        {domainChoices.map((choice) => {
                          const active = ui.value === choice.value;
                          return (
                            <button
                              key={choice.value}
                              type="button"
                              data-testid="meaning-gap-domain-chip"
                              aria-pressed={active}
                              onClick={() =>
                                onPatch({ value: choice.value, cancelArmed: false })
                              }
                              className={`inline-flex min-h-8 items-center rounded-md border px-2.5 text-label transition-colors ${
                                active
                                  ? "border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-accent)]"
                                  : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
                              }`}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  {/* 바꿀 파일을 먼저 밝힌다 — 누르기 전에 무엇이 어디에 적히는지. */}
                  <p
                    data-testid="meaning-gap-confirm"
                    className="text-label leading-snug text-[color:var(--color-text-quaternary)]"
                  >
                    {dirty ? confirmLine : gapKind === "missing-definition" ? labels.needsText : labels.needsDomain}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="meaning-gap-save"
                      onClick={() => onSave(ui.value.trim())}
                      disabled={!canSave}
                      className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)] px-2.5 text-label font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] disabled:opacity-50"
                    >
                      {saving ? labels.saving : labels.save}
                    </button>
                    <button
                      type="button"
                      data-testid="meaning-gap-cancel"
                      onClick={requestClose}
                      disabled={saving}
                      className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] disabled:opacity-50"
                    >
                      {labels.cancel}
                    </button>
                    {ui.cancelArmed ? (
                      <span
                        data-testid="meaning-gap-cancel-armed"
                        role="status"
                        className="text-label leading-snug text-[color:var(--color-status-warning)]"
                      >
                        {labels.cancelArmed}
                      </span>
                    ) : null}
                  </div>

                  {ui.phase.kind === "conflict" ? (
                    <MtimeConflictBadge message={labels.conflict} />
                  ) : null}
                  {ui.phase.kind === "failed" ? (
                    <p
                      data-testid="meaning-gap-failed"
                      role="alert"
                      className="text-label leading-snug text-[color:var(--color-status-danger)]"
                    >
                      {labels.failed(ui.phase.message)}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

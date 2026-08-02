"use client";

import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { GitChangeEntry } from "@/shared/lib/tauri-git";
import type { ConceptEgo } from "../model/build-concept-ego";
import { ConceptEgoCard } from "./ConceptEgoCard";

/**
 * 한 커밋이 **무엇을 바꿨나** — 제목/해시 → 바뀐 개념 → 고른 개념 → 바뀐 파일
 * → 바뀐 내용.
 *
 * 구획을 **전폭으로 쌓는다**(시안 실측: 76 / 82 / 386 / 100 / 428px, 카드 0개).
 * 종전엔 이 내용을 카드 한 장에 담았는데, 그러면 ① 열의 60%가 카드 밑에서
 * 비고 ② 라우트 하나가 통째로 한 표면인 자리에 테두리가 또 생겨 «화면 안의
 * 화면»으로 읽힌다. 구획의 경계는 테두리가 아니라 **구분선 하나**가 진다.
 */
export interface CommitConcept {
  id: string;
  label: string;
  kind: string;
}

/** 구획 하나 — 라벨(+수/힌트) 위, 내용 아래, 아래 구분선. */
function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-none flex-col gap-2.5 border-b border-[color:var(--color-divider)] px-5 py-4">
      <h3 className="flex items-baseline gap-2 text-label text-[color:var(--color-text-tertiary)]">
        {label}
        {note ? (
          <i className="min-w-0 truncate not-italic text-caption text-[color:var(--color-text-quaternary)]">
            {note}
          </i>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

export function CommitDetail({
  t,
  hash,
  isoTime,
  relativeTime,
  subject,
  concepts,
  files,
  diff,
  focusedConceptId,
  setFocusedConceptId,
  egoFor,
  kindLabel,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  hash: string;
  isoTime: string;
  relativeTime: string;
  subject: string;
  concepts: readonly CommitConcept[];
  files: readonly GitChangeEntry[];
  /** 이 걸음의 patch. 아직 안 읽었으면 `null`, 없으면 빈 문자열. */
  diff: string | null;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
}) {
  const focused = focusedConceptId ?? concepts[0]?.id ?? null;
  return (
    <div
      className="git-fade-in flex min-h-0 flex-1 flex-col"
      data-testid="atlas-git-history-detail"
    >
      {/* 머리 — 이 걸음의 이름이 주목 승자다. 해시·시각은 그 아래 캡션. */}
      <header className="flex flex-none flex-col gap-1 border-b border-[color:var(--color-divider)] px-5 py-4">
        <p className="text-body-lg font-semibold text-[color:var(--color-text-primary)]">
          {subject}
        </p>
        <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
          {t("historyItemDetail", { hash, isoTime })} · {relativeTime}
        </p>
      </header>

      {concepts.length > 0 ? (
        <Section label={t("changedConcepts")} note={String(concepts.length)}>
          <div className="flex flex-wrap gap-1.5">
            {concepts.map((concept) => (
              <button
                key={concept.id}
                type="button"
                data-testid="atlas-git-concept-chip"
                aria-pressed={focused === concept.id}
                onClick={() => setFocusedConceptId(concept.id)}
                className="inline-flex min-h-7 items-center gap-1.5 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-2.5 py-0.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)] aria-pressed:border-[color:var(--color-indigo-a46)] aria-pressed:bg-[color:var(--color-indigo-a16)] aria-pressed:text-[color:var(--color-text-primary)]"
              >
                <TopologyV2KindGlyph kind={concept.kind} size={12} />
                {concept.label}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {focused ? (
        <Section label={t("egoHeading")} note={t("egoHint")}>
          <ConceptEgoCard
            ego={egoFor(focused)}
            t={t}
            kindLabel={kindLabel}
            onSelect={setFocusedConceptId}
          />
        </Section>
      ) : null}

      {files.length > 0 ? (
        <Section label={t("changedFiles")} note={String(files.length)}>
          <ul className="flex flex-col gap-1">
            {files.map((file) => (
              <li
                key={file.path}
                data-testid="atlas-git-commit-file"
                className="flex min-w-0 items-center gap-2.5"
              >
                <span
                  aria-hidden
                  className="grid size-[18px] shrink-0 place-items-center rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] font-mono text-caption text-[color:var(--color-text-tertiary)]"
                >
                  {statusMark(file.status)}
                </span>
                <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-secondary)]">
                  {file.path}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 바뀐 내용 — 이 걸음이 문서에 **실제로 쓴 것**. 요약이 아니라 원문이라
          사용자가 터미널에서 보던 것과 같은 문자열이다. */}
      <section className="flex flex-none flex-col gap-2.5 px-5 py-4">
        <h3 className="text-label text-[color:var(--color-text-tertiary)]">
          {t("changedLines")}
        </h3>
        {diff === null ? (
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("diffLoading")}
          </p>
        ) : diff.trim() === "" ? (
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("diffEmpty")}
          </p>
        ) : (
          <div
            data-testid="atlas-git-commit-diff"
            className="max-h-[var(--git-commit-diff-max-h)] overflow-auto rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-1.5 font-mono text-caption leading-relaxed"
          >
            {readDiff(diff).map((row, index) =>
              row.kind === "file" ? (
                <p
                  key={index}
                  className="mt-1.5 border-y border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[color:var(--color-text-secondary)] first:mt-0"
                >
                  {row.text}
                </p>
              ) : (
                <p key={index} className={diffRowClass(row.kind)}>
                  {row.text === "" ? " " : row.text}
                </p>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** 파일 상태 한 글자 — 색이 아니라 글자가 뜻을 나른다. */
function statusMark(status: string): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    default:
      return "M";
  }
}

type DiffRow = { kind: "file" | "hunk" | "add" | "del" | "ctx"; text: string };

/**
 * patch 원문 → 훑을 수 있는 행.
 *
 * 소유자 지적(2026-08-02): *"바뀐 내용은 구분도 못하겠다"*. 원인 둘이었다 —
 *
 * ① **잡음이 절반이었다.** `diff --git a/… b/…` · `index 05d74bf..e04bf82` ·
 *    `--- a/…` · `+++ b/…` 네 줄이 파일마다 붙는데, 이 넷이 말하는 것은 **파일
 *    이름 하나**다. 넷을 접어 머리 한 줄로 바꾼다.
 * ② **잉크만 있고 면이 없었다.** 추가/삭제가 글자색으로만 갈렸는데, 그 색은
 *    `+`/`-` 한 글자에만 붙어 훑는 눈에는 안 잡힌다. 행 전체에 얕은 면을 준다 —
 *    승인된 신호 램프의 알파이고 새 값은 아니다.
 *
 * 색은 여전히 **두 번째 채널**이다. 줄머리 부호가 그대로 남아 색약 사용자도
 * 같은 구분을 얻는다.
 */
function readDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      // `a/경로 b/경로` 중 뒤쪽(현재 이름)만 남긴다.
      const to = line.slice(line.indexOf(" b/") + 3);
      rows.push({ kind: "file", text: to || line });
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename ")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    if (line.startsWith("+")) rows.push({ kind: "add", text: line });
    else if (line.startsWith("-")) rows.push({ kind: "del", text: line });
    else rows.push({ kind: "ctx", text: line });
  }
  // 꼬리 빈 줄은 patch 의 끝 개행이지 내용이 아니다.
  while (rows.length > 0 && rows[rows.length - 1].text.trim() === "") rows.pop();
  return rows;
}

function diffRowClass(kind: DiffRow["kind"]): string {
  const base = "px-3 whitespace-pre-wrap break-all";
  if (kind === "hunk") {
    return `${base} mt-1 text-[color:var(--color-text-quaternary)]`;
  }
  if (kind === "add") {
    return `${base} bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]`;
  }
  if (kind === "del") {
    return `${base} bg-[color:var(--color-danger-a10)] text-[color:var(--color-danger-text)]`;
  }
  return `${base} text-[color:var(--color-text-tertiary)]`;
}

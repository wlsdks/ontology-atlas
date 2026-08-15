"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { controlClass } from "@/shared/ui";
import type { GitChangeEntry } from "@/shared/lib/tauri-git";
import type { ConceptEgo } from "../model/build-concept-ego";
import { ConceptEgoCard } from "./ConceptEgoCard";

/**
 * 한 걸음이 **무엇을 바꿨나** — 정체(제목·해시)는 늘 위에, 나머지는 두 렌즈.
 *
 * ## 왜 여기는 탭인가 — 목록의 탭은 왜 거절했나 (2026-08-03)
 *
 * 두 자리에서 같은 낱말이 정반대 뜻을 갖는다. **목록**에 탭을 두자는 안은
 * 거절했다: 거기 갈리는 것은 «저장소의 상태»(커밋 안 함 · 안 보냄 · 원격에만
 * 있음)이고, 탭은 각 칸이 나머지를 **숨긴다** — 아직 안 보낸 게 있다는 사실이
 * 다른 탭 뒤에 있으면 그건 없는 것과 같다. 이 저장소에 그러지 말자는 결정과
 * 그것을 지키는 테스트가 이미 있다(「커밋 이력이 탭 뒤에 숨지 않는다」).
 *
 * **여기서 갈리는 것은 상태가 아니라 렌즈다.** 「개념」과 「파일」은 *이미 고른
 * 걸음 하나*를 보는 두 방식이고, 정체는 탭 위에 남아 어느 렌즈에서도 안
 * 사라진다. 숨는 것은 사실이 아니라 **표현**이다.
 *
 * 그리고 실측이 이 전환을 요구했다: 다섯 구획을 한 기둥에 쌓으니 오른쪽 열이
 * 2,000px 스크롤이 됐고, 「바뀐 내용」은 파일 넷의 patch 를 통째로 이어 붙여
 * 지금 어느 파일을 보고 있는지가 **스크롤 위치로만** 정해졌다(소유자 지적:
 * *"너무 많은걸 스크롤로 다 표현하려는것같긴 해서"*).
 *
 * 그래서 파일 목록은 **고르는 것**이 됐다 — 누른 파일의 patch 만 아래에 선다.
 */
export interface CommitConcept {
  id: string;
  label: string;
  kind: string;
}

type Lens = "concepts" | "files";

/** 구획 하나 — 라벨(+수/힌트) 위, 내용 아래. */
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
    <section className="flex flex-none flex-col gap-2.5 px-5 py-4">
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

  /*
   * 개념 칩 — **배타 단일선택**이다(초기값이 `concepts[0]` 이라 항상 하나가
   * 참이고, 재클릭으로 해제되지 않는다). 종전엔 형제에 `aria-pressed` 를 나란히
   * 걸어 배타성이 접근성 트리에 안 실렸다.
   *
   * 그릇은 자리에 남는다 — `tone:'secondary'` + 조건부 보더가 값 층 칩 램프의
   * 조합이 아니고, 그 보더 규칙은 「눌린 칩의 인디고를 덮지 마라」는 실측이
   * 남긴 것이다(2026-08-15 (8) 의 판정 규칙).
   */
  const conceptGroup = useRovingRadioGroup({
    value: focused,
    values: concepts.map((c) => c.id),
    onChange: setFocusedConceptId,
  });

  /*
   * 기본 렌즈는 **개념**이다. 이 제품이 git 클라이언트와 갈리는 지점이 거기라서
   * 다 — 파일 목록은 어느 도구에나 있고 「이 걸음이 어느 개념을 건드렸나」는
   * 여기에만 있다. 개념이 하나도 없는 걸음(설정 파일만 고친 것 등)에서만 파일로
   * 연다 — 기본값이 빈 칸이면 그건 기본값이 아니다.
   */
  const [lens, setLens] = useState<Lens>(concepts.length > 0 ? "concepts" : "files");
  const [openFile, setOpenFile] = useState<string | null>(null);

  // 걸음이 바뀌면 렌즈와 고른 파일이 따라온다 — 남의 걸음의 선택을 물려받으면
  // 화면이 「왜 이걸 보고 있지」가 된다.
  useEffect(() => {
    setLens(concepts.length > 0 ? "concepts" : "files");
    setOpenFile(null);
  }, [hash, concepts.length]);

  const perFile = useMemo(() => splitDiffByFile(diff ?? ""), [diff]);
  const activeFile = openFile ?? files[0]?.path ?? null;
  const activePatch = activeFile ? findPatch(perFile, activeFile) : null;

  return (
    <div
      className="git-fade-in flex min-h-0 flex-1 flex-col"
      data-testid="atlas-git-history-detail"
    >
      {/* 정체 — 어느 렌즈에서도 안 사라진다. */}
      <header className="flex flex-none flex-col gap-1 px-5 pt-4 pb-3">
        <p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {subject}
        </p>
        <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
          {t("historyItemDetail", { hash, isoTime })} · {relativeTime}
        </p>
      </header>

      {/* 렌즈 — 수를 라벨에 싣는다. 「개념」만 써 두면 몇 개인지 눌러 봐야 알고,
          그러면 탭이 표현이 아니라 **사실**을 숨긴 것이 된다. */}
      <div
        role="tablist"
        aria-label={t("lensLabel")}
        className="flex flex-none items-center gap-1 border-b border-[color:var(--color-divider)] px-5"
      >
        {(["concepts", "files"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            data-testid={`atlas-git-lens-${id}`}
            aria-selected={lens === id}
            onClick={() => setLens(id)}
            className={controlClass({ shape: "segment", size: "md", tone: "muted", className: "-mb-px min-h-9 gap-1.5 rounded-none border-b-2 border-transparent px-2.5 hover:text-[color:var(--color-text-primary)] aria-selected:border-[color:var(--color-indigo-brand)] aria-selected:font-[var(--font-weight-signature)] aria-selected:text-[color:var(--color-text-primary)]" })}
          >
            {id === "concepts" ? t("changedConcepts") : t("changedFiles")}
            <b className="font-normal tabular-nums text-[color:var(--color-text-quaternary)]">
              {id === "concepts" ? concepts.length : files.length}
            </b>
          </button>
        ))}
      </div>

      <div key={lens} className="git-fade-in flex min-h-0 flex-1 flex-col">
        {lens === "concepts" ? (
          concepts.length > 0 ? (
            <>
              {/* 탭이 이미 「바뀐 개념 N」이라고 말했다 — 바로 밑에서 같은 말을
                  또 하면 두 번째 것은 잉크만 쓰고 아무것도 안 말한다. */}
              <div className="flex flex-none flex-col gap-2.5 px-5 pt-4">
                <div {...conceptGroup.groupProps} aria-label={t("conceptChipsAria")} className="flex flex-wrap gap-1.5">
                  {concepts.map((concept, index) => (
                    <button
                      key={concept.id}
                      {...conceptGroup.itemProps(index)}
                      type="button"
                      data-testid="atlas-git-concept-chip"
                      className={controlClass({
                        shape: "chip",
                        size: "md",
                        tone: "secondary",
                        active: focused === concept.id,
                        // 눌린 칩의 인디고 테두리는 램프가 낸다 — 여기서 무조건
                        // 덮으면 그 신호가 조용히 사라진다(전/후 실측이 잡았다).
                        className: cn(
                          focused !== concept.id &&
                            "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
                        ),
                      })}
                    >
                      <TopologyV2KindGlyph kind={concept.kind} size={12} />
                      {concept.label}
                    </button>
                  ))}
                </div>
              </div>
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
            </>
          ) : (
            <p className="px-5 py-6 text-label text-[color:var(--color-text-quaternary)]">
              {t("stepNoConcepts")}
            </p>
          )
        ) : (
          <>
            {/* 파일은 **고르는 것**이다. 넷의 patch 를 이어 붙이면 지금 어느
                파일을 보고 있는지가 스크롤 위치로만 정해진다. */}
            <ul
              data-testid="atlas-git-file-list"
              className="flex flex-none flex-col border-b border-[color:var(--color-divider)]"
            >
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    data-testid="atlas-git-commit-file"
                    /* 파일 목록도 같은 이유로 `aria-current` 다 — 바로 위
                       형제 렌즈가 `role="tablist"`+`aria-selected` 를 쓰고 있어
                       여기에 pressed 를 두면 한 화면에 어휘가 셋이 된다. */
                    aria-current={activeFile === file.path ? "true" : undefined}
                    onClick={() => setOpenFile(file.path)}
                    className={controlClass({ shape: "row", stacked: true, className: "min-h-8 min-w-0 gap-2.5 border-l-2 border-l-transparent px-5 hover:bg-[color:var(--color-overlay-1)] aria-[current=true]:border-l-[color:var(--color-indigo-brand)] aria-[current=true]:bg-[color:var(--color-overlay-2)]" })}
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
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-5 py-4">
              <h3 className="flex-none text-label text-[color:var(--color-text-tertiary)]">
                {t("changedLines")}
              </h3>
              {diff === null ? (
                <p className="text-caption text-[color:var(--color-text-quaternary)]">
                  {t("diffLoading")}
                </p>
              ) : !activePatch || activePatch.length === 0 ? (
                <p className="text-caption text-[color:var(--color-text-quaternary)]">
                  {t("diffEmpty")}
                </p>
              ) : (
                <div
                  key={activeFile}
                  data-testid="atlas-git-commit-diff"
                  className="git-fade-in min-h-0 flex-1 overflow-auto rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-1.5 font-mono text-caption leading-label"
                >
                  {activePatch.map((row, index) => (
                    <p key={index} className={diffRowClass(row.kind)}>
                      {row.text === "" ? " " : row.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
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

type DiffRow = { kind: "hunk" | "add" | "del" | "ctx"; text: string };

/**
 * patch 원문 → **파일별** 행 묶음.
 *
 * 잡음을 걷는 이유(2026-08-02): `diff --git a/… b/…` · `index 05d74bf..e04bf82` ·
 * `--- a/…` · `+++ b/…` 네 줄이 파일마다 붙는데, 이 넷이 말하는 것은 **파일
 * 이름 하나**다. 그 이름은 이제 위 목록이 나르므로 여기서는 통째로 버린다.
 *
 * 색은 **두 번째 채널**이다 — 줄머리 부호가 그대로 남아 색약 사용자도 같은
 * 구분을 얻는다.
 */
function splitDiffByFile(patch: string): { path: string; rows: DiffRow[] }[] {
  const blocks: { path: string; rows: DiffRow[] }[] = [];
  let current: { path: string; rows: DiffRow[] } | null = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const to = line.slice(line.indexOf(" b/") + 3);
      current = { path: to || line, rows: [] };
      blocks.push(current);
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
    if (!current) continue;
    if (line.startsWith("@@")) current.rows.push({ kind: "hunk", text: line });
    else if (line.startsWith("+")) current.rows.push({ kind: "add", text: line });
    else if (line.startsWith("-")) current.rows.push({ kind: "del", text: line });
    else current.rows.push({ kind: "ctx", text: line });
  }
  for (const block of blocks) {
    while (block.rows.length > 0 && block.rows[block.rows.length - 1].text.trim() === "") {
      block.rows.pop();
    }
  }
  return blocks;
}

/**
 * 파일 경로로 patch 를 찾는다. **꼬리 맞춤**으로도 무는 이유: 목록의 경로는
 * vault 기준이고 patch 의 경로는 저장소 뿌리 기준이라, vault 가 하위 폴더면
 * 앞이 다르다. 정확히 같은 것을 먼저 보고, 없으면 꼬리로 문다.
 */
function findPatch(
  blocks: { path: string; rows: DiffRow[] }[],
  path: string,
): DiffRow[] | null {
  const exact = blocks.find((b) => b.path === path);
  if (exact) return exact.rows;
  const tail = blocks.find((b) => b.path.endsWith(path) || path.endsWith(b.path));
  return tail?.rows ?? null;
}

function diffRowClass(kind: DiffRow["kind"]): string {
  const base = "px-3 whitespace-pre-wrap break-all";
  if (kind === "hunk") return cn(base, "mt-1 text-[color:var(--color-text-quaternary)]");
  if (kind === "add") {
    return cn(
      base,
      "bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]",
    );
  }
  if (kind === "del") {
    return cn(base, "bg-[color:var(--color-danger-a10)] text-[color:var(--color-danger-text)]");
  }
  return cn(base, "text-[color:var(--color-text-tertiary)]");
}

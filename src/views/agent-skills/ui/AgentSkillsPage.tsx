"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useSkillFolder } from "@/features/agent-skills-local";
import { Button } from "@/shared/ui";
import { fieldClass } from "@/shared/ui/control-class";
import { HexMark } from "@/shared/ui/hex-mark";

import { FindingsPanel } from "./FindingsPanel";
import { SkillDetail } from "./SkillDetail";
import { filterSkills, groupBySource, SkillList } from "./SkillList";

/**
 * 스킬 — **에이전트가 가진 스킬을 사람이 읽는 자리** (2026-08-09 소유자 확정).
 *
 * ## 왜 2열인가 (2026-08-09, 갈래 넷 중 소유자 선택)
 *
 * 첫 판은 43개를 한 줄기 세로 목록으로 늘어놓았고, 실측이 이렇게 나왔다:
 * 스크롤 **4,792px(5.3화면)** · 검색·필터·묶음 **0개** · 겹쳤다고 말해 놓고 그
 * 상대로 **가는 길 0개** · 그리고 이 화면이 다른 어디서도 못 보여 주는 단 하나인
 * **호출 3단이 43번의 클릭 뒤에** 숨어 있었다.
 *
 * 그래서 왼쪽은 출처로 묶은 한 줄 목록 + 이름 찾기, 오른쪽은 **고른 스킬의 3단이
 * 항상 떠 있는** 자리로 바꿨다. 문서함이 이미 쓰는 좌우 분할 문법이라 앱에 새
 * 문법을 들이지 않는다.
 *
 * **아무것도 안 골랐을 때 오른쪽이 비지 않는다.** 이 갈래를 고를 때 예상한 유일한
 * 실패가 그것이었고(*"화면의 반을 아무도 안 보는 것에 준 셈"*), 그 자리에 안내
 * 문구 대신 **세 질문의 답**을 넣었다(`FindingsPanel`).
 *
 * ## 이 화면이 하지 않는 것 (전부 의도된 것이다)
 *
 * - **볼트에 쓰지 않고 `kind:` 로 승격하지 않는다.** 진실원이 둘이 된다.
 * - **스킬 파일을 고치지 않는다.** 주인이 런타임과 마켓플레이스이고 그 폴더는
 *   대개 git 체크아웃이라 업데이트가 우리 글씨를 덮는다(#1006 이 쓰기 경로를 막았다).
 * - **위험 점수·배지를 내지 않는다.** 그 축은 전용 스캐너의 것이다.
 * - **기억하지 않는다.** 다시 보려면 다시 고른다.
 */
/** 새김 숫자 — 프로젝트·인사이트 머리가 쓰는 것과 같은 값. */
const numeralClass =
  "font-mono font-[var(--font-weight-strong)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]";

export function AgentSkillsPage() {
  const t = useTranslations("agentSkills");
  const { status, inventory, folderName, scan, error, openFolder } = useSkillFolder();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => (inventory ? groupBySource(filterSkills(inventory.skills, query)) : []),
    [inventory, query],
  );
  const current = useMemo(
    () => inventory?.skills.find((s) => s.origin.relativePath === selected) ?? null,
    [inventory, selected],
  );

  return (
    <main
      data-testid="agent-skills-page"
      // 셸이 `h-dvh` 로 뷰포트를 소유하므로 페이지는 `h-full` 로 받고 스크롤은
      // 안에서 처리한다 — 지도·문서함·기록과 같은 문법이다.
      className="flex h-full flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-3 px-4 pt-5 pb-4 sm:px-8">
        {/* 머리는 **다른 목적지와 같은 문법**이다 (2026-08-09 소유자 지적:
            *"스킬 탭은 왜 혼자 … 다른 탭과 느낌이 다르고"*). 프로젝트·인사이트가
            쓰는 「육각 마크 + 제목 + 그 옆 인라인 수 + 아래 한 줄 설명」 그대로.
            수를 머리로 올렸으므로 **아래 요약 띠는 없앴다** — 같은 수를 두 곳에서
            세면 방금 프로젝트 화면에서 지운 그 혼란이 여기서 다시 난다. */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <h1 className="inline-flex items-center gap-2 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
                <HexMark size={13} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
                {t("title")}
              </h1>
              {inventory ? (
                <span
                  data-testid="skills-census"
                  className="flex items-baseline gap-1.5 pb-[3px] text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]"
                >
                  <b className={numeralClass}>{inventory.totals.skills}</b> {t("stat.skills")}
                  <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
                  <b className={numeralClass}>{inventory.totals.executables}</b>{" "}
                  {t("stat.executables")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-body leading-prose text-[color:var(--color-text-secondary)]">
              {t("subtitle")}
            </p>
          </div>
          <Button
            size="sm"
            variant={inventory ? "outline" : "primary"}
            onClick={() => void openFolder(t("pickerTitle"))}
            data-testid="skills-open-folder"
          >
            {inventory ? t("openAnother") : t("openFolder")}
          </Button>
        </header>

        {status === "unsupported" ? <Notice tone="muted">{t("unsupported")}</Notice> : null}
        {status === "error" ? (
          <Notice tone="danger">{t("readError", { error: error ?? "" })}</Notice>
        ) : null}
        {status === "loading" ? <Notice tone="muted">{t("reading")}</Notice> : null}

        {status === "idle" ? <EmptyState /> : null}

        {inventory ? (
          <>
            {/* 스캔에 대한 사실만 남긴다 — **수는 머리가 진다.** 폴더 이름과
                「사본 뺐어요」·「상한에 걸렸어요」는 숫자가 아니라 이 판독이 어떤
                조건에서 나왔는지를 말하는 각주라서, 제목 옆이 아니라 여기 있는다. */}
            {folderName || scan?.skippedNotInstalled || scan?.truncated ? (
              <p
                data-testid="skills-scan-note"
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-label leading-prose text-[color:var(--color-text-tertiary)]"
              >
                <span>{t("stat.folder", { folder: folderName ?? "" })}</span>
                {scan?.skippedNotInstalled ? (
                  <span>{t("notInstalled", { count: scan.skippedNotInstalled })}</span>
                ) : null}
                {scan?.truncated ? (
                  <span>{t("truncated", { count: scan.scannedFiles })}</span>
                ) : null}
              </p>
            ) : null}

            {/* 2열 — 왼쪽은 찾고 고르는 자리, 오른쪽은 항상 답이 떠 있는 자리. */}
            <div className="flex min-h-0 flex-1 gap-4">
              <div
                data-testid="skills-left"
                className="flex min-h-0 w-full shrink-0 flex-col gap-2 lg:w-[340px]"
              >
                {/* 라벨은 `sr-only <label>` 이 아니라 `aria-label` 로 단다 —
                    화면에 안 보이는 라벨에 클래스를 얹으면 폼 래칫이 그것을
                    「손으로 쓴 규격」으로 세고, 실제로 그렇게 세는 게 맞다. */}
                <input
                  data-testid="skills-search"
                  aria-label={t("searchLabel")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  // 폼 규격은 값 층이 진다 — 손으로 쓰면 래칫이 막는다.
                  className={fieldClass({ size: "md" })}
                />
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <SkillList
                    inventory={inventory}
                    groups={groups}
                    selected={selected}
                    onSelect={setSelected}
                  />
                </div>
              </div>

              <div
                data-testid="skills-right"
                className="hidden min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] px-4 py-3.5 lg:block"
              >
                {current ? (
                  <SkillDetail skill={current} inventory={inventory} onSelect={setSelected} />
                ) : (
                  <FindingsPanel inventory={inventory} onSelect={setSelected} />
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function EmptyState() {
  const t = useTranslations("agentSkills");
  return (
    <section className="flex flex-col gap-5 overflow-y-auto rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-5 py-6">
      <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">
        {t("emptyBody")}
      </p>
      <div>
        <h2 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t("answersTitle")}
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {["answer1", "answer2", "answer3"].map((key) => (
            <li
              key={key}
              className="text-label leading-prose text-[color:var(--color-text-secondary)]"
            >
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t("whereTitle")}
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {["emptyHint1", "emptyHint2"].map((key) => (
            <li
              key={key}
              className="text-label leading-prose text-[color:var(--color-text-tertiary)]"
            >
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t("emptyHint3")}
      </p>
    </section>
  );
}

function Notice({ tone, children }: { tone: "muted" | "danger"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "danger"
          ? "rounded-[var(--radius-chip)] border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-2 text-label leading-prose text-[color:var(--color-danger-text)]"
          : "rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-3 py-2 text-label leading-prose text-[color:var(--color-text-tertiary)]"
      }
    >
      {children}
    </p>
  );
}

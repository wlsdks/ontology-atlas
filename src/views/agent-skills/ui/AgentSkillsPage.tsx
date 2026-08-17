"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useSkillFolder } from "@/features/agent-skills-local";
import { Button } from "@/shared/ui";
import { fieldClass } from "@/shared/ui/control-class";
import { HexMark } from "@/shared/ui/hex-mark";
import { LG_BREAKPOINT_PX, useViewportBelow } from "@/shared/lib/use-viewport-below";
import { EntryChoiceCard } from "@/shared/ui/entry-choice-card";
import { PAGE_COLUMN_STAGE, PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from "@/shared/ui/page-frame";

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
  const { status, inventory, folderName, scan, error, sample, openFolder, openSample } =
    useSkillFolder();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [compactDetail, setCompactDetail] = useState(false);
  const [openStepsBySkill, setOpenStepsBySkill] = useState<Record<string, readonly string[]>>({});
  const isCompact = useViewportBelow(LG_BREAKPOINT_PX);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const listScrollTop = useRef(0);
  const restoreListFocus = useRef(false);

  const groups = useMemo(
    () => (inventory ? groupBySource(filterSkills(inventory.skills, query)) : []),
    [inventory, query],
  );
  const current = useMemo(
    () => inventory?.skills.find((s) => s.origin.relativePath === selected) ?? null,
    [inventory, selected],
  );
  const view = isCompact ? (compactDetail && current ? "detail" : "list") : "split";

  /*
   * **오른쪽에서 고르면 왼쪽이 따라와야 한다** (2026-08-18 실측).
   *
   * 넘김 줄을 눌러 건너뛰면 상세는 바뀌는데 왼쪽 목록은 그대로였다. 실측:
   * `design-audit` → `responsive-sweep` 으로 넘어간 뒤, 「지금 여기」 표시가 붙은
   * 행은 y=1309 인데 목록이 보이는 칸은 197~876 이었다 — **433px 아래, 화면 밖**.
   * 게다가 누른 버튼이 사라지면서 초점이 `<body>` 로 떨어져, 다음 Tab 이 문서
   * 맨 위에서 다시 시작했다.
   *
   * 그래서 «어디서 골랐나»를 구분한다. 목록 행에서 고른 것은 이미 보이는 자리이고
   * 초점도 그 행에 있으므로 **아무것도 하지 않는다** — 거기서 초점을 뺏으면 화살표
   * 이동이 끊긴다. 오른쪽(넘김 · 경쟁 · 요약)에서 고른 것만 목록을 데려오고 상세
   * 제목으로 초점을 옮긴다.
   */
  const cameFromRight = useRef(false);

  const selectSkill = useCallback((relativePath: string, fromList = false) => {
    setSelected(relativePath);
    cameFromRight.current = !fromList;
    if (isCompact) {
      listScrollTop.current = listScrollRef.current?.scrollTop ?? 0;
      setCompactDetail(true);
    }
  }, [isCompact]);

  const selectFromList = useCallback(
    (relativePath: string) => selectSkill(relativePath, true),
    [selectSkill],
  );

  useEffect(() => {
    if (isCompact || !cameFromRight.current || !selected) return;
    cameFromRight.current = false;
    // `nearest` — 이미 보이면 안 움직인다. 주인공은 상세이지 목록이 아니다.
    document
      .querySelector<HTMLElement>(`[data-skill-path="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
    detailHeadingRef.current?.focus();
  }, [isCompact, selected]);

  useEffect(() => {
    if (isCompact && compactDetail && current) detailHeadingRef.current?.focus();
  }, [compactDetail, current, isCompact]);

  useEffect(() => {
    if (!isCompact || compactDetail || !restoreListFocus.current) return;
    restoreListFocus.current = false;
    if (listScrollRef.current) listScrollRef.current.scrollTop = listScrollTop.current;
    const rows = document.querySelectorAll<HTMLElement>("[data-skill-path]");
    [...rows].find((row) => row.dataset.skillPath === selected)?.focus();
  }, [compactDetail, isCompact, selected]);

  const returnToList = useCallback(() => {
    restoreListFocus.current = true;
    setCompactDetail(false);
  }, []);

  const toggleStep = useCallback((stepId: string) => {
    if (!selected) return;
    setOpenStepsBySkill((currentOpen) => {
      const open = new Set(currentOpen[selected] ?? []);
      if (open.has(stepId)) open.delete(stepId);
      else open.add(stepId);
      return { ...currentOpen, [selected]: [...open] };
    });
  }, [selected]);

  return (
    <main
      data-testid="agent-skills-page"
      data-view={view}
      // 셸이 `h-dvh` 로 뷰포트를 소유하므로 페이지는 `h-full` 로 받고 스크롤은
      // 안에서 처리한다 — 지도·문서함·기록과 같은 문법이다.
      className="flex h-full flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      {/*
        * **아무것도 안 열었을 때는 이 화면이 무대다** (2026-08-12, 소유자 지적
        * *"우측/하단 공백이 너무 심하고 … 이렇게 조립대같은 전략을 쓰던지"*).
        *
        * 목록이 있을 때는 다른 목적지와 같은 머리(제목 + 수 + 설명)를 쓴다 — 그건
        * 2026-08-09 소유자 지적으로 맞춘 것이고 그대로 둔다. 그러나 **열 것이 아직
        * 없을 때** 그 머리는 화면을 가로로 다 쓰면서(실측 잉크 상자 1368×313,
        * 좌 104 / 우 40) 아래로 531px 을 비워 둔다. 그때 이 화면의 일은 하나뿐이다:
        * 「폴더를 고르세요」.
        *
        * 답은 같은 앱 안에 있었다 — 조립대 입구는 같은 뷰포트에서 잉크 상자가
        * `482×318 @(489,291)`, 좌 489 / 우 541 · 상 291 / 하 291 로 **가운데에
        * 세워져 있다.** 목적지가 무엇인지는 좌측 레일이 이미 말하므로 제목이 머리
        * 행에 있을 필요가 없고, 여기서는 제목이 **무대의 제목**이 된다.
        */}
      {status === "idle" ? (
        <div
          data-testid="skills-stage"
          className={`${PAGE_FRAME} flex min-h-0 flex-1 flex-col items-center justify-center gap-3 pb-4 md:pb-6`}
        >
          {/* 무대의 제목은 스튜디오 입구처럼 **질문**이다 (B, 2026-08-13). 목적지
              이름(스킬)은 레일이 이미 말하고, 설명 문장은 카드 둘과 아래 캡션이
              대신한다 — 회색 글줄을 8→3덩어리로 줄이는 것이 B의 요점이다. */}
          <h1 className="text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {t("stageTitle")}
          </h1>
          <EmptyState
            onOpenFolder={() => void openFolder(t("pickerTitle"))}
            onOpenSample={openSample}
          />
        </div>
      ) : null}

      {status !== "idle" ? (
      <div className={`${PAGE_FRAME} flex min-h-0 flex-1 flex-col gap-3 pb-4 md:pb-6`}>
        {/* 머리는 **다른 목적지와 같은 문법**이다 (2026-08-09 소유자 지적:
            *"스킬 탭은 왜 혼자 … 다른 탭과 느낌이 다르고"*). 프로젝트·인사이트가
            쓰는 「육각 마크 + 제목 + 그 옆 인라인 수 + 아래 한 줄 설명」 그대로.
            수를 머리로 올렸으므로 **아래 요약 띠는 없앴다** — 같은 수를 두 곳에서
            세면 방금 프로젝트 화면에서 지운 그 혼란이 여기서 다시 난다. */}
        {/* 머리 구조도 **다른 목적지와 같게** 맞춘다 (2026-08-09).
            제목과 인라인 수는 헤더 행의 **직계 자식**이어야 `items-end` 가 먹는다 —
            여기만 제목+설명을 한 덩어리로 감싸고 있어서, 같은 `PAGE_HEADER_ROW` 를
            입혔는데도 제목이 40px 에 섰다(나머지 둘은 48). 설명은 헤더 밖 아래로. */}
        <header className={PAGE_HEADER_ROW}>
          <div className={PAGE_TITLE_ROW}>
            <h1 className="inline-flex items-center gap-2 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
              <HexMark size={13} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
              {t("title")}
            </h1>
            {inventory ? (
              <span
                data-testid="skills-census"
                className="flex items-baseline gap-1.5 pb-[3px] text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]"
              >
                {/* 「18 스킬」은 한국어 어순이 아니다 — 수사가 앞서면 영어를 옮긴 말로
                    읽힌다. 그런데 어순은 언어마다 다르므로 컴포넌트가 정할 수 없다:
                    문장은 번역이 갖고, 굵게 칠할 숫자만 rich 태그로 돌려준다. */}
                {/* ⚠️ **rich 출력은 반드시 한 겹으로 싸서 넣는다.** 그냥 두면
                    `<b>18</b>` 과 「개」가 **각각 flex 자식**이 되어 컨테이너의
                    `gap-1.5` 가 그 사이에 끼고, 화면에 「18 개」로 벌어진다
                    (2026-08-18 실측 — 내가 낸 회귀를 스크린샷에서 잡았다). */}
                <span>
                  {t.rich("stat.skillsCount", {
                    count: inventory.totals.skills,
                    b: (chunks) => <b className={numeralClass}>{chunks}</b>,
                  })}
                </span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
                <span>
                  {t.rich("stat.executablesCount", {
                    count: inventory.totals.executables,
                    b: (chunks) => <b className={numeralClass}>{chunks}</b>,
                  })}
                </span>
              </span>
            ) : null}
          </div>
          {/* 첫 화면에서는 **본문이 이 동작을 소유한다** — 머리에도 같은 버튼을
              두면 같은 일로 가는 입구가 둘이 되고, 그건 이 저장소가 `#65` 로 겪은
              혼란과 같은 계열이다. 폴더를 연 뒤에는 머리가 진다(본문은 목록이다). */}
          {inventory ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void openFolder(t("pickerTitle"))}
              data-testid="skills-open-folder"
            >
              {t("openAnother")}
            </Button>
          ) : null}
        </header>
        <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">
          {t("subtitle")}
        </p>

        {status === "unsupported" ? <Notice tone="muted">{t("unsupported")}</Notice> : null}
        {status === "error" ? (
          <Notice tone="danger">{t("readError", { error: error ?? "" })}</Notice>
        ) : null}
        {status === "loading" ? <Notice tone="muted">{t("reading")}</Notice> : null}

        {inventory ? (
          <>
            {/* 스캔에 대한 사실만 남긴다 — **수는 머리가 진다.** 폴더 이름과
                「사본 뺐어요」·「상한에 걸렸어요」는 숫자가 아니라 이 판독이 어떤
                조건에서 나왔는지를 말하는 각주라서, 제목 옆이 아니라 여기 있는다. */}
            {folderName || scan?.skippedNotInstalled || scan?.truncated ? (
              <p
                data-testid="skills-scan-note"
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body leading-body text-[color:var(--color-text-tertiary)]"
              >
                <span>
                  {sample ? t("sampleNotice") : t("stat.folder", { folder: folderName ?? "" })}
                </span>
                {scan?.skippedNotInstalled ? (
                  <span>{t("notInstalled", { count: scan.skippedNotInstalled })}</span>
                ) : null}
                {scan?.truncated ? (
                  <span>{t("truncated", { count: scan.scannedFiles })}</span>
                ) : null}
              </p>
            ) : null}

            {/* 2열 — 왼쪽은 찾고 고르는 자리, 오른쪽은 항상 답이 떠 있는 자리. */}
            <div data-testid="skills-workbench" data-view={view} className="flex min-h-0 flex-1 gap-4">
              {!isCompact || view === "list" ? (
              <div data-testid="skills-left" className="flex min-h-0 w-full shrink-0 flex-col gap-2 lg:w-[340px]">
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
                <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <SkillList
                    inventory={inventory}
                    groups={groups}
                    selected={selected}
                    onSelect={selectFromList}
                  />
                </div>
              </div>
              ) : null}

              {!isCompact || view === "detail" ? (
              <div data-testid="skills-right" className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] px-4 py-3.5">
                {current ? (
                  <SkillDetail
                    key={current.origin.relativePath}
                    skill={current}
                    inventory={inventory}
                    onSelect={selectSkill}
                    onBack={isCompact ? returnToList : undefined}
                    onOverview={isCompact ? undefined : () => setSelected(null)}
                    headingRef={detailHeadingRef}
                    openStepIds={new Set(openStepsBySkill[current.origin.relativePath] ?? [])}
                    onToggleStep={toggleStep}
                  />
                ) : (
                  <FindingsPanel inventory={inventory} onSelect={selectSkill} />
                )}
              </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      ) : null}
    </main>
  );
}

/**
 * 첫 화면 — **아직 아무것도 안 고른 사람이 보는 것.**
 *
 * ## 무엇이 문제였나 (2026-08-09 소유자 지적)
 *
 * > *"이런 글자들도 더 커도 되는거 아니려나? 그리고 이거 모양 더 세련되게
 * > 안되나? 이거 그냥 대충 박스에 글자 넣은거 뿐이잖아.."*
 *
 * 맞다. 상자 하나 안에 문단 · 소제목 · 목록 · 각주를 전부 세로로 쌓아 놓고
 * **크기로만** 구분하고 있었다 — 본문 12.5px · 항목 11px 이라 램프 아래쪽 두 칸에
 * 몰려 있었고, 그래서 무엇이 먼저 눈에 들어와야 하는지 화면이 말하지 않았다.
 *
 * ## 다시 짠 방식
 *
 * **세 질문이 이 화면의 주인공이다.** 그것을 번호가 붙은 세 칸으로 세우고, 각
 * 칸에 «질문 → 답» 두 줄을 준다. 크기는 램프의 위쪽으로 올린다(질문 14px ·
 * 답 12.5px). 나머지(어디에 있나 · 안 고친다)는 아래로 내려 한 줄씩만.
 *
 * 그리고 **길이 둘이 된다** — 폴더 고르기와 **예시 둘러보기**. 두 번째가 없으면
 * 아무것도 없는 사람은 설명문만 읽고 나가야 한다.
 */
function EmptyState({ onOpenFolder, onOpenSample }: { onOpenFolder: () => void; onOpenSample: () => void }) {
  const t = useTranslations("agentSkills");
  /*
   * **셋째 판 — 스튜디오 입구와 같은 문법** (2026-08-13, 소유자 선택 B).
   *
   * 배치(가운데 무대)는 둘째 판이 세웠는데 미감이 남았다 — 소유자: *"아직도
   * 이거 디자인 아쉬우니 더 세련되고 더 예쁘게"*. 실측이 정체를 밝혔다: 소유자가
   * 직접 가리킨 스튜디오 입구와 이 화면의 차이는 딱 셋 — 48px 아이콘(여긴 0개) ·
   * 갈림길 2장 구조 · 글의 양(3줄 vs 회색 8줄이 같은 24px 간격으로). 아쉬움의
   * 정체는 장식이 아니라 **먼저 볼 것이 없어서**다.
   *
   * 그래서 그 셋을 그대로 가져온다: 버튼 둘 → `EntryChoiceCard` 2장(이 카드가
   * 두 번째 소비처를 얻어 공용으로 승격된 바로 그 계기), 3단 약속은 카드 아래
   * 한 줄로. 지난 두 판의 교훈(폭은 무대 칸 · 덩어리가 남는 높이를 소유)은
   * 부모(skills-stage)가 그대로 지킨다. 새 토큰·새 값 0.
   */
  return (
    <section data-testid="skills-empty" className={`${PAGE_COLUMN_STAGE} flex flex-col gap-6`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <EntryChoiceCard
          testId="skills-empty-open"
          onClick={onOpenFolder}
          title={t("openCardTitle")}
          desc={t("openCardDesc")}
          footnote={t("openCardNote")}
          illustration={<FolderGlyph />}
        />
        <EntryChoiceCard
          testId="skills-open-sample"
          onClick={onOpenSample}
          title={t("sampleCardTitle")}
          desc={t("sampleCardDesc")}
          footnote={null}
          illustration={<SampleGlyph />}
        />
      </div>
      <p className="text-center text-body leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {t("stageCaption")}
      </p>
    </section>
  );
}

/** 라인아트 — 내 폴더: 폴더 + 안에서 떠오르는 SKILL 낱장. */
function FolderGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 7.5c0-1.1.9-2 2-2h4l2 2h7c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2v-9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.5 13h7M8.5 15.5h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** 라인아트 — 예시 뭉치: 겹친 낱장 + 발동 표시(우상단 점). */
function SampleGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="7" y="4.5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2.6" />
      <rect x="4.5" y="7" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" fill="var(--color-elevated)" />
      <path d="M8 12h5M8 14.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
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

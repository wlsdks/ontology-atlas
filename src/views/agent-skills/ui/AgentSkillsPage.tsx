"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useSkillFolder } from "@/features/agent-skills-local";
import { Button } from "@/shared/ui";
import { fieldClass } from "@/shared/ui/control-class";
import { HexMark } from "@/shared/ui/hex-mark";
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
          <h1 className="inline-flex items-center gap-2 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            <HexMark size={13} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
            {t("title")}
          </h1>
          <p className="max-w-[46em] text-center text-body leading-prose text-[color:var(--color-text-secondary)]">
            {t("subtitle")}
          </p>
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
                <b className={numeralClass}>{inventory.totals.skills}</b> {t("stat.skills")}
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
                <b className={numeralClass}>{inventory.totals.executables}</b>{" "}
                {t("stat.executables")}
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
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-label leading-prose text-[color:var(--color-text-tertiary)]"
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
  const answers = [
    { key: "answer1", q: "answerQ1" },
    { key: "answer2", q: "answerQ2" },
    { key: "answer3", q: "answerQ3" },
  ] as const;

  return (
    <section
      data-testid="skills-empty"
      /*
       * **내용이 적으면 칸도 좁아진다** (2026-08-12 실측).
       *
       * 이 빈 상태는 글이 16개인데 목록형 칸(1448px)을 그대로 써서 세 질문이 벽까지
       * 펼쳐져 있었고(가장 오른쪽 1472), 아래로 524px — 화면의 58% — 가 비어 있었다.
       * 소유자: *"너무 횡하고 뭔가 벽에 다 딱 붙어있고"*. 같은 폭을 쓰는 인사이트·
       * 프로젝트는 글이 48·80개라 정당했으니, 문제는 폭 값이 아니라 **적은 내용에
       * 같은 폭을 쓴 것**이다.
       *
       * ⚠️ **첫 처방은 화면이 반박했다.** 남는 높이를 `justify-center` 로 위아래로
       * 나눠 봤더니 숫자 하나(아래 공백 524 → 286)는 좋아졌는데, 스크린샷에서는 제목만
       * 위에 떠 있고 그 아래 320px 공백이 생겼다 — **공백을 아래에서 위로 옮긴 것**
       * 뿐이었다. 「횡하다」는 공백의 위치 문제가 아니라 **글이 아무 데도 묶여 있지
       * 않은 것**이었다.
       *
       * 그래서 지금 처방은 둘이다: 폭은 규격의 좁은 칸(960)으로 모으고, 내용은 제목
       * 바로 아래에서 **한 덩어리(카드)로 끝낸다.** 그러면 아래 공백은 「빈 구멍」이
       * 아니라 페이지의 여백으로 읽힌다. 새 토큰·새 값 0개(기존 표면 조합).
       */
      /*
       * ⚠️ **두 번째 처방도 화면이 반박했다** (2026-08-12, 소유자 스크린샷).
       *
       * 카드로 묶는 것만으로는 부족했다 — 실측(1512×900, 잎 요소만 잰 잉크 상자):
       * `1368×313 @(104,56)` 즉 **위에 붙어 옆으로 벽까지 퍼지고 아래로 531px**
       * (화면의 59%)이 비었다. 소유자: *"우측/하단 공백이 너무 심하고"*.
       *
       * 소유자가 가리킨 답은 같은 앱 안에 이미 있었다 — **조립대의 입구 화면**.
       * 같은 뷰포트에서 그 화면의 잉크 상자는 `482×318 @(489,291)`: 좌 489 / 우 541,
       * 상 291 / 하 291 — **가운데에 세워져 있다.** 공백의 양이 아니라 **글이
       * 화면에 묶여 있는가**가 다른 것이다.
       *
       * 그래서 같은 전략을 쓴다: 남는 높이를 이 덩어리가 소유하고(`flex-1` +
       * 가운데 정렬), 칸은 조립대와 같은 좁은 폭으로 모은다. 새 토큰·새 값 0개.
       */
      className={`${PAGE_COLUMN_STAGE} flex flex-col gap-6 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-6 py-6`}
    >
      {/* ⚠️ 여기 별도 헤드라인을 두지 않는다. 한 번 넣었다가 `screen-hierarchy`
          게이트가 잡았다 — 「페이지 제목보다 크거나 같은 글자가 제목 밖에 없다」.
          그리고 게이트가 옳았다: 그 문장("내 에이전트가 어떤 스킬을…")은 페이지
          제목과 그 아래 한 줄이 이미 하는 말이었다. 제목은 하나다. */}
      <p className="text-body-lg leading-prose text-[color:var(--color-text-secondary)]">
        {t("emptyBody")}
      </p>

      {/* 세 질문 — 이 화면이 다른 어디서도 답하지 않는 것. 번호가 순서를 말한다. */}
      <ol className="grid gap-y-4">
        {answers.map((answer, index) => (
          <li key={answer.key} className="flex flex-col gap-1.5">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-label text-[color:var(--color-text-quaternary)]">
                {index + 1}
              </span>
              <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t(answer.q)}
              </span>
            </span>
            <span className="text-body leading-prose text-[color:var(--color-text-tertiary)]">
              {t(answer.key)}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="md" variant="primary" onClick={onOpenFolder} data-testid="skills-empty-open">
          {t("openFolder")}
        </Button>
        <Button size="md" variant="outline" onClick={onOpenSample} data-testid="skills-open-sample">
          {t("openSample")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-body leading-prose text-[color:var(--color-text-quaternary)]">
        <span>{t("emptyHint1")}</span>
        <span>{t("emptyHint2")}</span>
        <span>{t("emptyHint3")}</span>
      </div>
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

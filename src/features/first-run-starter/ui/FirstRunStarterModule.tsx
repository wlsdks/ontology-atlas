"use client";

import {
  Fragment,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useSampleSource } from "@/features/vault-sample-source";
import { VaultOpenGuideSheet } from "@/features/docs-vault-local";
import { CompactCopyButton } from "@/shared/ui";

import { useFirstRunStarter } from "../model/use-first-run-starter";
import {
  readVaultGuideAutoOpened,
  writeVaultGuideAutoOpened,
} from "../model/vault-guide-auto-open";

/**
 * P1a-2 승격 (design-council B6 rank17, 2026-07) — 도메인/역량/요소의
 * 유일한 평문 정의(`searchWidgets.shortcuts.glossary.*`)가 "?" 단축키
 * 모달 footer 에만 있어 비개발자 첫 접촉에서 안 보였다(진입 마찰). 새
 * 카피를 쓰지 않고 같은 i18n 키를 여기 INDEX 첫실행 카드에서도 읽어
 * 항상 보이게 승격한다 — 카드와 ShortcutSheet(`src/widgets/shortcut-sheet`)
 * 가 같은 메시지 키를 참조하므로 drift 가 나면 두 표면이 동시에 틀어져
 * 바로 드러난다. 순서 배열은 지도 계층 순서(도메인 → 역량 → 요소)와
 * 같게 로컬로 한 번 더 선언 — features 는 widgets 를 import 할 수 없어
 * (FSD 역방향 금지) ShortcutSheet 의 상수를 그대로 가져올 수 없다.
 */
const GLOSSARY_TERMS = ["domain", "capability", "element"] as const;

export interface FirstRunStarterModuleProps {
  /** 실데이터 census — TopologyIndexPanel 이 이미 받는 값 그대로 전달. */
  concepts: number;
  relations: number;
  domains: number;
  /**
   * 2026-07-24 온보딩 라운드 — "2분 구경하기" 투어 CTA. 투어 상태기계는
   * HomePage(view) 소유라 콜백만 받는다(FSD: feature 는 view 를 모른다).
   * 생략하면 CTA 를 렌더하지 않는다.
   */
  onStartTour?: () => void;
  /**
   * 2026-07-24 온보딩 라운드 — 톱니 메뉴 안에만 있던 '일반(쉬운 말)' 보기를
   * 첫 실행 카드에서 1클릭으로 켠다. 콜백이 있으면 힌트 문장 대신 토글
   * 버튼을 렌더하고, 이미 켜져 있으면(audiencePlain) 아무것도 안 보여준다.
   */
  onEnablePlainMode?: () => void;
  audiencePlain?: boolean;
  /**
   * INDEX 본문 (2026-07-24 구조 개편) — 가이드 카드와 **배타적으로** 그린다.
   * 카드가 펼쳐져 있으면 children 을 렌더하지 않아 패널 스크롤이 항상 1개다
   * (소유자 지적: "상단 스크롤 따로 하단 스크롤 따로"). 사용자가 선택하면
   * 카드가 접히고 children(INDEX)이 열린다.
   */
  children?: ReactNode;
}

/**
 * P1-① (2026-07-21 리텐션 라운드) — 코드베이스 자동 부트스트랩
 * (`node $ATLAS/cli/src/index.mjs bootstrap` = analyze_repo_structure + infer_imports 를
 * agent 없이 한 줄로) 은 실존하고 정확히 테크리드 페르소나가 원하던
 * 기능인데, 웹 첫 화면 어디에도 그 경로 안내가 없었다 — CLI/에이전트
 * 전용으로만 숨어 있어 "나중에"로 미뤄지고 재방문이 끊겼다. 새 표면을
 * 만들지 않고 이 카드 안에 명령 복사 한 줄만 추가한다.
 */
// CLI 는 npm 으로 배포하지 않는다 (docs/DECISIONS.md 2026-07-27) — 이 명령은
// ontology-atlas 소스 체크아웃 안에서 돈다. "언젠가 npx 가 된다"는 분기를
//남겨 두면 그건 영원히 안 오는 미래 시제고, 읽는 사람에게는 거짓말이다.
const CLI_BOOTSTRAP_COMMAND =
  "node cli/src/index.mjs init && node cli/src/index.mjs bootstrap";

/** 플랫폼은 세션 중 바뀌지 않는다 — 구독할 것이 없다. */
const subscribeNever = () => () => {};
const readApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const readApplePlatformOnServer = () => false;

/**
 * INDEX 패널(TopologyIndexPanel) 맨 위에 통합되는 "시작하기" 모듈 —
 * 승인 계약: `docs/prototypes/first-run-v3-flagship.html` (2026-07-18,
 * "관제탑 첫 기동" v3). 플로팅 표면 0개 — 중앙 카드(반려)와 하단 커맨드독
 * (중간 반려) 둘 다 폐기하고 기존 INDEX 패널 안에 자리를 잡는다.
 *
 * vault 미선택 + 정적 모드 + 세션 내 미dismiss 일 때만 렌더(`visible`,
 * `useFirstRunStarter`). 그 외엔 null — INDEX 는 원래 모습(검색 + 트리)
 * 그대로.
 */
export function FirstRunStarterModule({
  concepts,
  relations,
  domains,
  onStartTour,
  onEnablePlainMode,
  audiencePlain = false,
  children,
}: FirstRunStarterModuleProps) {
  const t = useTranslations("firstRunStarter");
  // rank17 — ShortcutSheet 와 같은 i18n 네임스페이스를 그대로 재사용
  // (`searchWidgets.shortcuts.glossary.*`). 새 카피 0, 단일 출처.
  const glossary = useTranslations("searchWidgets.shortcuts.glossary");
  const {
    visible,
    dismissed,
    sampleModeSettled,
    dismiss,
    undismiss,
    openFolder,
    createVault,
    busy,
    scaffolding,
    errorText,
    fsaUnsupported,
  } = useFirstRunStarter();
  const { state: cliCopyState, copy: copyCliCommand } = useCopyFeedback();
  // 진입 검수 E-10 — 「첫  실행」·「지금은  샘플」·「지도에서  쓰는  말」. i18n
  // 문자열의 공백은 하나였다. 벌어진 것은 라틴 전용 장식(mono + uppercase +
  // wide tracking)을 한글에 얹은 자리의 공백 글리프다(실측 자간 1.36~2.09px).
  const eyebrowWide = useLatinEyebrow("tracking-[0.22em]");
  const eyebrow = useLatinEyebrow("tracking-[0.18em]");
  const eyebrowTight = useLatinEyebrow("tracking-[0.16em]");
  // P0 공감형 샘플 vault (2026-07) — 비개발자가 dogfood(이 도구 자기 설명)
  // 대신 즉시 알아볼 수 있는 예시 비즈니스를 고를 수 있는 첫 실행 선택.
  // static 모드에서만 소비(local 모드는 useOntologyInsight 가 이 값을
  // 무시한다).
  const [sampleSource, setSampleSource] = useSampleSource();
  // 온보딩 디자이너 지적 — npx 명령 블록이 비개발자(기획/마케팅/리더십)
  // 첫 화면에 상시 노출돼 시선을 뺏었다. 기본 접힘 disclosure 뒤로 보내
  // 개발자만 펼쳐 보게 한다. 카드가 리마운트될 때까지 세션 내 상태.
  const [cliOpen, setCliOpen] = useState(false);
  // 2026-07-24 온보딩 라운드 — 폴더 CTA 가 사전 설명 0으로 OS 선택창을
  // 직행해 첫 사용자가 무엇을 골라야 하는지 몰랐다. 두 CTA 모두 안내
  // 시트를 먼저 거친다(이 카드는 vault 미선택 신규 사용자에게만 렌더
  // 되므로 숙련 사용자에게 시트를 강요하는 문제가 없다).
  const [guideOpen, setGuideOpen] = useState(false);
  // 접힘 상태 (2026-07-24 구조 개편) — 카드가 패널을 차지할지, 접혀서
  // INDEX 에 자리를 넘길지. 사용자가 "무엇을 볼지" 를 고른 순간(샘플 전환)
  // 접어 데이터로 넘긴다. dismiss 는 세션 영구, 이건 세션 내 토글.
  const [collapsed, setCollapsed] = useState(false);
  // PO 카운슬 2026-08-02 — `⌘O` 배지는 **맥에서만** 참이다. 이 앱의 폴더 열기
  // 단축키는 `{ key: "o", meta: true }` 하나뿐이고(HomePage 단축키 표) 대응
  // 하는 Ctrl+O 바인딩이 없다. 웹 관문의 핵심 청중이 Windows/Linux 인데 없는
  // 키를 광고하면 그건 힌트가 아니라 거짓 글리프다.
  //
  // 정적 export 는 서버에서 플랫폼을 모르므로 서버 스냅샷은 항상 `false`(배지
  // 없음)다 — `useEffect` + `setState` 대신 `useSyncExternalStore` 를 쓰는
  // 이유가 그것이다. 값이 바뀌지 않는 읽기라 구독은 no-op 이고, 하이드레이션
  // 불일치 없이 첫 클라이언트 렌더에서 정답이 나온다.
  const applePlatform = useSyncExternalStore(
    subscribeNever,
    readApplePlatform,
    readApplePlatformOnServer,
  );

  // 폴더-우선 첫 방문 (소유자 지시 2026-07-24) — 첫 화면을 열자마자 폴더
  // 지정 유도(시트)가 첫 액션이 된다. "다음에"로 건너뛰면 자동 투어가
  // 이어받는다(투어 가드가 시트 열림 동안 발화를 미룸). 1회 한정.
  // 진입 검수 E-1 — File System Access 미지원 브라우저에서는 이 시트를 자동으로
  // 열지 않는다. 시트의 존재 이유는 "OS 선택창이 뜨기 전에 미리 설명하는 것"인데
  // 그 창이 오지 않으므로, 첫 화면을 여는 순간 못 하는 일을 권하는 모달이 된다.
  // 이 상태의 안내는 카드 안 인라인 고지(unsupportedNotice + macOS 앱)가 맡는다.
  useEffect(() => {
    if (!visible || fsaUnsupported || readVaultGuideAutoOpened()) return undefined;
    const id = window.setTimeout(() => {
      writeVaultGuideAutoOpened();
      setGuideOpen(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [visible, fsaUnsupported]);

  // 되돌아오기 (소유자 실사용 지적 2026-07-24) — "여기서 둘러볼게요"로
  // 카드를 닫고 예시 비즈니스를 구경하다 보면 세션 내 처음으로 돌아갈
  // 길이 없었다. 카드가 있던 자리에 조용한 1행을 남긴다.
  const reopenRow = (
    <div className="shrink-0 border-b border-[color:var(--topology-v2-panel-divider)] px-4 py-2">
      <button
        type="button"
        data-testid="first-run-starter-reopen"
        onClick={() => {
          setCollapsed(false);
          undismiss();
        }}
        className="flex w-full items-center gap-1.5 text-label text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)]"
      >
        <ChevronRight size={11} aria-hidden className="shrink-0 -rotate-180" />
        {t("reopenLabel")}
      </button>
    </div>
  );

  // 가이드가 없는 상태(로컬 vault 등) — INDEX 만.
  if (!visible && !(sampleModeSettled && dismissed)) return <>{children}</>;
  // 가이드를 닫았거나 접은 상태 — 되돌아오기 1행 + INDEX.
  if (!visible || collapsed) {
    return (
      <>
        {reopenRow}
        {children}
      </>
    );
  }

  return (
    <div
      data-testid="first-run-starter"
      // min-h-0 + overflow-y-auto (소유자 실보고 2026-07-24) — 카드는 INDEX
      // 패널(flex-col h-full)의 고정 블록이라, 낮은 창에서는 카드가 공간을
      // 다 먹고 아래(검색·트리)로 갈 방법이 없었다. 공간이 부족하면 카드가
      // 줄어들며 내부 스크롤로 전환된다(충분하면 종전과 동일).
      className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent px-4 pb-3.5 pt-4"
    >
      {/* PO 카운슬 2026-08-02 — 실측 하단 공백이 806px 창에서 25.4%(982px
          풀스크린 환산 ≈38%) 였다. 위는 빽빽하고 아래가 빈다. 이 래퍼가
          `min-h-full` 로 패널 높이를 채우고 참조 블록(용어사전 + 개발자
          disclosure)이 `mt-auto` 로 바닥에 서면, 그 여백은 카드의 꼬리가
          아니라 **행동층과 참조층 사이의 설계된 간격**이 된다.
          래퍼가 필요한 이유: 루트는 스크롤 컨테이너(`overflow-y-auto`)라
          여기에 flex 를 얹으면 낮은 창에서 자식들이 눌린다. 높이가 자동인
          내부 래퍼에 `min-h-full` 을 주면 내용이 길 때는 그대로 자라고,
          짧을 때만 바닥 정렬이 작동한다. */}
      <div className="flex min-h-full flex-col">
      {/* 페르소나 재조사 개선 후보 2 (2026-07-23) — 첫 실행 카드가 "이
          화면이 뭘 하는지"만 말하고 "이 제품이 뭔지"(이름)는 말하지
          않아 완전 초심자에게 정체성 공백이 있었다. 로고 마크 없이
          텍스트 워드마크 한 줄만 더한다 — 기존 미션 문장(contextBold)이
          이미 "지도"라는 개념을 설명하므로 별도 미션 반 문장은 중복이라
          판단해 넣지 않는다. */}
      <p
        data-testid="first-run-starter-brand"
        className="mb-1 text-caption font-medium tracking-[0.01em] text-[color:var(--topology-v2-panel-text-quaternary)]"
      >
        {t("brand")}
      </p>
      {/* 상태 신호는 둘이다 (PO 카운슬 2026-08-02) — 「첫 실행」(언제인가)과
          「지금은 샘플」(누구의 데이터인가). 앰버 점은 전에 왼쪽 「첫 실행」
          옆에 있어 색이 홀로 세 번째 신호처럼 읽혔다. 점을 자기 문장 옆으로
          옮겨 **한 클러스터**로 묶는다 — 색과 말이 같은 것을 가리킨다. */}
      <p
        className={`mb-3 flex items-center gap-2 text-caption text-[color:var(--topology-v2-panel-text-secondary)] ${eyebrowWide}`}
      >
        {t("caption")}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-caption text-[color:var(--color-status-warning)] ${eyebrowTight}`}
        >
          <span className="relative h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-[color:var(--color-status-warning)]" />
            <span className="absolute -inset-[3px] rounded-full border border-[color:var(--color-amber-source-a42)]" />
          </span>
          {t("sampleLabel")}
        </span>
      </p>

      <p
        data-testid="first-run-starter-context"
        className="mb-4 text-body leading-body text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {/* 계기를 강등하면 카드의 최대 활자가 리드와 CTA 라벨로 **동률**이
            된다(둘 다 12.5px semibold). 주목 승자는 하나여야 하므로 리드만
            램프 한 단 위(`text-body-lg` 14px)로 올린다 — 짝 행간을 같이
            싣지 않으면 12.5px 단의 20px 행간이 남으므로 명시한다
            (`design.md` "크기 스텝이 자기 행간을 싣는다"). 새 토큰 0개.

            `block` 인 이유는 실측 결함이다: 인라인으로 두면 크기 전환이
            **문장 중간**에서 일어나 리드의 마지막 음절이 다음 줄로 떨어지고
            그 뒤에 작은 활자가 곧바로 붙었다("…보는 지도예 / 요. 내 마크다운
            폴더를…"). 한 줄 안에서 두 크기와 두 행간이 겹치는 자리다. 크기
            전환은 줄 경계에서만 일어나게 한다. */}
        <b className="mb-1.5 block text-body-lg font-semibold leading-body-lg text-[color:var(--topology-v2-panel-text-primary)]">
          {t(sampleSource === "storefront" ? "contextStorefrontBold" : "contextBold")}
        </b>
        {t(sampleSource === "storefront" ? "contextStorefrontRest" : "contextRest")}{" "}
        {/* PO 카운슬 2026-08-02 — 이 카드의 33개 문자열에 「에이전트」·「MCP」·
            「AI」가 0회였다. 앱 전체는 179곳이 쓰는데 **첫 접점만** 정체성
            선언이 비어, 굵은 리드가 다른 마크다운 지도 도구와 구분되지 않았다.
            새 개념을 도입하지 않고 투어 4단계가 이미 쓰는 어휘로 한 문장. */}
        <span data-testid="first-run-starter-agent-clause">{t("agentClause")}</span>
      </p>

      {/* P0 공감형 샘플 vault — dogfood(이 도구 자기 설명) 는 비개발자에게
          와닿지 않는다는 실측 문제의 완화책. 즉시 알아볼 수 있는 예시
          비즈니스("온라인 쇼핑몰")로 한 클릭 전환. 기존 "전체 | 최근 변경"
          세그먼트(TopologyIndexPanel)와 같은 토큰/구조를 재사용.

          semantics 정정 (PO 카운슬 2026-08-02): `role="tab"` 이었는데 클릭이
          탭 패널을 바꾸는 게 아니라 **카드를 접었다** — 이미 선택된 탭을
          눌러도 접혔다. 탭이 자기 화면을 없애는 것은 tablist 계약이 아니다.
          전환 시 접히는 동작(2026-07-24 핸드오프 설계)은 유지하되 semantics
          를 선택 컨트롤(`aria-pressed`)로 바로잡고, 같은 선택의 재클릭은
          아무 일도 하지 않는다. */}
      <div
        role="group"
        aria-label={t("sampleSourceAria")}
        data-testid="first-run-starter-sample-source"
        className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
      >
        {/* 순서가 곧 기본값이다 — 처음 온 사람은 왼쪽을 먼저 읽는다. 그래서
            예시 비즈니스가 앞, 이 앱 자신의 코드가 뒤다. 두 버튼이 글자만
            다르고 나머지가 같아 데이터로 돌린다(둘 중 하나만 고치는 drift 방지). */}
        {(
          [
            { source: "storefront", label: "sampleSourceStorefront", tip: "sampleSourceStorefrontTip" },
            { source: "dogfood", label: "sampleSourceDogfood", tip: "sampleSourceDogfoodTip" },
          ] as const
        ).map(({ source, label, tip }) => (
          <button
            key={source}
            type="button"
            aria-pressed={sampleSource === source}
            title={t(tip)}
            data-testid={`first-run-starter-sample-source-${source}`}
            onClick={() => {
              if (source === sampleSource) return;
              setSampleSource(source);
              setCollapsed(true);
            }}
            className={`touch-hit-expand min-w-0 truncate rounded-[var(--chrome-radius-inner)] px-2 py-1 text-label transition-colors ${
              sampleSource === source
                ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
                : "text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {/* 계기 강등 (PO 카운슬 2026-08-02) — 개념/관계/도메인 수는 3분할 인셋
          계기 블록(19px mono semibold)이었고, 실측상 **카드 안 최대 활자이자
          최고 휘도**였다. 계기 대접은 사용자 **자신의** 볼트가 열렸을 때의
          것이다. 이 카드는 그 전에만 렌더되므로 여기서 가장 센 잉크가 남의
          샘플 크기인 것은 「지금은 샘플」을 네 번 말하는 화면의 자기모순이다.
          숫자의 출처는 그대로다 — `topologyCanonicalCensus` 파생이 props 로
          들어오고, 고정 숫자 금지(2026-08-01 원장)는 여전히 지켜진다. */}
      <p
        data-testid="first-run-starter-sample-scale"
        className="mb-4 text-label leading-label text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {t("sampleScale", { concepts, relations, domains })}
        {/* 집계 셋보다 실제 엣지 하나가 「관계」를 더 가르친다(지킴이). 다만
            질의된 사실인 척하지 않는다 — 배선 0, 예시 어법의 정적 문장이다.
            쇼핑몰 샘플에는 실제로 `domains/order` relates `domains/fulfillment`
            가 있다. dogfood 는 억지 대칭을 만들지 않고 비운다. */}
        {sampleSource === "storefront" ? (
          <span className="block text-[color:var(--topology-v2-panel-text-quaternary)]">
            {t("sampleRelationExample")}
          </span>
        ) : null}
      </p>

      {fsaUnsupported ? (
        /* ease-of-use G1 (2026-07-23) — Safari/Firefox 는 File System Access
           API 가 없어 폴더 열기·새 vault 만들기 둘 다 눌러야만 실패했다(가장
           눈에 띄는 인디고 버튼이 에러 한 줄로 끝나는 첫인상). 사전에 정직하게
           강등: 미지원 고지 한 줄 + macOS 앱(/download) 링크로 치환. */
        <div
          data-testid="first-run-starter-unsupported"
          className="rounded-lg border border-[color:var(--topology-v2-panel-divider)] bg-[color:rgba(6,6,9,0.45)] px-3 py-2.5"
        >
          <p className="text-label leading-label text-[color:var(--topology-v2-panel-text-tertiary)]">
            {t("unsupportedNotice")}
          </p>
          <Link
            href="/download/"
            data-testid="first-run-starter-unsupported-cta"
            className="mt-2 inline-flex items-center gap-1.5 text-body font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {t("unsupportedCta")}
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          disabled={busy}
          data-testid="first-run-starter-open"
          className="touch-hit-expand relative flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-brand)] text-body font-semibold text-white shadow-[inset_0_1px_0_var(--color-overlay-3)] transition-colors hover:bg-[color:var(--color-indigo-accent)] disabled:opacity-60"
        >
          <FolderOpen size={14} aria-hidden />
          {busy && !scaffolding ? t("openBusy") : t("openLabel")}
          {applePlatform ? (
            <span className="rounded border border-b-2 border-white/35 px-1.5 py-px font-mono text-caption font-medium opacity-80">
              ⌘O
            </span>
          ) : null}
        </button>
      )}

      {/* 2026-07-24 온보딩 라운드 — 투어 진입점이 우측 레일 아이콘 하나뿐
          이라 비개발자가 발견하지 못했다(라이브 답사 실측). 폴더 열기(1차
          CTA) 바로 아래 2차 CTA 로 승격 — "열기 전에 구경부터" 경로. */}
      {onStartTour ? (
        <button
          type="button"
          data-testid="first-run-tour-cta"
          onClick={onStartTour}
          className="touch-hit-expand mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[color:var(--topology-v2-panel-divider)] text-body text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
        >
          {t("tourCta")}
        </button>
      ) : null}

      <p className="mb-1 mt-3 flex items-center justify-between gap-4 text-label">
        {fsaUnsupported ? (
          <span aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            disabled={busy}
            data-testid="first-run-starter-create"
            className="touch-hit-expand border-b border-transparent pb-px text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            {scaffolding ? t("createBusy") : t("createLabel")}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          data-testid="first-run-starter-dismiss"
          className="touch-hit-expand border-b border-transparent pb-px text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {t("dismissLabel")}
        </button>
      </p>

      {/* P2 결함③ (사용성 전수 검수 2026-07-23) — 비개발자가 기어 속 "보기
          모드" 토글의 존재를 알 방법이 0 이었다. 2026-07-24 온보딩 라운드:
          콜백이 오면 힌트 문장을 1클릭 토글 버튼으로 승격("톱니에서 켜세요"
          라는 원거리 안내 자체가 마찰이었다). 콜백이 없으면 종전 힌트 유지. */}
      {onEnablePlainMode ? (
        audiencePlain ? null : (
          <button
            type="button"
            data-testid="first-run-plain-toggle"
            onClick={onEnablePlainMode}
            className="touch-hit-expand mt-1 text-label text-[color:var(--color-indigo-accent)] underline-offset-2 transition-colors hover:underline"
          >
            {t("plainModeCta")}
          </button>
        )
      ) : (
        <p
          data-testid="first-run-starter-plain-mode-hint"
          className="mt-1 text-label leading-label text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {t("plainModeHint")}
        </p>
      )}

      {/* 진입 검수 E-1 — 이전에는 브라우저 원문 문자열(`errorText`)이 사용자
          문구 자리를 통째로 차지했다. `window.showDirectoryPicker is not a
          function` 은 사람이 읽고 다음 행동을 고를 수 있는 문장이 아니다.
          이제 사람 말 한 줄이 먼저 서고, 원인 문자열은 그 아래 조용한 단서로
          남는다 — 원인을 버리지 않으면서 읽는 순서를 뒤집었다.
          2026-08-02 — 참조 블록이 바닥으로 내려가면서 이 경고가 카드 끝까지
          밀려나 자기가 설명하는 버튼과 멀어졌다. 행동층 안에 둔다. */}
      {errorText !== null ? (
        <div role="alert" className="mt-2">
          <p className="text-label text-[color:var(--color-status-danger)]">
            {t("errorFallback")}
          </p>
          {errorText ? (
            <p
              data-testid="first-run-starter-error-detail"
              className="mt-0.5 break-words text-label leading-label text-[color:var(--topology-v2-panel-text-quaternary)]"
            >
              {errorText}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 참조층 (PO 카운슬 2026-08-02) — 용어사전과 개발자 disclosure 는
          "지금 할 일"이 아니라 "필요할 때 보는 것"이다. `mt-auto` 로 바닥에
          세워 행동층과 사이에 간격을 만든다. 빈 자리는 그대로 둔다 —
          채우라는 처방이 아니라 층을 가르라는 처방이다. */}
      <div className="mt-auto">
      {/* rank17 (design-council B6) — 도메인/역량/요소 3-용어 정의를 "?"
          단축키 모달에서 이 첫실행 카드로 승격. disclosure 뒤에 숨기지
          않고 항상 보이는 3줄 — 완전 초심자가 지도를 처음 열자마자 세
          단어의 뜻을 알 수 있어야 하는 표면이라 접힘 대상이 아니다. */}
      <div className="mt-4 border-t border-[color:var(--topology-v2-panel-divider)] pt-3">
        <p
          className={`mb-1.5 text-caption text-[color:var(--topology-v2-panel-text-quaternary)] ${eyebrow}`}
        >
          {glossary("title")}
        </p>
        {/**
         * **용어 칸의 폭은 설계 결정이지 단어 길이의 부산물이 아니다**
         * (2026-07-29 도그푸딩, 영어 화면 실측).
         *
         * 초안은 `flex flex-wrap` 이라 정의가 용어 **바로 뒤**에 붙었다. 한국어는
         * 용어가 2~3자로 고르니 `=` 가 우연히 줄맞춤돼 보였지만, 영어에서는
         * 용어 길이가 제각각(Domain 38px · Capability 50px · Element 41px)이라
         * `=` 가 173.9 / 186 / … 로 흩어졌고, **세 번째 줄은 정의가 통째로 다음
         * 줄로 떨어져** 용어 칸 왼쪽 끝에서 다시 시작했다:
         *
         *     Element =
         *     A piece of code or a doc that implements it
         *
         * 두 줄은 `용어 = 정의` 로 읽히는데 한 줄만 다른 문법이 된다.
         *
         * 2열 그리드로 바꾼다 — 용어 열은 가장 긴 용어에 맞춰 한 번 정해지고
         * (`auto`), 정의 열이 나머지를 받는다. 정의가 길어 두 줄이 돼도 용어
         * 열 안에 머무르지 않고 자기 열에서만 접힌다. 어느 언어에서도 `=` 가
         * 한 줄에 선다.
         */}
        {/**
         * 열 정의를 **인라인 스타일로 쓴다.** `grid-cols-[auto_auto_1fr]` 로
         * 먼저 썼더니 Tailwind 가 그 유틸리티를 **생성하지 않았고**, 클래스는
         * 문자열로 남은 채 `grid-template-columns` 가 `none` 이 돼서 세 칸이
         * 한 열로 쌓였다 — 화면은 조용히 더 나빠졌는데 타입·lint·계약 테스트가
         * 전부 통과했다. `design.md` 가 타입 램프에서 적어 둔 *"미정의 스텝은
         * 침묵한다 — 존재하지 않는 것은 리터럴도 남기지 않으므로 하드코딩
         * 검사의 시야 밖"* 이 유틸리티 계열만 바꿔 그대로 재현된 것이다.
         *
         * 인라인 값은 존재하지 않을 수가 없다. `minmax(0, 1fr)` 는 정의 열이
         * 긴 문장 때문에 자기 최소 폭 아래로 안 줄어드는 것을 막는다(grid 의
         * 기본 `min-width: auto` 가 오버플로를 만든다).
         */}
        <dl
          data-testid="first-run-starter-glossary"
          style={{ gridTemplateColumns: "auto auto minmax(0, 1fr)" }}
          className="grid gap-x-1.5 gap-y-1 text-label leading-label"
        >
          {GLOSSARY_TERMS.map((term) => (
            <Fragment key={term}>
              <dt className="font-medium text-[color:var(--topology-v2-panel-text-secondary)]">
                {glossary(`${term}Term`)}
              </dt>
              <span
                aria-hidden="true"
                className="text-[color:var(--topology-v2-panel-text-quaternary)]"
              >
                =
              </span>
              <dd className="text-[color:var(--topology-v2-panel-text-tertiary)]">
                {glossary(`${term}Definition`)}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>

      {/* P1-① — 코드베이스 자동 부트스트랩(CLI/에이전트 전용)으로 가는 다리.
          위 두 버튼(폴더 열기 / 새 vault 만들기)은 빈 vault 를 여는 경로일
          뿐, "내 리포를 분석해서 채워줘"에는 답하지 못한다 — 그 답은
          `node $ATLAS/cli/src/index.mjs bootstrap` 인데 웹 첫 화면엔 안내가 전혀 없었다.
          온보딩 디자이너 지적: 기본 접힘 disclosure 로 감춰 비개발자 시선에서
          제거하고, 펼친 사람만 명령을 본다.
          문구 정정 (PO 카운슬 2026-08-02): 라벨이 「코드베이스에서 자동으로
          시작하려면」(= 내 리포)이었는데 명령은 상대 경로라 **실행한 그 폴더**
          를 훑는다 — 소스 체크아웃 안에서 돌리면 atlas 자신을 부트스트랩한다.
          명령 자체는 CLI 공개 계약이라 이번 슬라이스 밖이고, 여기서는 문구를
          명령이 실제로 하는 일로 좁힌다(`cliBridgeSourceOnly` 의 정직한 고지와
          모순되지 않게). 토글도 직군 호명("개발자라면")에서 행위 호명으로. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCliOpen((open) => !open)}
          aria-expanded={cliOpen}
          aria-controls="first-run-starter-cli-bridge"
          data-testid="first-run-starter-cli-toggle"
          className="touch-hit-expand flex items-center gap-1 text-label text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronRight
            size={11}
            aria-hidden
            className={`transition-transform motion-reduce:transition-none ${
              cliOpen ? "rotate-90" : ""
            }`}
          />
          {t("cliBridgeToggle")}
        </button>
        {cliOpen ? (
          /* 소유자 실보고 2026-07-23 — 라벨·명령·복사 버튼이 한 행을 3분할해
             명령이 중간-단어 말줄임("npx ontology-atlas i…")으로 잘렸다.
             헤더행(라벨 + 복사)과 전폭 코드 라인(단어 경계 줄바꿈)으로 분리 —
             복사할 명령 전문이 항상 보인다. */
          <div
            id="first-run-starter-cli-bridge"
            data-testid="first-run-starter-cli-bridge"
            className="mt-2 rounded-md border border-[color:var(--topology-v2-panel-divider)] bg-[color:rgba(6,6,9,0.35)] px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 break-keep text-caption leading-tight text-[color:var(--topology-v2-panel-text-quaternary)]">
                {t("cliBridgeLabel")}
              </p>
              <CompactCopyButton
                copied={cliCopyState === "copied"}
                label={cliCopyState === "copied" ? t("cliBridgeCopied") : t("cliBridgeCopy")}
                ariaLabel={t("cliBridgeCopyAriaLabel")}
                onClick={() => void copyCliCommand(CLI_BOOTSTRAP_COMMAND)}
                data-testid="first-run-starter-cli-bridge-copy"
                className="-my-1.5 -mr-1.5 shrink-0"
              />
            </div>
            <p
              data-testid="first-run-starter-cli-source-only"
              className="mt-1.5 text-caption leading-relaxed text-[color:var(--color-text-tertiary)]"
            >
              {t("cliBridgeSourceOnly")}
            </p>
            <code className="mt-1 block whitespace-pre-wrap break-words font-mono text-label leading-label text-[color:var(--topology-v2-panel-text-secondary)]">
              {CLI_BOOTSTRAP_COMMAND}
            </code>
          </div>
        ) : null}
      </div>
      </div>
      </div>

      <VaultOpenGuideSheet
        open={guideOpen}
        unsupported={fsaUnsupported}
        onClose={() => setGuideOpen(false)}
        onPickExisting={() => {
          setGuideOpen(false);
          void openFolder();
        }}
        onCreateNew={() => {
          setGuideOpen(false);
          void createVault();
        }}
      />
    </div>
  );
}

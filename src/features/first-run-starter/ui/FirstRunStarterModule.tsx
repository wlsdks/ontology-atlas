"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useSampleSource } from "@/features/vault-sample-source";
import { CompactCopyButton } from "@/shared/ui";
import { useFirstRunStarter } from "../model/use-first-run-starter";

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
}

/**
 * P1-① (2026-07-21 리텐션 라운드) — 코드베이스 자동 부트스트랩
 * (`ontology-atlas bootstrap` = analyze_repo_structure + infer_imports 를
 * agent 없이 한 줄로) 은 실존하고 정확히 테크리드 페르소나가 원하던
 * 기능인데, 웹 첫 화면 어디에도 그 경로 안내가 없었다 — CLI/에이전트
 * 전용으로만 숨어 있어 "나중에"로 미뤄지고 재방문이 끊겼다. 새 표면을
 * 만들지 않고 이 카드 안에 명령 복사 한 줄만 추가한다.
 */
const CLI_BOOTSTRAP_COMMAND = "npx ontology-atlas init && npx ontology-atlas bootstrap";

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
}: FirstRunStarterModuleProps) {
  const t = useTranslations("firstRunStarter");
  // rank17 — ShortcutSheet 와 같은 i18n 네임스페이스를 그대로 재사용
  // (`searchWidgets.shortcuts.glossary.*`). 새 카피 0, 단일 출처.
  const glossary = useTranslations("searchWidgets.shortcuts.glossary");
  const {
    visible,
    dismiss,
    openFolder,
    createVault,
    busy,
    scaffolding,
    errorText,
    fsaUnsupported,
  } = useFirstRunStarter();
  const { state: cliCopyState, copy: copyCliCommand } = useCopyFeedback();
  // P0 공감형 샘플 vault (2026-07) — 비개발자가 dogfood(이 도구 자기 설명)
  // 대신 즉시 알아볼 수 있는 예시 비즈니스를 고를 수 있는 첫 실행 선택.
  // static 모드에서만 소비(local 모드는 useOntologyInsight 가 이 값을
  // 무시한다).
  const [sampleSource, setSampleSource] = useSampleSource();
  // 온보딩 디자이너 지적 — npx 명령 블록이 비개발자(기획/마케팅/리더십)
  // 첫 화면에 상시 노출돼 시선을 뺏었다. 기본 접힘 disclosure 뒤로 보내
  // 개발자만 펼쳐 보게 한다. 카드가 리마운트될 때까지 세션 내 상태.
  const [cliOpen, setCliOpen] = useState(false);

  if (!visible) return null;

  return (
    <div
      data-testid="first-run-starter"
      className="relative border-b border-[color:var(--topology-v2-panel-divider)] bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent px-4 pb-3.5 pt-4"
    >
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
      <p className="mb-3 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[color:var(--topology-v2-panel-text-secondary)]">
        <span className="relative h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-[color:var(--color-status-warning)]" />
          <span className="absolute -inset-[3px] rounded-full border border-[color:var(--color-amber-source-a42)]" />
        </span>
        {t("caption")}
        <span className="ml-auto text-[8.5px] tracking-[0.16em] text-[color:var(--color-status-warning)]">
          {t("sampleLabel")}
        </span>
      </p>

      <p className="mb-4 text-[12px] leading-[1.65] text-[color:var(--topology-v2-panel-text-tertiary)]">
        <b className="font-semibold text-[color:var(--topology-v2-panel-text-primary)]">
          {t("contextBold")}
        </b>{" "}
        {t("contextRest")}
      </p>

      <div className="mb-3 grid grid-cols-3 divide-x divide-[color:var(--topology-v2-panel-divider)] rounded-[9px] border border-[color:var(--topology-v2-panel-divider)] bg-[color:rgba(6,6,9,0.55)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
        <MeterCell value={concepts} label={t("meterConcepts")} />
        <MeterCell value={relations} label={t("meterRelations")} />
        <MeterCell value={domains} label={t("meterDomains")} />
      </div>

      {/* P0 공감형 샘플 vault — dogfood(이 도구 자기 설명) 는 비개발자에게
          와닿지 않는다는 실측 문제의 완화책. 즉시 알아볼 수 있는 예시
          비즈니스("온라인 쇼핑몰")로 한 클릭 전환. 기존 "전체 | 최근 변경"
          세그먼트(TopologyIndexPanel)와 같은 토큰/구조를 재사용. */}
      <div
        role="tablist"
        aria-label={t("sampleSourceAria")}
        data-testid="first-run-starter-sample-source"
        className="mb-4 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sampleSource === "dogfood"}
          data-testid="first-run-starter-sample-source-dogfood"
          onClick={() => setSampleSource("dogfood")}
          className={`min-w-0 truncate rounded-[var(--chrome-radius-inner)] px-2 py-1 text-label transition-colors ${
            sampleSource === "dogfood"
              ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
              : "text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
          }`}
        >
          {t("sampleSourceDogfood")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sampleSource === "storefront"}
          data-testid="first-run-starter-sample-source-storefront"
          onClick={() => setSampleSource("storefront")}
          className={`min-w-0 truncate rounded-[var(--chrome-radius-inner)] px-2 py-1 text-label transition-colors ${
            sampleSource === "storefront"
              ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
              : "text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
          }`}
        >
          {t("sampleSourceStorefront")}
        </button>
      </div>

      {fsaUnsupported ? (
        /* ease-of-use G1 (2026-07-23) — Safari/Firefox 는 File System Access
           API 가 없어 폴더 열기·새 vault 만들기 둘 다 눌러야만 실패했다(가장
           눈에 띄는 인디고 버튼이 에러 한 줄로 끝나는 첫인상). 사전에 정직하게
           강등: 미지원 고지 한 줄 + macOS 앱(/download) 링크로 치환. */
        <div
          data-testid="first-run-starter-unsupported"
          className="rounded-lg border border-[color:var(--topology-v2-panel-divider)] bg-[color:rgba(6,6,9,0.45)] px-3 py-2.5"
        >
          <p className="text-[11.5px] leading-[1.6] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {t("unsupportedNotice")}
          </p>
          <Link
            href="/download/"
            data-testid="first-run-starter-unsupported-cta"
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {t("unsupportedCta")}
            <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openFolder()}
          disabled={busy}
          data-testid="first-run-starter-open"
          className="relative flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-brand)] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_var(--color-overlay-3)] transition-colors hover:bg-[color:var(--color-indigo-accent)] disabled:opacity-60"
        >
          <FolderOpen size={14} aria-hidden />
          {busy && !scaffolding ? t("openBusy") : t("openLabel")}
          <span className="rounded border border-b-2 border-white/35 px-1.5 py-px font-mono text-[9px] font-medium opacity-80">
            ⌘O
          </span>
        </button>
      )}

      <p className="mb-1 mt-3 flex items-center justify-between gap-4 text-[11.5px]">
        {fsaUnsupported ? (
          <span aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => void createVault()}
            disabled={busy}
            data-testid="first-run-starter-create"
            className="border-b border-transparent pb-px text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            {scaffolding ? t("createBusy") : t("createLabel")}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          data-testid="first-run-starter-dismiss"
          className="border-b border-transparent pb-px text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {t("dismissLabel")}
        </button>
      </p>

      {/* P2 결함③ (사용성 전수 검수 2026-07-23) — 비개발자가 기어 속 "보기
          모드" 토글의 존재를 알 방법이 0 이었다. 배너/팝업 없이, dismiss 행
          바로 아래 조용한 한 줄로 유도 경로 하나만 확보한다. */}
      <p
        data-testid="first-run-starter-plain-mode-hint"
        className="mt-1 text-[10.5px] leading-[1.5] text-[color:var(--topology-v2-panel-text-quaternary)]"
      >
        {t("plainModeHint")}
      </p>

      {/* rank17 (design-council B6) — 도메인/역량/요소 3-용어 정의를 "?"
          단축키 모달에서 이 첫실행 카드로 승격. disclosure 뒤에 숨기지
          않고 항상 보이는 3줄 — 완전 초심자가 지도를 처음 열자마자 세
          단어의 뜻을 알 수 있어야 하는 표면이라 접힘 대상이 아니다. */}
      <div className="mt-3 border-t border-[color:var(--topology-v2-panel-divider)] pt-3">
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--topology-v2-panel-text-quaternary)]">
          {glossary("title")}
        </p>
        <dl data-testid="first-run-starter-glossary" className="space-y-1">
          {GLOSSARY_TERMS.map((term) => (
            <div
              key={term}
              className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-[1.5]"
            >
              <dt className="shrink-0 font-medium text-[color:var(--topology-v2-panel-text-secondary)]">
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
            </div>
          ))}
        </dl>
      </div>

      {/* P1-① — 코드베이스 자동 부트스트랩(CLI/에이전트 전용)으로 가는 다리.
          위 두 버튼(폴더 열기 / 새 vault 만들기)은 빈 vault 를 여는 경로일
          뿐, "내 리포를 분석해서 채워줘"에는 답하지 못한다 — 그 답은
          `ontology-atlas bootstrap` 인데 웹 첫 화면엔 안내가 전혀 없었다.
          온보딩 디자이너 지적: 기본 접힘 disclosure 로 감춰 비개발자 시선에서
          제거하고, 개발자만 "개발자라면 —" 을 펼쳐 명령을 본다. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCliOpen((open) => !open)}
          aria-expanded={cliOpen}
          aria-controls="first-run-starter-cli-bridge"
          data-testid="first-run-starter-cli-toggle"
          className="flex items-center gap-1 text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronRight
            size={11}
            aria-hidden
            className={`transition-transform duration-150 motion-reduce:transition-none ${
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
              <p className="min-w-0 break-keep text-[10px] leading-tight text-[color:var(--topology-v2-panel-text-quaternary)]">
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
            <code className="mt-1 block whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.6] text-[color:var(--topology-v2-panel-text-secondary)]">
              {CLI_BOOTSTRAP_COMMAND}
            </code>
          </div>
        ) : null}
      </div>

      {errorText !== null ? (
        <p
          role="alert"
          className="mt-2 text-[11px] text-[color:var(--color-status-danger)]"
        >
          {errorText || t("errorFallback")}
        </p>
      ) : null}
    </div>
  );
}

function MeterCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="py-2.5 text-center font-mono">
      <span className="block text-[19px] font-semibold leading-none text-[color:var(--topology-v2-panel-text-primary)]">
        {value}
      </span>
      <span className="mt-1.5 block text-[8px] uppercase tracking-[0.18em] text-[color:var(--topology-v2-panel-text-quaternary)]">
        {label}
      </span>
    </div>
  );
}

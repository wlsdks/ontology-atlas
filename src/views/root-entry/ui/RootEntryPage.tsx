"use client";

import { useSyncExternalStore } from "react";
import { Bot, HardDrive, Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/features/docs-vault-local";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { HomePage } from "@/views/home";
import { FirstRunPage } from "@/views/first-run";

/**
 * 루트 `/` 진입 분기 — vault 선택 여부에 따라 갈림:
 *
 * - **web vault 미선택 → HomePage 그대로 (정적 dogfood 샘플).** 판정
 *   (2026-07-18, `docs/prototypes/root-first-open-final.html` 승인
 *   docstring 근거, 시작하기 표면 형태는 v3 `first-run-v3-flagship.html`
 *   승인으로 대체): 셀프호스트한 사용자에게 "macOS 다운로드" 마케팅 랜딩은
 *   모순 — 지도가 곧 첫 화면이어야 한다(0-클릭 aha). `LandingPage`(구
 *   마케팅 랜딩)는 제거됐다 — 그 소개 콘텐츠는 `/download` 로 이관
 *   (Slice 2). "시작하기" 표면(폴더 열기/새 vault/SAMPLE 배지/우하단
 *   판독)은 이 페이지가 아니라 `HomePage` 안의 `TopologyIndexPanel`
 *   (INDEX 패널 맨 위, 플로팅 표면 0개)과 브랜드 pill 이 자체적으로
 *   담당한다 — `useFirstRunSampleModeSettled`(`@/features/first-run-starter`)
 *   가 vault 상태를 직접 읽어 스스로 켜고 끄므로, 이 페이지는 vault 유무만
 *   보고 컴포넌트를 고르면 된다(추가 분기 불필요).
 * - desktop vault 미선택 → FirstRunPage (Obsidian 계열 first-run — 열기/새로
 *   만들기/데모. 설치 앱은 홍보가 아니라 로컬 작업 진입)
 * - vault 선택됨(복원 포함) → HomePage. **재방문 계약**: 이미 쓰던 vault
 *   핸들이 IndexedDB 에서 복원되면 시작하기 모듈·SAMPLE 배지·우하단 판독
 *   전부 없이 곧장 본인 vault 허브로 — "맨날 들어와서 누르게 하지 않는다."
 *   아래 `vault.manifest` 체크가 이 분기를 web/desktop 공통으로 가장 먼저
 *   처리하고, INDEX 패널 쪽 게이트(`restoreAttempted && mode==='static'`)
 *   가 복원 완료 전 한 프레임 깜빡이는 것도 별도로 막는다(모듈 쪽 책임).
 *
 * **B3 허브가 곧 지도 (2026-07) — R3 dual-surface 결정 대체.** R3 는 `/` 와
 * `/ontology` 가 둘 다 (당시의) 트리/ego 허브 `OntologyViewPage` 를 따로
 * 렌더하는 의도적 dual-surface 였다. B3 는 "허브 = 지도" 로 hub 자체를
 * 재정의했으므로 — `/` 는 이제 `/topology` 와 같은 `HomePage` 를 그대로
 * 렌더한다 (지도 + INDEX + 데이터시트). `/ontology` 는 별도 라우트로 남되
 * 이제 얇은 redirect(`OntologyRedirectPage`) 로 같은 surface 에 수렴한다 —
 * 두 URL 이 여전히 다른 명시적 진입점이라는 R3 의 요지는 유지, 다만 도착지가
 * 하나의 지도-hub 로 합쳐졌다.
 */
export function RootEntryPage() {
  const vault = useLocalVault();
  const clientReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!clientReady) return <DesktopVaultRedirect />;
  if (vault.manifest) return <HomePage />;
  if (isDesktopShell()) {
    // restore 시도 전엔 중립 부트 프레임 유지 — 복원될 vault 가 있으면
    // FirstRun 이 한 프레임 스치는 것을 막는다.
    return vault.restoreAttempted ? <FirstRunPage /> : <DesktopVaultRedirect />;
  }
  return <HomePage />;
}

function DesktopVaultRedirect() {
  const t = useTranslations('rootEntry');
  const proofItems = [
    { icon: HardDrive, label: t('redirectFilesProof') },
    { icon: Network, label: t('redirectGraphProof') },
    { icon: Bot, label: t('redirectAgentProof') },
  ] as const;

  return (
    <main
      id="main"
      tabIndex={-1}
      aria-busy="true"
      className="flex min-h-full items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <section className="grid w-full max-w-2xl justify-items-center gap-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          {t('redirectEyebrow')}
        </p>
        <div className="grid gap-2">
          <h1 className="text-[26px] font-semibold leading-tight text-[color:var(--color-text-primary)] md:text-[32px]">
            {t('redirectTitle')}
          </h1>
          <p className="mx-auto max-w-xl text-[13px] leading-6 text-[color:var(--color-text-tertiary)]">
            {t('redirectBody')}
          </p>
        </div>
        <div className="grid w-full overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] sm:grid-cols-3">
          {proofItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex min-w-0 items-center gap-2 px-3 py-3 text-left ${
                  index > 0
                    ? "border-t border-[color:var(--color-border-soft)] sm:border-l sm:border-t-0"
                    : ""
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                  <Icon size={14} aria-hidden />
                </span>
                <span className="text-[11.5px] font-medium leading-5 text-[color:var(--color-text-secondary)]">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t('openingLocalVaultPicker')}
        </p>
      </section>
    </main>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { Bot, HardDrive, Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/features/docs-vault-local";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { HomePage } from "@/views/home";
import { FirstRunPage } from "@/views/first-run";
import { LandingPage } from "@/views/landing";

/**
 * 루트 `/` 진입 분기 — vault 선택 여부에 따라 두 surface 로 갈림:
 *
 * - web vault 미선택 → LandingPage (첫 인상 — "이게 뭔지" 5초 설명 + "내 폴더 열기" CTA)
 * - desktop vault 미선택 → FirstRunPage (Obsidian 계열 first-run — 열기/새로
 *   만들기/데모. 설치 앱은 홍보가 아니라 로컬 작업 진입)
 * - vault 선택됨 → HomePage (실제 hub — 지도 + INDEX + 데이터시트, `/topology`
 *   와 동일 컴포넌트)
 *
 * vault picker 자체는 별도 `/docs` 라우트. LandingPage 의 "내 마크다운 폴더
 * 열기" 버튼이 그 곳으로 보낸다.
 *
 * 데스크톱 셸에서는 restoreAttempted 이후 로드된 manifest 가 없을 때
 * LandingPage 를 렌더하지 않는다. 설치 앱의 `/` 는 자기 자신을 다운로드하라는
 * 마케팅이 아니라 첫 실행 진입점이어야 한다. 저장된 handle 이 stale path 로
 * 복원되어 manifest build 가 실패한 경우도 FirstRun 으로 떨어진다 (이전엔
 * `/docs/?intent=local` redirect — R+ 에서 in-place FirstRun 으로 교체).
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
  return <LandingPage />;
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
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
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

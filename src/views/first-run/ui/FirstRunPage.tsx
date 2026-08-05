"use client";

import { useCallback, useEffect } from "react";
import { Compass, FolderOpen, Orbit, Sparkles, Zap } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale, useTranslations } from "next-intl";
import { useJustStartVault, useLocalVault, useVaultCreateFlow } from "@/features/docs-vault-local";
import { Link } from "@/i18n/navigation";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { useToast } from "@/shared/ui/toast";

/**
 * 설치 앱 (데스크톱 셸) 첫 실행 — vault 미선택 상태의 `/`.
 *
 * 정체성 결함 교정: 설치된 앱이 자기 자신을 다운로드하라는 마케팅 랜딩을
 * 보여주던 것을, Obsidian 계열 도구처럼 "폴더 선택 → 바로 작업" 진입으로
 * 바꾼다. 웹 `/` 는 root-first-open(2026-07) 이후 지도(HomePage) 자체가
 * 첫 화면이라 이 페이지와 다른 문제를 푼다 — 분기는 RootEntryPage 의
 * isDesktopShell() 하나.
 *
 * 네 액션 모두 기존 흐름 재사용 (새 파이프라인 0):
 * - 볼트 폴더 열기 → useLocalVault().open() (Tauri picker / FSA picker)
 * - 새 볼트 만들기 → 같은 open() 뒤, 빈 폴더면 기존 scaffoldOntology()
 *   (`/docs` OntologyStarterCta 와 동일 액션) 로 starter 시드 작성
 * - **그냥 시작하기** (Tauri 런타임 한정, R+ "정직판" 데스크톱 자동 vault) →
 *   폴더 픽커 없이 `~/Documents/Ontology Atlas/<name>` 아래 실제 디스크 폴더를
 *   만들고 곧장 연결 (`useJustStartVault`). 실디스크라 MCP/Claude Code 같은
 *   에이전트가 그대로 접근 가능 — OPFS 를 쓰지 않는 게 이 설계의 핵심.
 *   dev 빌드에서 `?shell=desktop` 오버라이드로 이 페이지를 브라우저에서 열어볼
 *   수도 있으므로(`isDesktopShell()`), 이 카드는 실제 Tauri invoke 브리지
 *   (`isTauriVaultRuntime()`) 가 있을 때만 렌더 — 없으면 항목 자체 미표시.
 * - 데모 볼트 둘러보기 → `/docs/` 의 내장 dogfood 매니페스트 (vault 미선택
 *   fallback — 정적 빌드에 이미 포함)
 *
 * 디자인: DESIGN-SYSTEM v2 machined 언어 — `--color-panel` 표면 + 1px
 * border-soft 카드, 음각 mono trust line (`--engraved-numeral-*`, 실제 사실만),
 * 단일 인디고, 마케팅 산문/다운로드 CTA/스크린샷 0.
 */
export function FirstRunPage() {
  const t = useTranslations("firstRun");
  const toast = useToast();
  const vault = useLocalVault();
  // 두 생성 경로 모두 화면 언어의 스타터를 만든다 — 같은 행동이 진입 경로에
  // 따라 다른 언어의 볼트를 만들면 안 된다(흐름 점검 2026-07-26 D2).
  const locale = useLocale();
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault, locale);
  const {
    justStart,
    busy: justStartBusy,
    scaffolding: justStartScaffolding,
    actionError: justStartError,
    createdPath,
    clearCreatedPath,
  } = useJustStartVault(vault, locale);
  // dev 빌드의 `?shell=desktop` 오버라이드로 이 페이지를 일반 브라우저에서 열어
  // 볼 수 있다(`isDesktopShell()`) — 그런 경우 실제 Tauri invoke 브리지는 없으니
  // "그냥 시작하기" 는 렌더하지 않는다. 이 페이지 자체가 이미 클라이언트 전용
  // 마운트(RootEntryPage 의 clientReady 게이트) 뒤에만 렌더되므로 SSR/hydration
  // mismatch 걱정 없이 바로 호출해도 된다.
  const showJustStart = isTauriVaultRuntime();

  const busy =
    vault.status === "opening" ||
    vault.status === "loading" ||
    scaffolding ||
    justStartBusy;

  const handleOpen = useCallback(async () => {
    setActionError(null);
    await vault.open();
  }, [vault, setActionError]);

  useEffect(() => {
    if (!createdPath) return;
    toast.show(t("justStartToast", { path: createdPath }), "success");
    clearCreatedPath();
  }, [createdPath, clearCreatedPath, toast, t]);

  const errorText =
    justStartError !== null
      ? justStartError || t("errorFallback")
      : actionError !== null
        ? actionError || t("errorFallback")
        : vault.status === "error"
          ? vault.errorMessage ?? t("errorFallback")
          : null;

  const cardBase =
    "grid w-full grid-cols-[32px_1fr] items-start gap-3 rounded-chip border bg-[color:var(--color-panel)] px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset disabled:opacity-60";
  const iconChip =
    "flex h-8 w-8 items-center justify-center rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)]";

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-full items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <section className="grid w-full max-w-[440px] gap-6">
        <header className="grid justify-items-center gap-3 text-center">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
              <Orbit size={13} aria-hidden />
            </span>
            <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              Ontology Atlas
            </span>
          </div>
          <div className="grid gap-1.5">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <h1 className="break-keep text-display font-[var(--font-weight-signature)] leading-tight text-[color:var(--color-text-primary)]">
              {t("title")}
            </h1>
            <p className="mx-auto max-w-[360px] break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t("subtitle")}
            </p>
          </div>
        </header>

        <div className="grid gap-2" aria-busy={busy}>
          {showJustStart ? (
            <button
              type="button"
              onClick={() => void justStart()}
              disabled={busy}
              data-testid="first-run-just-start"
              className={`${cardBase} border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]`}
            >
              <span className={`${iconChip} text-[color:var(--color-indigo-accent)]`}>
                <Zap size={ICON_SIZE.md} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {justStartScaffolding
                    ? t("scaffolding")
                    : justStartBusy
                      ? t("justStartBusy")
                      : t("justStartTitle")}
                </span>
                <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                  {t("justStartBody")}
                </span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={busy}
            data-testid="first-run-open"
            className={`${cardBase} ${
              showJustStart
                ? "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                : "border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]"
            }`}
          >
            <span
              className={`${iconChip} ${
                showJustStart
                  ? "text-[color:var(--color-text-tertiary)]"
                  : "text-[color:var(--color-indigo-accent)]"
              }`}
            >
              <FolderOpen size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {(vault.status === "opening" || vault.status === "loading") && !scaffolding
                  ? t("busy")
                  : t("openTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                {t("openBody")}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy}
            data-testid="first-run-create"
            className={`${cardBase} border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]`}
          >
            <span className={`${iconChip} text-[color:var(--color-text-tertiary)]`}>
              <Sparkles size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {scaffolding ? t("scaffolding") : t("createTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                {t("createBody")}
              </span>
            </span>
          </button>

          <Link
            href="/docs/"
            data-testid="first-run-demo"
            className={`${cardBase} border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]`}
          >
            <span className={`${iconChip} text-[color:var(--color-text-tertiary)]`}>
              <Compass size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("demoTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                {t("demoBody")}
              </span>
            </span>
          </Link>
        </div>

        {errorText ? (
          <p
            role="alert"
            className="break-keep text-center text-label text-[color:var(--color-status-danger)]"
          >
            {errorText}
          </p>
        ) : null}

        <p
          data-token="engraved-numeral"
          className="text-center font-mono text-caption uppercase tracking-[var(--tracking-caps-16)]"
          style={{
            color: "var(--engraved-numeral-face)",
            textShadow: "var(--engraved-numeral-text-shadow)",
          }}
        >
          {t("trustLine")}
        </p>
      </section>
    </main>
  );
}

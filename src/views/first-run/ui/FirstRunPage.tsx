"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass, FolderOpen, Orbit, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/features/docs-vault-local";
import { Link } from "@/i18n/navigation";
import {
  shouldClearCreateIntent,
  shouldScaffoldAfterOpen,
} from "../model/first-run-create";

/**
 * 설치 앱 (데스크톱 셸) 첫 실행 — vault 미선택 상태의 `/`.
 *
 * 정체성 결함 교정: 설치된 앱이 자기 자신을 다운로드하라는 마케팅 랜딩을
 * 보여주던 것을, Obsidian 계열 도구처럼 "폴더 선택 → 바로 작업" 진입으로
 * 바꾼다. 웹 `/` 의 LandingPage 는 그대로 — 분기는 RootEntryPage 의
 * isDesktopShell() 하나.
 *
 * 세 액션 모두 기존 흐름 재사용 (새 파이프라인 0):
 * - 볼트 폴더 열기 → useLocalVault().open() (Tauri picker / FSA picker)
 * - 새 볼트 만들기 → 같은 open() 뒤, 빈 폴더면 기존 scaffoldOntology()
 *   (`/docs` OntologyStarterCta 와 동일 액션) 로 starter 시드 작성
 * - 데모 볼트 둘러보기 → `/docs/` 의 내장 dogfood 매니페스트 (vault 미선택
 *   fallback — 정적 빌드에 이미 포함)
 *
 * 디자인: DESIGN-SYSTEM v2 machined 언어 — `--color-panel` 표면 + 1px
 * border-soft 카드, 음각 mono trust line (`--engraved-numeral-*`, 실제 사실만),
 * 단일 인디고, 마케팅 산문/다운로드 CTA/스크린샷 0.
 */
export function FirstRunPage() {
  const t = useTranslations("firstRun");
  const vault = useLocalVault();
  const [createArmed, setCreateArmed] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const busy =
    vault.status === "opening" || vault.status === "loading" || scaffolding;

  const handleOpen = useCallback(async () => {
    setActionError(null);
    setCreateArmed(false);
    await vault.open();
  }, [vault]);

  const handleCreate = useCallback(async () => {
    setActionError(null);
    await vault.open();
    // open() resolves after the picker + manifest build settled (or the
    // user cancelled) — arming here avoids racing the status flip.
    setCreateArmed(true);
  }, [vault]);

  useEffect(() => {
    if (!createArmed) return;
    const status = vault.status;
    const docCount = vault.manifest ? vault.manifest.docs.length : null;
    // 렌더 직후 동기 setState 를 피하려고 microtask 로 미룬다 — 판정 입력은
    // 이 effect 실행 시점 값으로 고정.
    queueMicrotask(() => {
      if (shouldScaffoldAfterOpen({ createIntent: true, status, docCount })) {
        setCreateArmed(false);
        setScaffolding(true);
        vault
          .scaffoldOntology()
          .catch((err: unknown) => {
            setActionError(
              err instanceof Error ? err.message : t("errorFallback"),
            );
          })
          .finally(() => setScaffolding(false));
        return;
      }
      if (shouldClearCreateIntent(status)) {
        setCreateArmed(false);
      }
    });
  }, [createArmed, t, vault, vault.manifest, vault.status]);

  const errorText =
    actionError ??
    (vault.status === "error" ? vault.errorMessage ?? t("errorFallback") : null);

  const cardBase =
    "grid w-full grid-cols-[32px_1fr] items-start gap-3 rounded-md border bg-[color:var(--color-panel)] px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset disabled:opacity-60";
  const iconChip =
    "flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)]";

  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <section className="grid w-full max-w-[440px] gap-6">
        <header className="grid justify-items-center gap-3 text-center">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
              <Orbit size={13} aria-hidden />
            </span>
            <span className="text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              Ontology Atlas
            </span>
          </div>
          <div className="grid gap-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <h1 className="break-keep text-[22px] font-[var(--font-weight-signature)] leading-tight text-[color:var(--color-text-primary)]">
              {t("title")}
            </h1>
            <p className="mx-auto max-w-[360px] break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("subtitle")}
            </p>
          </div>
        </header>

        <div className="grid gap-2" aria-busy={busy}>
          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={busy}
            data-testid="first-run-open"
            className={`${cardBase} border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.08)]`}
          >
            <span className={`${iconChip} text-[color:var(--color-indigo-accent)]`}>
              <FolderOpen size={14} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {busy && !scaffolding ? t("busy") : t("openTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
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
              <Sparkles size={14} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {scaffolding ? t("scaffolding") : t("createTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
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
              <Compass size={14} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("demoTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t("demoBody")}
              </span>
            </span>
          </Link>
        </div>

        {errorText ? (
          <p
            role="alert"
            className="break-keep text-center text-[11.5px] text-[color:var(--color-status-danger)]"
          >
            {errorText}
          </p>
        ) : null}

        <p
          data-token="engraved-numeral"
          className="text-center font-mono text-[10px] uppercase tracking-[0.16em]"
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

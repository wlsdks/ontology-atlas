import { Bot, Check, Clipboard, FilePlus, FolderOpen, HardDrive, Network, Package, Terminal } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import type { LocalFsHandleRecord } from "@/entities/local-fs-handle";
import { AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT } from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Chip, StaggeredFadeIn } from "@/shared/ui";
import { DOGFOOD_VAULT_PATH } from "../../lib/dogfood-vault-path";
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';

const DOGFOOD_VERIFICATION_LOOP = [
  "# Ontology Atlas dogfood verification loop",
  "pnpm dogfood:status",
  "pnpm dogfood:agent-setup-gate",
  "pnpm dogfood:graph-db",
  "pnpm dogfood:verify",
].join("\n");

export function DesktopVaultWelcome({
  status,
  recentVaults,
  onOpen,
  onOpenDogfoodPath,
  onOpenRecent,
  onOpenSample,
  showDogfoodHint,
  t,
}: {
  status: string;
  recentVaults: LocalFsHandleRecord[];
  onOpen: () => void;
  onOpenDogfoodPath?: () => void;
  onOpenRecent: (record: LocalFsHandleRecord) => void;
  onOpenSample: () => void;
  showDogfoodHint: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const busy = status === "opening" || status === "loading";
  const { state: dogfoodPathCopyState, copy: copyDogfoodPath } = useCopyFeedback(1500);
  const { state: dogfoodLoopCopyState, copy: copyDogfoodLoop } = useCopyFeedback(1500);
  const dogfoodPathCopied = dogfoodPathCopyState === "copied";
  const dogfoodPathFailed = dogfoodPathCopyState === "failed";
  const dogfoodLoopCopied = dogfoodLoopCopyState === "copied";
  const dogfoodLoopFailed = dogfoodLoopCopyState === "failed";
  const dogfoodPathCopyStatusLabel = dogfoodPathCopied
    ? t("desktopWelcome.copyDogfoodPathCopied")
    : dogfoodPathFailed
      ? t("desktopWelcome.copyDogfoodPathFailed")
      : "";
  const dogfoodLoopCopyStatusLabel = dogfoodLoopCopied
    ? t("desktopWelcome.copyDogfoodLoopCopied")
    : dogfoodLoopFailed
      ? t("desktopWelcome.copyDogfoodLoopFailed")
      : "";
  const dogfoodPathCopyAriaLabel = dogfoodPathCopyStatusLabel
    ? `${t("desktopWelcome.copyDogfoodPath")} · ${dogfoodPathCopyStatusLabel}`
    : t("desktopWelcome.copyDogfoodPath");
  const dogfoodLoopCopyAriaLabel = dogfoodLoopCopyStatusLabel
    ? `${t("desktopWelcome.copyDogfoodLoop")} · ${dogfoodLoopCopyStatusLabel}`
    : t("desktopWelcome.copyDogfoodLoop");
  const contractItems = [
    {
      icon: HardDrive,
      label: t("desktopWelcome.contractFilesLabel"),
      value: t("desktopWelcome.contractFilesValue"),
      body: t("desktopWelcome.contractFilesBody"),
    },
    {
      icon: Network,
      label: t("desktopWelcome.contractGraphLabel"),
      value: t("desktopWelcome.contractGraphValue"),
      body: t("desktopWelcome.contractGraphBody"),
    },
    {
      icon: Bot,
      label: t("desktopWelcome.contractAgentLabel"),
      value: t("desktopWelcome.contractAgentValue", {
        count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
      }),
      body: t("desktopWelcome.contractAgentBody"),
    },
  ] as const;

  return (
    <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 overflow-auto bg-[color:var(--color-canvas)]">
      {/*
        `my-auto` — it only centres vertically when there is spare room (owner report from
        real use, 2026-07-28: *"화면 상단에 이렇게 나오면 이상하지? 중앙에 예쁘게"* — it looks
        wrong pinned to the top of the screen; centre it nicely).

        Why an auto margin rather than something like `items-center`: once the content is
        taller than the viewport an auto margin becomes **0** and it scrolls from the top.
        Fixed centring would clip the top on a short screen, out of reach even by scrolling.
      */}
      <div className="mx-auto my-auto grid w-full max-w-6xl content-start gap-8 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
        <div className="grid min-w-0 gap-7">
          <section className="grid max-w-3xl gap-3">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {t("desktopWelcome.eyebrow")}
            </p>
            {/* 34px is a ramp step now (`--text-hero-lg`, promoted 2026-07-29) — the old
                `md:text-[34px]` plus its eslint-disable earned a name once it had two
                consumers. The line height is the explicit pair `leading-hero-lg` (38px),
                covering both sizes — moved from `leading-tight` (a ratio of 1.25) to the ramp
                step on 2026-08-05, which is +0.5px at hero (30px). */}
            <h2 className="max-w-2xl text-hero font-[var(--font-weight-strong)] leading-hero-lg text-[color:var(--color-text-primary)] md:text-hero-lg">
              {showDogfoodHint
                ? t("desktopWelcome.dogfoodTitle")
                : t("desktopWelcome.title")}
            </h2>
            <p className="max-w-2xl text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
              {showDogfoodHint
                ? t("desktopWelcome.dogfoodBody")
                : t("desktopWelcome.body")}
            </p>
            {showDogfoodHint ? (
              <div className="flex max-w-2xl flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-secondary)]">
                  {DOGFOOD_VAULT_PATH}
                </code>
                <Chip
                  tone="accentOnTint"
                  onClick={() => void copyDogfoodPath(DOGFOOD_VAULT_PATH)}
                  aria-label={dogfoodPathCopyAriaLabel}
                  className="shrink-0 justify-center font-mono hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]"
                >
                  {dogfoodPathCopied ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
                  {t("desktopWelcome.copyDogfoodPath")}
                </Chip>
                <Chip
                  tone="secondary"
                  onClick={() => void copyDogfoodLoop(DOGFOOD_VERIFICATION_LOOP)}
                  aria-label={dogfoodLoopCopyAriaLabel}
                  className="shrink-0 justify-center font-mono hover:border-[color:var(--color-indigo-a32)] hover:text-[color:var(--color-text-primary)]"
                >
                  {dogfoodLoopCopied ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Terminal size={ICON_SIZE.sm} aria-hidden />}
                  {t("desktopWelcome.copyDogfoodLoop")}
                </Chip>
              </div>
            ) : null}
          </section>

          <StaggeredFadeIn
            as="section"
            ariaLabel={t("desktopWelcome.contractAriaLabel")}
            className="grid overflow-hidden rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] md:grid-cols-3"
          >
            {contractItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.label}
                  className={`min-w-0 px-4 py-3 ${
                    index > 0
                      ? "border-t border-[color:var(--color-border-soft)] md:border-l md:border-t-0"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <Icon size={14} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                        {item.value}
                      </p>
                      <p className="mt-1.5 break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                        {item.body}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </StaggeredFadeIn>
        </div>

        <aside
          aria-label={t("desktopWelcome.actionsAriaLabel")}
          className="grid min-w-0 gap-5"
        >
          <section className="overflow-hidden rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
            <button
              type="button"
              onClick={showDogfoodHint && onOpenDogfoodPath ? onOpenDogfoodPath : onOpen}
              disabled={busy}
              className={controlClass({ shape: "row", stacked: true, className: "items-start gap-3 bg-[color:var(--color-indigo-a08)] px-4 py-4 hover:bg-[color:var(--color-indigo-a14)]" })}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-line-a32)] text-[color:var(--color-indigo-pale-a94)]">
                <FolderOpen size={ICON_SIZE.lg} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                  {busy
                    ? status === "opening"
                      ? t("desktopWelcome.openingTitle")
                      : t("desktopWelcome.loadingTitle")
                    : showDogfoodHint
                      ? t("desktopWelcome.dogfoodOpenTitle")
                      : t("desktopWelcome.openTitle")}
                </span>
                <span className="mt-1 block text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {showDogfoodHint
                    ? t("desktopWelcome.dogfoodOpenBody")
                    : t("desktopWelcome.openBody")}
                </span>
              </span>
            </button>

            {!showDogfoodHint && onOpenDogfoodPath ? (
              <button
                type="button"
                onClick={onOpenDogfoodPath}
                disabled={busy}
                className={controlClass({ shape: "row", stacked: true, className: "items-start gap-3 border-t border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-line-a06)] px-4 py-3.5 hover:bg-[color:var(--color-indigo-line-a06)]" })}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-line-a22)] text-[color:var(--color-indigo-accent)]">
                  <Bot size={ICON_SIZE.md} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                    {t("desktopWelcome.dogfoodDirectTitle")}
                  </span>
                  <span className="mt-0.5 block text-label leading-body text-[color:var(--color-text-tertiary)]">
                    {t("desktopWelcome.dogfoodDirectBody")}
                  </span>
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className={controlClass({ hoverSurface: 'lift', shape: "row", stacked: true, className: "items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5" })}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <FilePlus size={ICON_SIZE.md} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                  {t("desktopWelcome.createTitle")}
                </span>
                <span className="mt-0.5 block text-label leading-body text-[color:var(--color-text-tertiary)]">
                  {t("desktopWelcome.createBody")}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSample}
              className={controlClass({ hoverSurface: 'lift', shape: "row", stacked: true, className: "items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5" })}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <Package size={ICON_SIZE.md} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                  {t("desktopWelcome.sampleTitle")}
                </span>
                <span className="mt-0.5 block text-label leading-body text-[color:var(--color-text-tertiary)]">
                  {t("desktopWelcome.sampleBody")}
                </span>
              </span>
            </button>
          </section>

          <section className="grid gap-2">
            <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {t("desktopWelcome.recentTitle")}
            </h3>
            {recentVaults.length > 0 ? (
              <div className="grid overflow-hidden rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
                {recentVaults.map((record, index) => (
                  <button
                    key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                    type="button"
                    onClick={() => onOpenRecent(record)}
                    disabled={busy}
                    className={controlClass({
                      shape: "row",
                      stacked: true,
                      className: cn(
                        "grid min-w-0 grid-cols-[28px_1fr] gap-3 px-3 py-2.5 hover:bg-[color:var(--color-overlay-1)]",
                        index > 0 && "border-t border-[color:var(--color-border-soft)]",
                      ),
                    })}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <HardDrive size={ICON_SIZE.sm} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {record.name}
                      </span>
                      {record.desktopRootPath ? (
                        <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                          {record.desktopRootPath}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="border-t border-[color:var(--color-border-soft)] pt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t("desktopWelcome.recentEmpty")}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

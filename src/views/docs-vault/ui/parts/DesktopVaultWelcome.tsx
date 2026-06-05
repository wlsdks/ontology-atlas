import { Bot, Check, Clipboard, FilePlus, FolderOpen, HardDrive, Network, Package } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LocalFsHandleRecord } from "@/entities/local-fs-handle";
import { AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT } from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { StaggeredFadeIn } from "@/shared/ui";

export const DOGFOOD_VAULT_PATH =
  "/Users/jinan/side-project/oh-my-ontology/docs/ontology";

export function DesktopVaultWelcome({
  status,
  recentVaults,
  onOpen,
  onOpenRecent,
  onOpenSample,
  showDogfoodHint,
  t,
}: {
  status: string;
  recentVaults: LocalFsHandleRecord[];
  onOpen: () => void;
  onOpenRecent: (record: LocalFsHandleRecord) => void;
  onOpenSample: () => void;
  showDogfoodHint: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const busy = status === "opening" || status === "loading";
  const { state: dogfoodPathCopyState, copy: copyDogfoodPath } = useCopyFeedback(1500);
  const dogfoodPathCopied = dogfoodPathCopyState === "copied";
  const dogfoodPathFailed = dogfoodPathCopyState === "failed";
  const dogfoodPathCopyStatusLabel = dogfoodPathCopied
    ? t("desktopWelcome.copyDogfoodPathCopied")
    : dogfoodPathFailed
      ? t("desktopWelcome.copyDogfoodPathFailed")
      : "";
  const dogfoodPathCopyAriaLabel = dogfoodPathCopyStatusLabel
    ? `${t("desktopWelcome.copyDogfoodPath")} · ${dogfoodPathCopyStatusLabel}`
    : t("desktopWelcome.copyDogfoodPath");
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
    <main id="main" className="flex min-h-0 flex-1 overflow-auto bg-[color:var(--color-canvas)]">
      <div className="mx-auto grid w-full max-w-6xl content-start gap-8 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
        <div className="grid min-w-0 gap-7">
          <section className="grid max-w-3xl gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {t("desktopWelcome.eyebrow")}
            </p>
            <h2 className="max-w-2xl text-[28px] font-semibold leading-tight text-[color:var(--color-text-primary)] md:text-[34px]">
              {showDogfoodHint
                ? t("desktopWelcome.dogfoodTitle")
                : t("desktopWelcome.title")}
            </h2>
            <p className="max-w-2xl text-[14px] leading-6 text-[color:var(--color-text-tertiary)]">
              {showDogfoodHint
                ? t("desktopWelcome.dogfoodBody")
                : t("desktopWelcome.body")}
            </p>
            {showDogfoodHint ? (
              <div className="flex max-w-2xl flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                  {DOGFOOD_VAULT_PATH}
                </code>
                <button
                  type="button"
                  onClick={() => void copyDogfoodPath(DOGFOOD_VAULT_PATH)}
                  aria-label={dogfoodPathCopyAriaLabel}
                  className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.08)] px-2.5 py-1.5 font-mono text-[10px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.42)] hover:bg-[color:rgba(139,151,255,0.13)]"
                >
                  {dogfoodPathCopied ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
                  {t("desktopWelcome.copyDogfoodPath")}
                </button>
              </div>
            ) : null}
          </section>

          <StaggeredFadeIn
            as="section"
            ariaLabel={t("desktopWelcome.contractAriaLabel")}
            className="grid overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] md:grid-cols-3"
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
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <Icon size={14} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-[12.5px] font-semibold text-[color:var(--color-text-primary)]">
                        {item.value}
                      </p>
                      <p className="mt-1.5 break-keep text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
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
          <section className="overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className="flex w-full items-start gap-3 bg-[color:rgba(94,106,210,0.09)] px-4 py-4 text-left transition-colors hover:bg-[color:rgba(94,106,210,0.14)] disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.28)] text-[color:rgba(205,212,255,0.94)]">
                <FolderOpen size={17} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[color:var(--color-text-primary)]">
                  {busy
                    ? status === "opening"
                      ? t("desktopWelcome.openingTitle")
                      : t("desktopWelcome.loadingTitle")
                    : showDogfoodHint
                      ? t("desktopWelcome.dogfoodOpenTitle")
                      : t("desktopWelcome.openTitle")}
                </span>
                <span className="mt-1 block text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {showDogfoodHint
                    ? t("desktopWelcome.dogfoodOpenBody")
                    : t("desktopWelcome.openBody")}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className="flex w-full items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <FilePlus size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  {t("desktopWelcome.createTitle")}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t("desktopWelcome.createBody")}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSample}
              className="flex w-full items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <Package size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  {t("desktopWelcome.sampleTitle")}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t("desktopWelcome.sampleBody")}
                </span>
              </span>
            </button>
          </section>

          <section className="grid gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {t("desktopWelcome.recentTitle")}
            </h3>
            {recentVaults.length > 0 ? (
              <div className="grid overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
                {recentVaults.map((record, index) => (
                  <button
                    key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                    type="button"
                    onClick={() => onOpenRecent(record)}
                    disabled={busy}
                    className={`grid min-w-0 grid-cols-[28px_1fr] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] disabled:opacity-60 ${
                      index > 0 ? "border-t border-[color:var(--color-border-soft)]" : ""
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <HardDrive size={13} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-[color:var(--color-text-primary)]">
                        {record.name}
                      </span>
                      {record.desktopRootPath ? (
                        <span className="block truncate font-mono text-[9.5px] text-[color:var(--color-text-quaternary)]">
                          {record.desktopRootPath}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="border-t border-[color:var(--color-border-soft)] pt-2 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t("desktopWelcome.recentEmpty")}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

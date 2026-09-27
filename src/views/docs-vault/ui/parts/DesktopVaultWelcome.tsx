import { Bot, Check, Clipboard, FilePlus, FolderOpen, HardDrive, Network, Terminal } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import type { LocalFsHandleRecord } from "@/entities/local-fs-handle";
import { AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT } from "@/entities/knowledge-graph";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Chip, StaggeredFadeIn } from "@/shared/ui";
import { RecentVaultList } from "@/features/vault-switch";
import { DOGFOOD_VAULT_PATH } from "../../lib/dogfood-vault-path";
import { controlClass } from '@/shared/ui/control-class';

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
  onForgetRecent,
  currentVaultKey,
  choosing = false,
  canResumeWithoutGesture = false,
  showDogfoodHint,
  t,
}: {
  status: string;
  recentVaults: LocalFsHandleRecord[];
  onOpen: () => void;
  onOpenDogfoodPath?: () => void;
  onOpenRecent: (record: LocalFsHandleRecord) => void;
  /** Drops a folder from the list; also the release valve for the launch rule. */
  onForgetRecent?: (record: LocalFsHandleRecord) => void;
  /** Key of the folder the last session had open, so the list can mark it. */
  currentVaultKey?: string | null;
  /**
   * The launch chooser, not a first run: the app knows two or more folders and stopped rather
   * than guess, so it asks which folder instead of teaching what a vault is.
   */
  choosing?: boolean;
  /**
   * The installed app can; a browser needs a click for File System Access permission.
   * The `AGENTS.md` contract requires the difference to be said on screen.
   */
  canResumeWithoutGesture?: boolean;
  showDogfoodHint: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const busy = status === "opening" || status === "loading";
  // Shared with the installed app's `FirstRunPage` chooser so the sentence cannot drift.
  const tSwitch = useTranslations("vaultSwitch");
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

  // On the chooser the list leads the main column; on a first run it is a quiet sidebar
  // shortcut. Rendered only when non-empty, which also keeps this mountable without an i18n
  // provider in unit tests.
  const recentSection =
    recentVaults.length > 0 ? (
      <section className="grid gap-2" aria-labelledby="known-folders-heading">
        <h3
          id="known-folders-heading"
          className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]"
        >
          {choosing ? tSwitch("choose.listTitle") : t("desktopWelcome.recentTitle")}
        </h3>
        <RecentVaultList
          records={recentVaults}
          currentKey={currentVaultKey ?? null}
          busy={busy}
          emphasis={choosing}
          onOpen={onOpenRecent}
          onForget={onForgetRecent ?? (() => {})}
          onLocate={onOpen}
          // The release valve sits under the list it acts on.
          footnote={choosing ? (
            <p className="text-caption leading-body text-[color:var(--color-text-quaternary)]">
              {tSwitch("choose.releaseValve")}
            </p>
          ) : null}
        />
      </section>
    ) : null;

  return (
    <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 overflow-auto bg-[color:var(--color-canvas)]">
      {/* `my-auto` centres only when there is spare room; taller content scrolls from the top
         instead of being clipped as fixed centring would. */}
      <div className="mx-auto my-auto grid w-full max-w-6xl content-start gap-8 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
        <div className="grid min-w-0 gap-7">
          <section className="grid max-w-3xl gap-3">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {choosing ? tSwitch("choose.eyebrow") : t("desktopWelcome.eyebrow")}
            </p>
            {/* `leading-hero-lg` covers both hero sizes. */}
            <h2 className="max-w-2xl text-hero font-[var(--font-weight-strong)] leading-hero-lg text-[color:var(--color-text-primary)] md:text-hero-lg">
              {choosing
                ? tSwitch("choose.title")
                : showDogfoodHint
                  ? t("desktopWelcome.dogfoodTitle")
                  : t("desktopWelcome.title")}
            </h2>
            <p className="max-w-2xl text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
              {choosing
                ? canResumeWithoutGesture
                  ? tSwitch("choose.bodyDesktop")
                  : tSwitch("choose.bodyWeb")
                : showDogfoodHint
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

          {choosing ? recentSection : null}

          {choosing ? null : (
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
          )}
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
              // On the chooser the list is the answer, so this door drops the accent in every channel,
              // using the neutral classes of its sibling card.
              className={controlClass({
                shape: "row",
                stacked: true,
                ...(choosing ? { hoverSurface: "lift" as const } : {}),
                className: `items-start gap-3 px-4 py-4 ${
                  choosing
                    ? ""
                    : "bg-[color:var(--color-indigo-a08)] hover:bg-[color:var(--color-indigo-a14)]"
                }`,
              })}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-chip border ${
                  choosing
                    ? "border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]"
                    : "border-[color:var(--color-indigo-line-a32)] text-[color:var(--color-indigo-pale-a94)]"
                }`}
              >
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
                // On the chooser, every door is neutral.
                className={controlClass({
                  shape: "row",
                  stacked: true,
                  ...(choosing ? { hoverSurface: "lift" as const } : {}),
                  className: `items-start gap-3 border-t px-4 py-3.5 ${
                    choosing
                      ? "border-[color:var(--color-border-soft)]"
                      : "border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-line-a06)] hover:bg-[color:var(--color-indigo-line-a06)]"
                  }`,
                })}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border ${
                    choosing
                      ? "border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]"
                      : "border-[color:var(--color-indigo-line-a22)] text-[color:var(--color-indigo-accent)]"
                  }`}
                >
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

          </section>

          {choosing ? null : recentSection}
          {choosing || recentVaults.length > 0 ? null : (
            <p className="border-t border-[color:var(--color-border-soft)] pt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t("desktopWelcome.recentEmpty")}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

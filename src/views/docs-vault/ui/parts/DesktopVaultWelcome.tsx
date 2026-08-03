import { Bot, Check, Clipboard, FilePlus, FolderOpen, HardDrive, Network, Package, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LocalFsHandleRecord } from "@/entities/local-fs-handle";
import { AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT } from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Chip, StaggeredFadeIn } from "@/shared/ui";
import { DOGFOOD_VAULT_PATH } from "../../lib/dogfood-vault-path";

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
        `my-auto` — 남는 공간이 있을 때만 세로 가운데로 온다 (2026-07-28 소유자
        실사용 제보: "화면 상단에 이렇게 나오면 이상하지? 중앙에 예쁘게").

        `items-center` 류가 아니라 auto margin 을 쓰는 이유: 내용이 뷰포트보다
        길어지면 auto margin 은 **0 이 되어** 위에서부터 스크롤된다. 가운데
        정렬로 고정하면 짧은 화면에서 위가 잘려 스크롤로도 못 닿는다.
      */}
      <div className="mx-auto my-auto grid w-full max-w-6xl content-start gap-8 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
        <div className="grid min-w-0 gap-7">
          <section className="grid max-w-3xl gap-3">
            <p className="font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {t("desktopWelcome.eyebrow")}
            </p>
            {/* 34px 은 이제 램프 스텝이다 (`--text-hero-lg`, 2026-07-29 승격) —
                구 `md:text-[34px]` + eslint-disable 예외는 소비처가 둘이 되면서
                이름을 얻었다. `leading-tight` 는 명시 짝이라 두 크기 모두를 덮는다. */}
            <h2 className="max-w-2xl text-hero font-semibold leading-tight text-[color:var(--color-text-primary)] md:text-hero-lg">
              {showDogfoodHint
                ? t("desktopWelcome.dogfoodTitle")
                : t("desktopWelcome.title")}
            </h2>
            <p className="max-w-2xl text-body-lg leading-6 text-[color:var(--color-text-tertiary)]">
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
                  tone="accent"
                  onClick={() => void copyDogfoodPath(DOGFOOD_VAULT_PATH)}
                  aria-label={dogfoodPathCopyAriaLabel}
                  className="shrink-0 justify-center font-mono hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]"
                >
                  {dogfoodPathCopied ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
                  {t("desktopWelcome.copyDogfoodPath")}
                </Chip>
                <Chip
                  tone="secondary"
                  onClick={() => void copyDogfoodLoop(DOGFOOD_VERIFICATION_LOOP)}
                  aria-label={dogfoodLoopCopyAriaLabel}
                  className="shrink-0 justify-center font-mono hover:border-[color:var(--color-indigo-a32)] hover:text-[color:var(--color-text-primary)]"
                >
                  {dogfoodLoopCopied ? <Check size={12} aria-hidden /> : <Terminal size={12} aria-hidden />}
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
                      <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-body font-semibold text-[color:var(--color-text-primary)]">
                        {item.value}
                      </p>
                      <p className="mt-1.5 break-keep text-label leading-5 text-[color:var(--color-text-tertiary)]">
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
              className="flex w-full items-start gap-3 bg-[color:var(--color-indigo-a08)] px-4 py-4 text-left transition-colors hover:bg-[color:var(--color-indigo-a14)] disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-line-a32)] text-[color:var(--color-indigo-pale-a94)]">
                <FolderOpen size={17} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body-lg font-semibold text-[color:var(--color-text-primary)]">
                  {busy
                    ? status === "opening"
                      ? t("desktopWelcome.openingTitle")
                      : t("desktopWelcome.loadingTitle")
                    : showDogfoodHint
                      ? t("desktopWelcome.dogfoodOpenTitle")
                      : t("desktopWelcome.openTitle")}
                </span>
                <span className="mt-1 block text-body leading-5 text-[color:var(--color-text-tertiary)]">
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
                className="flex w-full items-start gap-3 border-t border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-line-a06)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-indigo-line-a06)] disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-line-a22)] text-[color:var(--color-indigo-accent)]">
                  <Bot size={15} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-[color:var(--color-text-primary)]">
                    {t("desktopWelcome.dogfoodDirectTitle")}
                  </span>
                  <span className="mt-0.5 block text-label leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("desktopWelcome.dogfoodDirectBody")}
                  </span>
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className="flex w-full items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <FilePlus size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-[color:var(--color-text-primary)]">
                  {t("desktopWelcome.createTitle")}
                </span>
                <span className="mt-0.5 block text-label leading-5 text-[color:var(--color-text-tertiary)]">
                  {t("desktopWelcome.createBody")}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSample}
              className="flex w-full items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <Package size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-[color:var(--color-text-primary)]">
                  {t("desktopWelcome.sampleTitle")}
                </span>
                <span className="mt-0.5 block text-label leading-5 text-[color:var(--color-text-tertiary)]">
                  {t("desktopWelcome.sampleBody")}
                </span>
              </span>
            </button>
          </section>

          <section className="grid gap-2">
            <h3 className="font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
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
                    className={`grid min-w-0 grid-cols-[28px_1fr] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] disabled:opacity-60 ${
                      index > 0 ? "border-t border-[color:var(--color-border-soft)]" : ""
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <HardDrive size={13} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-[color:var(--color-text-primary)]">
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
              <p className="border-t border-[color:var(--color-border-soft)] pt-2 text-body leading-5 text-[color:var(--color-text-tertiary)]">
                {t("desktopWelcome.recentEmpty")}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

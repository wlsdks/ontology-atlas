"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useTranslations } from "next-intl";
import { BuildFromCodeDoor } from "./BuildFromCodeDoor";
import { Link } from "@/i18n/navigation";
import { useSampleSource } from "@/entities/vault-session";
import { VaultOpenGuideSheet } from "@/features/docs-vault-local";
import { Button, StaggeredFadeIn, controlClass } from "@/shared/ui";
import { useRovingRadioGroup } from "@/shared/lib/keyboard/use-roving-radio-group";

import { useFirstRunStarter } from "../model/use-first-run-starter";
import { CliBridgeBody, CliBridgeDialog, GlossaryDialog } from "./StarterDialogs";
import {
  readVaultGuideAutoOpened,
  writeVaultGuideAutoOpened,
} from "../model/vault-guide-auto-open";

export interface FirstRunStarterModuleProps {
  concepts: number;
  relations: number;
  domains: number;
  onEnablePlainMode?: () => void;
  audiencePlain?: boolean;
  lensActive?: boolean;
  nodeSelected?: boolean;
  mapUnbuilt?: boolean;
  agentAvailable?: boolean;
  children?: ReactNode;
}

const subscribeNever = () => () => {};
const readApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const readApplePlatformOnServer = () => false;

/** The quiet text buttons under the primary action share this one size step. */
const SECONDARY_ACTION_CLASS = controlClass({
  shape: "link",
  scope: "panel",
  tone: "muted",
  hoverInk: "strong",
  className: "atlas-touch-floor whitespace-nowrap text-left",
});

function SampleDot() {
  return (
    <span className="relative h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-[color:var(--color-status-warning)]" />
      <span className="absolute -inset-[3px] rounded-full border border-[color:var(--color-amber-source-a42)]" />
    </span>
  );
}

export function FirstRunStarterModule({
  concepts,
  relations,
  domains,
  onEnablePlainMode,
  audiencePlain = false,
  lensActive = false,
  nodeSelected = false,
  mapUnbuilt = false,
  agentAvailable = false,
  children,
}: FirstRunStarterModuleProps) {
  const t = useTranslations("firstRunStarter");
  const glossaryTitle = useTranslations("searchWidgets.shortcuts.glossary")("title");
  const {
    visible,
    dismissed,
    sampleModeSettled,
    dismiss,
    undismiss,
    openFolder,
    build,
    canBuildFromCode,
    createVault,
    busy,
    scaffolding,
    errorText,
    errorDetail,
    fsaUnsupported,
  } = useFirstRunStarter({ mapSelectionActive: nodeSelected });
  const [sampleSource, setSampleSource] = useSampleSource();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [cliOpen, setCliOpen] = useState(false);
  const focusReopenRef = useRef(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const sampleSourceGroup = useRovingRadioGroup<"storefront" | "dogfood">({
    value: sampleSource,
    values: ["storefront", "dogfood"],
    onChange: (next) => {
      setSampleSource(next);
      setCollapsed(true);
    },
  });
  const lensCollapsedRef = useRef(false);
  useEffect(() => {
    if (!lensActive) {
      lensCollapsedRef.current = false;
      return;
    }
    if (lensCollapsedRef.current) return;
    lensCollapsedRef.current = true;
    setCollapsed(true);
  }, [lensActive]);
  const selectionCollapsedRef = useRef(false);
  useEffect(() => {
    if (!nodeSelected || selectionCollapsedRef.current) return;
    selectionCollapsedRef.current = true;
    setCollapsed(true);
  }, [nodeSelected]);
  const applePlatform = useSyncExternalStore(
    subscribeNever,
    readApplePlatform,
    readApplePlatformOnServer,
  );

  useEffect(() => {
    if (!visible || fsaUnsupported || readVaultGuideAutoOpened()) return undefined;
    const id = window.setTimeout(() => {
      writeVaultGuideAutoOpened();
      setGuideOpen(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [visible, fsaUnsupported]);

  const reopenRow = (
    <div className="-mx-3 flex shrink-0 items-center gap-2 border-b border-[color:var(--map-panel-divider)] px-3 py-2">
      <button
        type="button"
        data-testid="first-run-starter-reopen"
        ref={(button) => {
          if (!button || !focusReopenRef.current) return;
          focusReopenRef.current = false;
          button.focus();
        }}
        onClick={() => {
          setCollapsed(false);
          undismiss();
        }}
        className={controlClass({
          shape: "link",
          scope: "panel",
          className:
            "touch-hit-expand min-w-0 hover:text-[color:var(--map-panel-text-primary)]",
        })}
      >
        <ChevronRight size={ICON_SIZE.sm} aria-hidden className="shrink-0 -rotate-180" />
        {t("reopenLabel")}
      </button>
      <span
        data-testid="first-run-starter-sample-signal"
        className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-caption text-[color:var(--color-status-warning)]"
      >
        <SampleDot />
        {t("sampleLabel")}
      </span>
    </div>
  );

  const standaloneDoor =
    !visible && mapUnbuilt && canBuildFromCode && agentAvailable && !fsaUnsupported ? (
      <div
        data-testid="index-build-from-code-row"
        className="-mx-3 border-b border-[color:var(--map-panel-border)] px-3 pb-3 pt-3"
      >
        <BuildFromCodeDoor build={build} variant="row" disabled={busy} />
      </div>
    ) : null;

  if (!visible && !(sampleModeSettled && dismissed))
    return (
      <>
        {standaloneDoor}
        {children}
      </>
    );
  if (!visible || collapsed) {
    return (
      <>
        {reopenRow}
        {standaloneDoor}
        {children}
      </>
    );
  }

  const storefront = sampleSource === "storefront";

  return (
    <div
      data-testid="first-run-starter"
      className="relative -m-3 min-h-0 overflow-y-auto overscroll-contain rounded-[var(--map-panel-radius)] bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent p-3"
    >
      <StaggeredFadeIn vaultKey="sample" scopeKey="first-run-starter" className="flex flex-col">
        <div key="intro">
          <div className="flex items-center gap-2 max-md:pr-12">
            <p
              data-testid="first-run-starter-sample-line"
              className="flex min-w-0 items-center gap-1 text-label leading-label text-[color:var(--map-panel-text-tertiary)]"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                <SampleDot />
              </span>
              {t("sampleLine", {
                name: t(storefront ? "sampleSourceStorefront" : "sampleSourceDogfood"),
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                focusReopenRef.current = true;
                dismiss();
              }}
              aria-label={t("closeAriaLabel")}
              data-testid="first-run-starter-dismiss"
              className={controlClass({
                shape: "link",
                scope: "panel",
                tone: "muted",
                hoverInk: "strong",
                className: "touch-hit-expand ml-auto shrink-0",
              })}
            >
              {t("closeLabel")}
            </button>
          </div>
          <h2
            data-testid="first-run-starter-headline"
            className="mt-2 text-balance text-title font-[var(--font-weight-strong)] leading-title tracking-title text-[color:var(--map-panel-text-primary)]"
          >
            {t("headline")}
          </h2>
          <p
            data-testid="first-run-starter-context"
            className="mt-1.5 text-pretty text-body leading-body text-[color:var(--map-panel-text-secondary)]"
          >
            {t.rich(fsaUnsupported ? "bodyNoFolderAccess" : "body", {
              keep: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
            })}
          </p>
        </div>

        <div key="actions" className="mt-4 flex flex-col gap-2">
          {fsaUnsupported ? (
            <div
              data-testid="first-run-starter-unsupported"
              className="rounded-card border border-[color:var(--map-panel-divider)] bg-[color:var(--map-panel-recess-a45)] px-3 py-2.5"
            >
              <p className="text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
                {t("unsupportedNotice")}
              </p>
              <Link
                href="/download/"
                data-testid="first-run-starter-unsupported-cta"
                className={controlClass({ shape: "link", tone: "accent", className: "mt-2 gap-1.5 text-body font-[var(--font-weight-signature)] hover:text-[color:var(--map-panel-text-primary)]" })}
              >
                {t("unsupportedCta")}
              </Link>
            </div>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={() => setGuideOpen(true)}
              disabled={busy}
              data-testid="first-run-starter-open"
              className="atlas-touch-floor w-full"
            >
              <FolderOpen size={ICON_SIZE.md} aria-hidden />
              {busy && !scaffolding ? t("openBusy") : t("openLabel")}
              {applePlatform ? (
                <span className="rounded-micro border border-b-2 border-[color:var(--color-keycap-edge-on-accent)] px-1.5 py-px font-mono text-caption font-[var(--font-weight-signature)]">
                  ⌘O
                </span>
              ) : null}
            </Button>
          )}
          {errorText !== null ? (
            <div
              role="alert"
              data-testid="first-run-starter-error"
              data-failure-detail={errorDetail ?? undefined}
            >
              <p className="text-label leading-label text-[color:var(--color-status-danger)]">{errorText}</p>
            </div>
          ) : null}
          {/* The terminal start lives in the folder guide; without folder access that guide never
              opens, so it takes the create button's place here. */}
          <div data-testid="first-run-starter-secondary" className="flex items-center gap-4">
            {fsaUnsupported ? (
              <button
                type="button"
                onClick={() => setCliOpen(true)}
                data-testid="first-run-starter-cli-open"
                className={SECONDARY_ACTION_CLASS}
              >
                {t("cliBridgeToggle")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                disabled={busy}
                data-testid="first-run-starter-create"
                className={SECONDARY_ACTION_CLASS}
              >
                {scaffolding ? t("createBusy") : t("createLabel")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setGlossaryOpen(true)}
              data-testid="first-run-starter-glossary-open"
              className={SECONDARY_ACTION_CLASS}
            >
              {glossaryTitle}
            </button>
          </div>
          {canBuildFromCode && agentAvailable && !fsaUnsupported ? (
            <BuildFromCodeDoor build={build} variant="card" disabled={busy} />
          ) : null}
        </div>

        <div
          key="sample"
          className="mt-4 border-t border-[color:var(--map-panel-divider)] pt-3"
        >
          <div
            {...sampleSourceGroup.groupProps}
            aria-label={t("sampleSourceAria")}
            data-testid="first-run-starter-sample-source"
            className="grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1"
          >
            {(
              [
                { source: "storefront", label: "sampleSourceStorefront", tip: "sampleSourceStorefrontTip" },
                { source: "dogfood", label: "sampleSourceDogfood", tip: "sampleSourceDogfoodTip" },
              ] as const
            ).map(({ source, label, tip }, index) => (
              <button
                key={source}
                {...sampleSourceGroup.itemProps(index)}
                type="button"
                title={t(tip)}
                data-testid={`first-run-starter-sample-source-${source}`}
                className={controlClass({
                  shape: "segment",
                  scope: "panel",
                  truncate: true,
                  active: sampleSource === source,
                  className: `touch-hit-expand min-w-0 ${
                    sampleSource === source
                      ? ""
                      : "hover:text-[color:var(--map-panel-text-primary)]"
                  }`,
                })}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <p
            data-testid="first-run-starter-sample-scale"
            className="mt-2 text-label leading-label text-[color:var(--map-panel-text-tertiary)]"
          >
            {t("sampleScale", { concepts, relations, domains })}
            {storefront ? (
              <span className="block text-[color:var(--map-panel-text-quaternary)]">
                {t("sampleRelationExample")}
              </span>
            ) : null}
          </p>
        </div>
      </StaggeredFadeIn>

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
        lastSection={
          <section>
            <h3 className="mb-2 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t("cliBridgeToggle")}
            </h3>
            <CliBridgeBody />
          </section>
        }
      />
      <GlossaryDialog
        open={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
        onEnablePlainMode={onEnablePlainMode}
        audiencePlain={audiencePlain}
      />
      <CliBridgeDialog open={cliOpen} onClose={() => setCliOpen(false)} />
    </div>
  );
}

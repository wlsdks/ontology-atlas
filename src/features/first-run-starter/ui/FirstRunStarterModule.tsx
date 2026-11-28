import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useTranslations } from "use-intl";
import { BuildFromCodeDoor } from "./BuildFromCodeDoor";
import { VaultOpenGuideSheet } from "@/features/docs-vault-local";
import { Button, StaggeredFadeIn, controlClass } from "@/shared/ui";

import { useFirstRunStarter } from "../model/use-first-run-starter";
import { GlossaryDialog } from "./GlossaryDialog";
import {
  readVaultGuideAutoOpened,
  writeVaultGuideAutoOpened,
} from "../model/vault-guide-auto-open";

export interface FirstRunStarterModuleProps {
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

const SECONDARY_ACTION_CLASS = controlClass({
  shape: "link",
  scope: "panel",
  tone: "muted",
  hoverInk: "strong",
  className: "atlas-touch-floor whitespace-nowrap text-left",
});

export function FirstRunStarterModule({
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
    noFolderSettled,
    dismiss,
    undismiss,
    openFolder,
    build,
    createVault,
    busy,
    scaffolding,
    errorText,
    errorDetail,
  } = useFirstRunStarter({ mapSelectionActive: nodeSelected });
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const focusReopenRef = useRef(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
    if (!visible || readVaultGuideAutoOpened()) return undefined;
    const id = window.setTimeout(() => {
      writeVaultGuideAutoOpened();
      setGuideOpen(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [visible]);

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
    </div>
  );

  const standaloneDoor =
    !visible && mapUnbuilt && agentAvailable ? (
      <div
        data-testid="index-build-from-code-row"
        className="-mx-3 border-b border-[color:var(--map-panel-border)] px-3 pb-3 pt-3"
      >
        <BuildFromCodeDoor build={build} variant="row" disabled={busy} />
      </div>
    ) : null;

  if (!visible && !(noFolderSettled && dismissed))
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

  return (
    <div
      data-testid="first-run-starter"
      className="relative -m-3 min-h-0 overflow-y-auto overscroll-contain rounded-[var(--map-panel-radius)] bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent p-3"
    >
      <StaggeredFadeIn vaultKey="no-folder" scopeKey="first-run-starter" className="flex flex-col">
        <div key="intro">
          <div className="flex items-center gap-2 max-md:pr-12">
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
            {t.rich("body", {
              keep: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
            })}
          </p>
        </div>

        <div key="actions" className="mt-4 flex flex-col gap-2">
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
          {errorText !== null ? (
            <div
              role="alert"
              data-testid="first-run-starter-error"
              data-failure-detail={errorDetail ?? undefined}
            >
              <p className="text-label leading-label text-[color:var(--color-status-danger)]">{errorText}</p>
            </div>
          ) : null}
          <div data-testid="first-run-starter-secondary" className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              disabled={busy}
              data-testid="first-run-starter-create"
              className={SECONDARY_ACTION_CLASS}
            >
              {scaffolding ? t("createBusy") : t("createLabel")}
            </button>
            <button
              type="button"
              onClick={() => setGlossaryOpen(true)}
              data-testid="first-run-starter-glossary-open"
              className={SECONDARY_ACTION_CLASS}
            >
              {glossaryTitle}
            </button>
          </div>
          {agentAvailable ? (
            <BuildFromCodeDoor build={build} variant="card" disabled={busy} />
          ) : null}
        </div>
      </StaggeredFadeIn>

      <VaultOpenGuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        onPickExisting={() => {
          setGuideOpen(false);
          void openFolder();
        }}
        onCreateNew={() => {
          setGuideOpen(false);
          void createVault();
        }}
      />
      <GlossaryDialog
        open={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
        onEnablePlainMode={onEnablePlainMode}
        audiencePlain={audiencePlain}
      />
    </div>
  );
}

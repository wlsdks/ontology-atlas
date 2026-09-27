"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { BuildFromCodeDoor } from "./BuildFromCodeDoor";
import { Link } from "@/i18n/navigation";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useSampleSource } from "@/entities/vault-session";
import { VaultOpenGuideSheet } from "@/features/docs-vault-local";
import { CompactCopyButton, controlClass } from "@/shared/ui";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";

import { useFirstRunStarter } from "../model/use-first-run-starter";
import {
  readVaultGuideAutoOpened,
  writeVaultGuideAutoOpened,
} from "../model/vault-guide-auto-open";

/**
 * The glossary reads the same i18n keys as `src/widgets/shortcut-sheet`, so drift breaks both
 * surfaces at once. Order follows the map hierarchy; redeclared here because `features` cannot
 * import from `widgets`.
 */
const GLOSSARY_TERMS = ["domain", "capability", "element"] as const;

export interface FirstRunStarterModuleProps {
  /** Real census, passed through from TopologyIndexPanel. */
  concepts: number;
  relations: number;
  domains: number;
  /**
   * The tour CTA. HomePage owns the tour state, so this takes a callback; omitted, no CTA.
   */
  onStartTour?: () => void;
  /**
   * With a callback, a plain-mode toggle replaces the hint sentence; nothing when plain mode is on.
   */
  onEnablePlainMode?: () => void;
  audiencePlain?: boolean;
  /**
   * The INDEX body, drawn exclusively with the guide card so the panel has one scroller.
   */
  /**
   * While the card is expanded the INDEX chips are not rendered, so turning the lens on takes
   * the same collapse path as choosing a sample (see `collapsed`).
   */
  lensActive?: boolean;
  /**
   * A selected node means the map is in use, so the card collapses; the "back to the guide" row
   * reopens it.
   */
  nodeSelected?: boolean;
  /**
   * The tour's INDEX step points at the list, so the card folds for that step and returns after.
   */
  indexSpotlit?: boolean;
  /**
   * The tour's developer step points at the one-line command, so the disclosure stands open for
   * that step and follows the person's toggle after.
   */
  agentSpotlit?: boolean;
  /**
   * No map built from code yet; not "never opened a folder", which hides the door from someone
   * who opened folders and gave up. The caller decides from the project's source binding.
   */
  mapUnbuilt?: boolean;
  /**
   * Without an ACP runtime the handoff returns early, so the door would create a folder and then
   * silently do nothing.
   */
  agentAvailable?: boolean;
  children?: ReactNode;
}

/**
 * One copyable command for codebase bootstrap (`node $ATLAS/cli/src/index.mjs bootstrap` =
 * analyze_repo_structure + infer_imports, no agent), the web's only route to it.
 */
// The CLI is not published to npm (docs/DECISIONS.md 2026-07-27), so this runs inside an
// ontology-atlas source checkout.
const CLI_BOOTSTRAP_COMMAND =
  "node cli/src/index.mjs init && node cli/src/index.mjs bootstrap";

const subscribeNever = () => () => {};
const readApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const readApplePlatformOnServer = () => false;

/**
 * The "get started" module at the top of the INDEX panel; approved contract
 * `docs/prototypes/first-run-v3-flagship.html`. Null unless no vault is selected, the mode is
 * static and it was not dismissed this session (`useFirstRunStarter`).
 */
export function FirstRunStarterModule({
  concepts,
  relations,
  domains,
  onStartTour,
  onEnablePlainMode,
  audiencePlain = false,
  lensActive = false,
  nodeSelected = false,
  indexSpotlit = false,
  agentSpotlit = false,
  mapUnbuilt = false,
  agentAvailable = false,
  children,
}: FirstRunStarterModuleProps) {
  const t = useTranslations("firstRunStarter");
  // Reuses ShortcutSheet's namespace (`searchWidgets.shortcuts.glossary.*`): one source.
  const glossary = useTranslations("searchWidgets.shortcuts.glossary");
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
  } = useFirstRunStarter();
  const { state: cliCopyState, copy: copyCliCommand } = useCopyFeedback();
  // Latin-only eyebrow decoration widens Korean space glyphs, so it is per locale.
  const eyebrowWide = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");
  const eyebrowTight = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");
  // The storefront sample lands with non-developers where the dogfood vault does not. Only
  // static mode consumes it; `useOntologyInsight` ignores it in local mode.
  const [sampleSource, setSampleSource] = useSampleSource();
  // The command is collapsed by default so it does not take a non-developer's first attention.
  const [cliOpen, setCliOpen] = useState(false);
  // Derived: open while the tour points at the command, the person's toggle otherwise.
  const cliShown = cliOpen || agentSpotlit;
  // The command sits at the foot of a scrolling card, so the tour step scrolls it into view.
  const cliBridgeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!agentSpotlit) return;
    cliBridgeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [agentSpotlit]);
  // Both folder CTAs pass through a guidance sheet first; the card renders only for a new user.
  const [guideOpen, setGuideOpen] = useState(false);
  // Collapses and hands the space to the INDEX once the user chooses what to look at. `dismiss`
  // lasts the session; this is a within-session toggle.
  const [collapsed, setCollapsed] = useState(false);

  /*
   * An exclusive single selection, so a radiogroup; `onChange` fires only on a real change, so
   * re-clicking does nothing. The container stays because an inactive segment carries hover ink
   * (`--map-panel-text-primary`) that is not in the value layer.
   */
  const sampleSourceGroup = useRovingRadioGroup<"storefront" | "dogfood">({
    value: sampleSource,
    values: ["storefront", "dogfood"],
    onChange: (next) => {
      setSampleSource(next);
      setCollapsed(true);
    },
  });
  /*
   * Turning the lens on collapses the card; turning it off does not restore it, or the tree the
   * person was reading would vanish. A ref fires this once, or reopening would re-collapse.
   */
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
  /*
   * The first node selection collapses the card once, locked by a ref like the lens; deselecting
   * does not restore it.
   */
  const selectionCollapsedRef = useRef(false);
  useEffect(() => {
    if (!nodeSelected || selectionCollapsedRef.current) return;
    selectionCollapsedRef.current = true;
    setCollapsed(true);
  }, [nodeSelected]);
  // The `⌘O` badge only on Mac: the shortcut is `{ key: "o", meta: true }` with no Ctrl+O, and
  // advertising a missing key is a false glyph. `useSyncExternalStore` with a `false` server
  // snapshot keeps static export free of hydration mismatch.
  const applePlatform = useSyncExternalStore(
    subscribeNever,
    readApplePlatform,
    readApplePlatformOnServer,
  );

  // First visit opens the folder sheet once; skipping hands over to the tour, which waits for
  // the sheet. Not in browsers without File System Access: the picker never comes, and the card's
  // inline notice covers that state.
  useEffect(() => {
    if (!visible || fsaUnsupported || readVaultGuideAutoOpened()) return undefined;
    const id = window.setTimeout(() => {
      writeVaultGuideAutoOpened();
      setGuideOpen(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [visible, fsaUnsupported]);

  // A quiet row stays where the closed card was, as the way back within the session.
  /*
   * The sample signal lives on this row, whose lifetime is sample mode, so it survives collapse
   * and dismiss; inside the card only, a sample screen looked like a connected vault. Reuses the
   * card's amber dot and `sampleLabel`.
   */
  const reopenRow = (
    <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--map-panel-divider)] px-4 py-2">
      <button
        type="button"
        data-testid="first-run-starter-reopen"
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
        <span className="relative h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-[color:var(--color-status-warning)]" />
          <span className="absolute -inset-[3px] rounded-full border border-[color:var(--color-amber-source-a42)]" />
        </span>
        {t("sampleLabel")}
      </span>
    </div>
  );

  /*
   * The door for someone with an open vault and no map from code yet (`mapUnbuilt`, from the
   * caller's source binding): one quiet line above their tree, gone once a map exists.
   */
  const standaloneDoor =
    !visible && mapUnbuilt && canBuildFromCode && agentAvailable && !fsaUnsupported ? (
      <div
        data-testid="index-build-from-code-row"
        className="border-b border-[color:var(--map-panel-border)] px-4 pb-3 pt-3"
      >
        <BuildFromCodeDoor build={build} variant="row" disabled={busy} />
      </div>
    ) : null;

  // No guide available (a local vault, say): INDEX only, plus the door while a map is missing.
  if (!visible && !(sampleModeSettled && dismissed))
    return (
      <>
        {standaloneDoor}
        {children}
      </>
    );
  // The guide was closed or collapsed: the "back" row plus the INDEX. Derived, not stored: the
  // card folds while the tour points at the list and returns when the step is left, because the
  // next step points at this card. A card the person folded stays folded.
  if (!visible || collapsed || indexSpotlit) {
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
      // min-h-0 + overflow-y-auto: on a short window the card shrinks and scrolls internally so
      // search and the tree stay reachable.
      className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent px-4 pb-3.5 pt-4"
    >
      {/*
       * `min-h-full` with the reference block at `mt-auto` turns bottom whitespace into a gap
       * between the action and reference layers. A wrapper, because flex on the scroll root
       * squashes children in a short window.
       */}
      <div className="flex min-h-full flex-col">
      {/*
       * The product name as a text wordmark line, with no logo mark.
       */}
      <p
        data-testid="first-run-starter-brand"
        className="mb-1 text-caption font-[var(--font-weight-signature)] tracking-[var(--tracking-label)] text-[color:var(--map-panel-text-quaternary)]"
      >
        {t("brand")}
      </p>
      {/*
       * The amber dot sits beside its own sentence so colour and words form one cluster.
       */}
      <p
        className={`mb-3 flex items-center gap-2 text-caption text-[color:var(--map-panel-text-secondary)] ${eyebrowWide}`}
      >
        {t("caption")}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-caption text-[color:var(--color-status-warning)] ${eyebrowTight}`}
        >
          <span className="relative h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-[color:var(--color-status-warning)]" />
            <span className="absolute -inset-[3px] rounded-full border border-[color:var(--color-amber-source-a42)]" />
          </span>
          {t("sampleLabel")}
        </span>
      </p>

      <p
        data-testid="first-run-starter-context"
        className="mb-4 text-body leading-body text-[color:var(--map-panel-text-tertiary)]"
      >
        {/*
         * The lead is one step up (`text-body-lg`) with its paired leading stated
         * (`.claude/rules/design.md`, "a size step carries its own leading"). `block`, because a
         * size change may happen only at a line boundary.
         */}
        <b className="mb-1.5 block text-body-lg font-[var(--font-weight-strong)] leading-body-lg text-[color:var(--map-panel-text-primary)]">
          {t(sampleSource === "storefront" ? "contextStorefrontBold" : "contextBold")}
        </b>
        {t(sampleSource === "storefront" ? "contextStorefrontRest" : "contextRest")}{" "}
        {/*
         * The one sentence that names the agent audience, in tour step 4's vocabulary.
         */}
        <span data-testid="first-run-starter-agent-clause">{t("agentClause")}</span>
      </p>

      {/*
       * The storefront sample, one click away; same tokens as the "All | Recently Changed"
       * segment in TopologyIndexPanel. A selection control: switching collapses the card, and
       * re-clicking the current selection does nothing.
       */}
      <div
        {...sampleSourceGroup.groupProps}
        aria-label={t("sampleSourceAria")}
        data-testid="first-run-starter-sample-source"
        className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1"
      >
        {/*
         * A newcomer reads the left one first, so the example business leads. Driven from
         * data so both buttons change together.
         */}
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
            /*
             * Borderless inset, panel ink and ellipsis match this slot;
             * `--chrome-radius-inner` aliases `--radius-chip`.
             */
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

      {/*
       * The counts are a caption, not an instrument block: instrument treatment belongs to
       * the person's own vault. The numbers still come from `topologyCanonicalCensus` props.
       */}
      <p
        data-testid="first-run-starter-sample-scale"
        className="mb-4 text-label leading-label text-[color:var(--map-panel-text-tertiary)]"
      >
        {t("sampleScale", { concepts, relations, domains })}
        {/*
         * One real storefront edge teaches "relation" in the grammar of an example, not a
         * queried fact; the dogfood vault gets none rather than a forced symmetry.
         */}
        {sampleSource === "storefront" ? (
          <span className="block text-[color:var(--map-panel-text-quaternary)]">
            {t("sampleRelationExample")}
          </span>
        ) : null}
      </p>

      {fsaUnsupported ? (
        /*
         * Without File System Access both CTAs would fail after pressing, so one notice and
         * the macOS app link (/download) replace them up front.
         */
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
            className={controlClass({ shape: "link", tone: "accentOnTint", className: "mt-2 gap-1.5 text-body font-[var(--font-weight-signature)] hover:text-[color:var(--map-panel-text-primary)]" })}
          >
            {t("unsupportedCta")}
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          disabled={busy}
          data-testid="first-run-starter-open"
          className={controlClass({ shape: "card", className: "touch-hit-expand relative h-10 w-full justify-center gap-2 border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-brand)] text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-on-accent)] focus-visible:ring-[color:var(--color-text-on-accent)] shadow-[inset_0_1px_0_var(--color-overlay-3)] hover:bg-[color:var(--color-indigo-brand-hover)]" })}
        >
          <FolderOpen size={ICON_SIZE.md} aria-hidden />
          {busy && !scaffolding ? t("openBusy") : t("openLabel")}
          {applePlatform ? (
            /*
             * No `opacity`: it would drop the inherited `--color-text-on-accent` below contrast
             * while the computed `color` still passes the licence checks.
             */
            <span className="rounded-micro border border-b-2 border-[color:var(--color-keycap-edge-on-accent)] px-1.5 py-px font-mono text-caption font-[var(--font-weight-signature)]">
              ⌘O
            </span>
          ) : null}
        </button>
      )}

      {/*
       * The door for someone who already has code; outlined, not filled, so the card keeps
       * one attention winner. Installed app only: the web has no agent to hand work to.
       */}
      {canBuildFromCode && agentAvailable && !fsaUnsupported ? (
        <BuildFromCodeDoor build={build} variant="card" disabled={busy} />
      ) : null}

      {/*
       * The tour CTA beneath the folder CTA, the look-around-first path.
       */}
      {onStartTour ? (
        <button
          type="button"
          data-testid="first-run-tour-cta"
          onClick={onStartTour}
          className={controlClass({ shape: "card", className: "touch-hit-expand mt-2 inline-flex h-8 w-full justify-center gap-1.5 border-[color:var(--map-panel-divider)] text-body text-[color:var(--map-panel-text-secondary)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--map-panel-text-primary)]" })}
        >
          {t("tourCta")}
        </button>
      ) : null}

      <p className="mb-1 mt-3 flex items-center justify-between gap-4 text-label">
        {fsaUnsupported ? (
          <span aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            disabled={busy}
            data-testid="first-run-starter-create"
            className={controlClass({
              shape: "link",
              scope: "panel",
              className:
                "touch-hit-expand border-b border-transparent pb-px hover:border-[color:var(--map-panel-divider)] hover:text-[color:var(--map-panel-text-secondary)]",
            })}
          >
            {scaffolding ? t("createBusy") : t("createLabel")}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          data-testid="first-run-starter-dismiss"
          className={controlClass({
            shape: "link",
            scope: "panel",
            className:
              "touch-hit-expand border-b border-transparent pb-px hover:border-[color:var(--map-panel-divider)] hover:text-[color:var(--map-panel-text-secondary)]",
          })}
        >
          {t("dismissLabel")}
        </button>
      </p>

      {/*
       * With the callback the plain-mode hint is a one-click toggle; without it the hint
       * sentence stays.
       */}
      {onEnablePlainMode ? (
        audiencePlain ? null : (
          <button
            type="button"
            data-testid="first-run-plain-toggle"
            onClick={onEnablePlainMode}
            /*
             * Ramp floor 24 (`min-h-6`) with `touch-hit-expand` for the coarse hit area, so
             * the card does not grow 44px.
             */
            className={controlClass({
              shape: "link",
              tone: "accent",
              className: "touch-hit-expand mt-1 underline-offset-2 hover:underline",
            })}
          >
            {t("plainModeCta")}
          </button>
        )
      ) : (
        <p
          data-testid="first-run-starter-plain-mode-hint"
          className="mt-1 text-label leading-label text-[color:var(--map-panel-text-quaternary)]"
        >
          {t("plainModeHint")}
        </p>
      )}

      {/*
       * The failure line stays in the action layer. It shows the sentence for a recognised
       * code or the fallback; the English cause goes to `data-failure-detail`.
       */}
      {errorText !== null ? (
        <div
          role="alert"
          className="mt-2"
          data-testid="first-run-starter-error"
          data-failure-detail={errorDetail ?? undefined}
        >
          <p className="text-label text-[color:var(--color-status-danger)]">{errorText}</p>
        </div>
      ) : null}

      {/*
       * The reference layer (glossary and developer disclosure) stands at the bottom via
       * `mt-auto`, separated from the action layer.
       */}
      <div className="mt-auto">
      {/*
       * Always visible, not folded: this is where a beginner learns the three words.
       */}
      <div className="mt-4 border-t border-[color:var(--map-panel-divider)] pt-3">
        <p
          className={`mb-1.5 text-caption text-[color:var(--map-panel-text-quaternary)] ${eyebrow}`}
        >
          {glossary("title")}
        </p>
        {/**
         * A two-column grid sizes the term column once against the longest term, so the `=`
         * lines up and long definitions wrap in their own column in every language.
         */}
        {/**
         * Inline style, because Tailwind did not generate `grid-cols-[auto_auto_1fr]` and the
         * cells silently stacked. `minmax(0, 1fr)` lets the definition column shrink.
         */}
        <dl
          data-testid="first-run-starter-glossary"
          style={{ gridTemplateColumns: "auto auto minmax(0, 1fr)" }}
          className="grid gap-x-1.5 gap-y-1 text-label leading-label"
        >
          {GLOSSARY_TERMS.map((term) => (
            <Fragment key={term}>
              <dt className="font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-secondary)]">
                {glossary(`${term}Term`)}
              </dt>
              <span
                aria-hidden="true"
                className="text-[color:var(--map-panel-text-quaternary)]"
              >
                =
              </span>
              <dd className="text-[color:var(--map-panel-text-tertiary)]">
                {glossary(`${term}Definition`)}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>

      {/*
       * The bridge to codebase bootstrap, behind a collapsed disclosure. The command scans the
       * folder it runs in, so the copy says what it does (`cliBridgeSourceOnly`).
       */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCliOpen((open) => !open)}
          aria-expanded={cliShown}
          aria-controls="first-run-starter-cli-bridge"
          data-testid="first-run-starter-cli-toggle"
          className={controlClass({
            shape: "link",
            scope: "panel",
            tone: "muted",
            className:
              "touch-hit-expand hover:text-[color:var(--map-panel-text-secondary)]",
          })}
        >
          <ChevronRight
            size={ICON_SIZE.sm}
            aria-hidden
            className={`transition-transform motion-reduce:transition-none ${
              cliShown ? "rotate-90" : ""
            }`}
          />
          {t("cliBridgeToggle")}
        </button>
        {cliShown ? (
          /*
           * A header row (label and copy) plus a full-width code line that wraps at word
           * boundaries, so the whole command is visible.
           */
          <div
            ref={cliBridgeRef}
            id="first-run-starter-cli-bridge"
            data-testid="first-run-starter-cli-bridge"
            className="mt-2 rounded-chip border border-[color:var(--map-panel-divider)] bg-[color:var(--map-panel-recess-a35)] px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 break-keep text-caption leading-display-tight text-[color:var(--map-panel-text-quaternary)]">
                {t("cliBridgeLabel")}
              </p>
              <CompactCopyButton
                copied={cliCopyState === "copied"}
                label={cliCopyState === "copied" ? t("cliBridgeCopied") : t("cliBridgeCopy")}
                ariaLabel={t("cliBridgeCopyAriaLabel")}
                onClick={() => void copyCliCommand(CLI_BOOTSTRAP_COMMAND)}
                data-testid="first-run-starter-cli-bridge-copy"
                className="-my-1.5 -mr-1.5 shrink-0"
              />
            </div>
            <p
              data-testid="first-run-starter-cli-source-only"
              className="mt-1.5 text-caption leading-label text-[color:var(--color-text-tertiary)]"
            >
              {t("cliBridgeSourceOnly")}
            </p>
            <code className="mt-1 block whitespace-pre-wrap break-words font-mono text-label leading-label text-[color:var(--map-panel-text-secondary)]">
              {CLI_BOOTSTRAP_COMMAND}
            </code>
          </div>
        ) : null}
      </div>
      </div>
      </div>

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
      />
    </div>
  );
}

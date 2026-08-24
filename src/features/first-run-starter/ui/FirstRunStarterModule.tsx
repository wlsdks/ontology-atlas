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
import { useSampleSource } from "@/features/vault-sample-source";
import { VaultOpenGuideSheet } from "@/features/docs-vault-local";
import { CompactCopyButton, controlClass } from "@/shared/ui";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";

import { useFirstRunStarter } from "../model/use-first-run-starter";
import {
  readVaultGuideAutoOpened,
  writeVaultGuideAutoOpened,
} from "../model/vault-guide-auto-open";

/**
 * The only plain-language definitions of domain / capability / element
 * (`searchWidgets.shortcuts.glossary.*`) used to live in the "?" shortcut modal's
 * footer, where a non-developer never saw them on first contact. Rather than
 * writing new copy, this card reads the same i18n keys so they are always
 * visible — the card and `src/widgets/shortcut-sheet` share the keys, so drift
 * breaks both surfaces at once and shows up immediately.
 *
 * The order matches the map's hierarchy (domain → capability → element) and is
 * redeclared locally because `features` cannot import from `widgets` (FSD
 * forbids the reverse direction).
 */
const GLOSSARY_TERMS = ["domain", "capability", "element"] as const;

export interface FirstRunStarterModuleProps {
  /** Real census — passed straight through from what TopologyIndexPanel already receives. */
  concepts: number;
  relations: number;
  domains: number;
  /**
   * The "take a two-minute tour" CTA. The tour state machine is owned by
   * HomePage (a view), so this only takes a callback — a feature does not know
   * about views. Omitted, the CTA is not rendered.
   */
  onStartTour?: () => void;
  /**
   * Turns on plain-language mode in one click. It used to live only inside the
   * gear menu. With a callback present this renders a toggle button instead of
   * the hint sentence; when plain mode is already on it renders nothing.
   */
  onEnablePlainMode?: () => void;
  audiencePlain?: boolean;
  /**
   * The INDEX body, drawn **exclusively** with the guide card. While the card is
   * expanded, children are not rendered, so the panel always has exactly one
   * scroller (owner report: "Separate scrollbars top and bottom). Once the user chooses, the card collapses and
   * the INDEX opens.
   */
  /**
   * Is the "recent changes" lens on? (2026-08-02, owner report: "Pressing the recent-changes button while the starter panel is open leaves
   * the left panel unchanged.)
   *
   * The card and the INDEX are **two exclusive states**, so while the card is
   * expanded the INDEX's segment and period chips are not rendered at all.
   * Turning the lens on changed the URL and the map while the left side stayed
   * put — not a bug so much as a design that had not seen this case.
   *
   * Turning on the lens is another form of "the user chose what to look at" (see
   * the `collapsed` comment below), so it takes the same collapse path rather
   * than introducing a new state.
   */
  lensActive?: boolean;
  /**
   * Has the user selected any node on the map? If so this card has **done its job**.
   *
   * Why it collapses (owner, 2026-08-19: "It looks bad with this stuck on the left the whole time): the
   * card says «what to do first», but someone who has selected a node is already
   * using the map. From then on it is not guidance, it is a blind covering a
   * third of the screen. Switching samples and turning on the lens already
   * collapse it on the same signal, and node selection is the clearest of the three.
   *
   * It collapses rather than disappearing, and the "back to the guide" row
   * reopens it at any time.
   */
  nodeSelected?: boolean;
  /**
   * **This vault has no map built from code yet** — nothing in it points at a real repository.
   *
   * ⚠️ Deliberately *not* "has never opened a folder" (owner correction, 2026-08-24). That is the
   * card's rule, and it is right for browsing guidance: someone who has not looked around yet needs
   * the sample and the tour, and pushing those at a returning person is noise. It is the wrong rule
   * for unfinished work. Somebody who opened a folder, saw an empty map and gave up has opened
   * folders *more* than a first-timer, and the card's rule hid the 「make a map from my code」 door
   * from exactly that person. The caller decides this from the project's source binding.
   */
  mapUnbuilt?: boolean;
  children?: ReactNode;
}

/**
 * Automatic codebase bootstrap (`node $ATLAS/cli/src/index.mjs bootstrap` =
 * analyze_repo_structure + infer_imports in one line, no agent) exists and is
 * exactly what the tech-lead persona wanted, but the web's first screen carried
 * no route to it — hidden behind CLI/agent use only, it got deferred and
 * revisits stopped. Rather than adding a surface, this card gains one copyable
 * command line.
 */
// The CLI is not published to npm (docs/DECISIONS.md 2026-07-27) — this command
// runs inside an ontology-atlas source checkout. Leaving a "someday npx will
// work" branch would be a future tense that never arrives, and a lie to whoever
// reads it.
const CLI_BOOTSTRAP_COMMAND =
  "node cli/src/index.mjs init && node cli/src/index.mjs bootstrap";

/** The platform does not change during a session — nothing to subscribe to. */
const subscribeNever = () => () => {};
const readApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const readApplePlatformOnServer = () => false;

/**
 * The "get started" module that sits at the top of the INDEX panel
 * (TopologyIndexPanel). Approved contract:
 * `docs/prototypes/first-run-v3-flagship.html` (2026-07-18). Zero floating
 * surfaces — both the centre card (rejected) and the bottom command dock
 * (rejected mid-review) were dropped in favour of a place inside the existing
 * INDEX panel.
 *
 * Rendered only when no vault is selected, the mode is static, and it has not
 * been dismissed this session (`visible`, `useFirstRunStarter`). Otherwise null,
 * and the INDEX keeps its usual shape (search plus tree).
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
  mapUnbuilt = false,
  children,
}: FirstRunStarterModuleProps) {
  const t = useTranslations("firstRunStarter");
  // Reuses ShortcutSheet's i18n namespace verbatim
  // (`searchWidgets.shortcuts.glossary.*`). Zero new copy, one source.
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
    fsaUnsupported,
  } = useFirstRunStarter();
  const { state: cliCopyState, copy: copyCliCommand } = useCopyFeedback();
  // "First Run" · "Currently Sample" · "Map Terminology" rendered with doubled
  // spaces. The i18n strings had single spaces — what widened was the space
  // glyph under latin-only decoration (mono + uppercase + wide tracking) applied
  // to Korean (measured tracking 1.36–2.09px).
  const eyebrowWide = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");
  const eyebrowTight = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");
  // The empathetic sample vault: the dogfood vault (this tool describing itself)
  // does not land with a non-developer, so first run offers an instantly
  // recognizable example business instead. Consumed only in static mode — in
  // local mode `useOntologyInsight` ignores this value.
  const [sampleSource, setSampleSource] = useSampleSource();
  // The npx command block sat permanently on a non-developer's first screen
  // (planning, marketing, leadership) and stole attention. It moves behind a
  // disclosure that is collapsed by default, so only developers expand it.
  // Session state until the card remounts.
  const [cliOpen, setCliOpen] = useState(false);
  // The folder CTA used to go straight to the OS picker with zero explanation,
  // so a first-time user did not know what to choose. Both CTAs now pass through
  // a guidance sheet first (this card renders only for a new user with no vault,
  // so no experienced user is forced through the sheet).
  const [guideOpen, setGuideOpen] = useState(false);
  // Whether the card occupies the panel or collapses and hands the space to the
  // INDEX. The moment the user chooses "what to look at" (switching samples), it
  // collapses and hands over to data. `dismiss` lasts the session; this is a
  // within-session toggle.
  const [collapsed, setCollapsed] = useState(false);

  /*
   * The sample source is an **exclusive single selection**. A 2026-08-02 PO
   * council pass gave back `role="tab"` for `aria-pressed`, but **the
   * alternative considered then was tablist, not radiogroup.** Putting
   * `pressed` on siblings side by side never puts the exclusivity into the
   * accessibility tree. The contract from that pass — "re-clicking the current
   * selection does nothing" — is kept by the hook: `onChange` fires only when
   * the value actually changes.
   *
   * ⚠️ The container stays in place — an inactive segment carries hover ink
   * (`--topology-v2-panel-text-primary`) that is not in the value layer.
   * Migrating away loses that feedback.
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
   * Turning the lens on collapses the card and hands the space to the INDEX (see
   * the `lensActive` comment above).
   *
   * **Turning it off does not restore it.** Collapsing records that «the user
   * has already chosen what to look at», and switching the lens off does not
   * cancel that fact — restoring would make the tree they were just reading
   * vanish. The "back to the guide" row reopens the card at any time.
   *
   * A ref triggers this **once** rather than setState during render: retrying on
   * every render while the lens is on would re-collapse the card the instant the
   * user reopened it.
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
   * Collapses on the first node selection — the same **once only** grammar as
   * the lens, locked by a ref. Retrying every render would re-collapse the card
   * the instant the user reopened it. Deselecting does not restore it: "I have
   * already used the map" is not cancelled by clearing a selection.
   */
  const selectionCollapsedRef = useRef(false);
  useEffect(() => {
    if (!nodeSelected || selectionCollapsedRef.current) return;
    selectionCollapsedRef.current = true;
    setCollapsed(true);
  }, [nodeSelected]);
  // The `⌘O` badge is true **only on Mac**. This app's open-folder shortcut is
  // `{ key: "o", meta: true }` alone (the HomePage shortcut table) with no
  // matching Ctrl+O binding. The web gateway's core audience is on
  // Windows/Linux, and advertising a key that does not exist is a false glyph,
  // not a hint.
  //
  // Static export does not know the platform on the server, so the server
  // snapshot is always `false` (no badge) — which is why this uses
  // `useSyncExternalStore` rather than `useEffect` + `setState`. The read never
  // changes, so the subscription is a no-op, and the first client render is
  // correct with no hydration mismatch.
  const applePlatform = useSyncExternalStore(
    subscribeNever,
    readApplePlatform,
    readApplePlatformOnServer,
  );

  // Folder-first first visit (owner instruction 2026-07-24) — opening the first
  // screen makes choosing a folder the first action. Skipping with "later" hands
  // over to the automatic tour (the tour guard defers while the sheet is open).
  // Once only.
  // Not auto-opened in browsers without File System Access. The sheet exists to
  // "explain before the OS picker appears", and that picker never comes, so it
  // would be a modal recommending something impossible the moment the first
  // screen opens. Guidance for that state is the inline notice inside the card
  // (unsupportedNotice plus the macOS app).
  useEffect(() => {
    if (!visible || fsaUnsupported || readVaultGuideAutoOpened()) return undefined;
    const id = window.setTimeout(() => {
      writeVaultGuideAutoOpened();
      setGuideOpen(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [visible, fsaUnsupported]);

  // Back to the guide (owner report from real use, 2026-07-24) — closing the
  // card with "I'll look around here" and browsing the example business left no
  // way back to the start within the session. A quiet single row stays where the
  // card was.
  /*
   * **The status signal lives with the connection state, not with the card**
   * (PO council verdict ③, 2026-08-03). "Currently Sample" used to live **inside** the
   * card only, so pressing a sample source tab (`setCollapsed(true)`) removed it
   * along with the card. At that moment the screen became **structurally
   * indistinguishable in layout, labels, and counts** from having a real vault
   * open, and the owner read the "This App's Code" tab as evidence of a connection.
   *
   * This module renders only while `sampleModeSettled`, so putting the signal on
   * this row makes the signal's lifetime **the lifetime of sample mode** — it
   * survives collapsing and dismissing, and disappears with the module when a
   * folder is opened.
   *
   * Zero new strings — it reuses the same amber dot cluster and `sampleLabel`
   * the card used. One screen does not state one fact in two grammars.
   */
  const reopenRow = (
    <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--topology-v2-panel-divider)] px-4 py-2">
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
            "touch-hit-expand min-w-0 hover:text-[color:var(--topology-v2-panel-text-primary)]",
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
   * ⚠️ **Person B's only door** (owner correction, 2026-08-24).
   *
   * Everything above this line belongs to the first-run card, and that card is gated on
   * `recentVaults.length === 0` — "this computer has never opened a folder". The owner named the
   * mistake exactly: *"shouldn't it be person B who has opened folders many times and still hasn't
   * made one?"* Someone who opened a folder, saw an empty map and gave up has opened folders **more**
   * than a first-timer, so the card's rule hid this door from the very person it was built for.
   *
   * The rule that replaces it is about unfinished work, not about newness: a vault is open, and
   * nothing in it points at real code yet (`mapUnbuilt`, decided by the caller from the project's
   * source binding). It stays a single quiet line because it sits above somebody's own tree and must
   * not out-shout it, and it disappears the moment a map exists.
   */
  const standaloneDoor =
    !visible && mapUnbuilt && canBuildFromCode && !fsaUnsupported ? (
      <div
        data-testid="index-build-from-code-row"
        className="border-b border-[color:var(--topology-v2-panel-border)] px-4 pb-3 pt-3"
      >
        <BuildFromCodeDoor build={build} variant="row" disabled={busy} />
      </div>
    ) : null;

  // No guide available (a local vault, say) — INDEX only, plus the door when a map is still missing.
  if (!visible && !(sampleModeSettled && dismissed))
    return (
      <>
        {standaloneDoor}
        {children}
      </>
    );
  // The guide was closed or collapsed — the single "back" row plus the INDEX.
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
      // min-h-0 + overflow-y-auto (owner report 2026-07-24) — the card is a
      // fixed block inside the INDEX panel (flex-col h-full), so on a short
      // window it ate all the space and there was no way to reach search and the
      // tree below. When space runs short the card shrinks and switches to an
      // internal scroll (unchanged when there is room).
      className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent px-4 pb-3.5 pt-4"
    >
      {/* Measured bottom whitespace was 25.4% in an 806px window (≈38% scaled to
          a 982px fullscreen). The top was dense and the bottom empty. With this
          wrapper filling the panel height (`min-h-full`) and the reference block
          (glossary plus developer disclosure) standing at the bottom via
          `mt-auto`, that whitespace becomes **a designed gap between the action
          layer and the reference layer** rather than the card's tail.
          Why a wrapper: the root is the scroll container (`overflow-y-auto`), so
          putting flex on it squashes the children in a short window. An inner
          wrapper with automatic height plus `min-h-full` grows normally when the
          content is long and bottom-aligns only when it is short. */}
      <div className="flex min-h-full flex-col">
      {/* The first-run card said only "what this screen does" and never "what
          this product is" (its name), leaving a complete beginner with an
          identity gap. One text wordmark line is added, with no logo mark — the
          existing mission sentence (contextBold) already explains the concept of
          a map, so a separate half-sentence of mission would be redundant. */}
      <p
        data-testid="first-run-starter-brand"
        className="mb-1 text-caption font-[var(--font-weight-signature)] tracking-[var(--tracking-label)] text-[color:var(--topology-v2-panel-text-quaternary)]"
      >
        {t("brand")}
      </p>
      {/* There are two status signals — "First Run" (when) and "Currently Sample"
          (whose data). The amber dot used to sit beside "First Run" on the left,
          where the colour read as a lone third signal. Moving the dot next to
          its own sentence binds them into **one cluster** — the colour and the
          words point at the same thing. */}
      <p
        className={`mb-3 flex items-center gap-2 text-caption text-[color:var(--topology-v2-panel-text-secondary)] ${eyebrowWide}`}
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
        className="mb-4 text-body leading-body text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {/* Demoting the instrument block leaves the card's largest type **tied**
            between the lead and the CTA labels (both 12.5px semibold). There
            must be one attention winner, so only the lead moves one step up the
            ramp (`text-body-lg`, 14px) — and its paired line-height must be
            stated explicitly or the 20px leading of the 12.5px step remains
            (`.claude/rules/design.md`, "a size step carries its own leading").
            Zero new tokens.

            `block` is there because of a measured defect: left inline, the size
            change happened **mid-sentence**, dropping the lead's last syllable
            onto the next line with the smaller type running straight on after it
            ("…map you see / o. Open my markdown folder..."). That is a spot where two
            sizes and two line-heights overlap within one line. A size change may
            happen only at a line boundary. */}
        <b className="mb-1.5 block text-body-lg font-[var(--font-weight-strong)] leading-body-lg text-[color:var(--topology-v2-panel-text-primary)]">
          {t(sampleSource === "storefront" ? "contextStorefrontBold" : "contextBold")}
        </b>
        {t(sampleSource === "storefront" ? "contextStorefrontRest" : "contextRest")}{" "}
        {/* This card's 33 strings contained 「Agent」, 「MCP」, and 「AI」 zero
            times, while the rest of the app used them in 179 places — so the
            first point of contact alone had no identity statement, and the bold
            lead did not distinguish this from any other markdown map tool. One
            sentence, using vocabulary tour step 4 already uses; no new concept. */}
        <span data-testid="first-run-starter-agent-clause">{t("agentClause")}</span>
      </p>

      {/* The empathetic sample vault. The dogfood vault (this tool describing
          itself) does not land with a non-developer, so one click switches to an
          instantly recognizable example business ("Online Shopping Mall"). Reuses the
          same tokens and structure as the existing "All | Recently Changed" segment in
          TopologyIndexPanel.

          Semantics correction (PO council 2026-08-02): it was `role="tab"`, but
          clicking did not change a tab panel — it **collapsed the card**, even
          when pressing the already-selected tab. A tab removing its own screen
          is not the tablist contract. The collapse-on-switch behaviour is kept
          while the semantics become a selection control (`aria-pressed`), and
          re-clicking the current selection does nothing. */}
      <div
        {...sampleSourceGroup.groupProps}
        aria-label={t("sampleSourceAria")}
        data-testid="first-run-starter-sample-source"
        className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
      >
        {/* Order is the default — a newcomer reads the left one first. Hence the
            example business first and this app's own code second. The two
            buttons differ only in their text, so they are driven from data
            (which prevents fixing only one of them). */}
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
            /* Borderless inset plus panel ink plus ellipsis — the three axes line
               up exactly for this one slot. `--chrome-radius-inner` is an alias
               of `--radius-chip`, so the radius is unchanged (zero pixel change). */
            className={controlClass({
              shape: "segment",
              scope: "panel",
              truncate: true,
              active: sampleSource === source,
              className: `touch-hit-expand min-w-0 ${
                sampleSource === source
                  ? ""
                  : "hover:text-[color:var(--topology-v2-panel-text-primary)]"
              }`,
            })}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {/* Instrument demotion (PO council 2026-08-02) — the concept, relation, and
          domain counts were a three-way inset instrument block (19px mono
          semibold), measured as **the largest type and highest luminance in the
          card**. Instrument treatment belongs to the moment the user's **own**
          vault is open. This card renders only before that, so the strongest ink
          here being someone else's sample size contradicts a screen that says
          "Sample Now" four times. The numbers' source is unchanged — a
          `topologyCanonicalCensus` derivation arrives as props, and the ban on
          hardcoded numbers (2026-08-01 ledger) still holds. */}
      <p
        data-testid="first-run-starter-sample-scale"
        className="mb-4 text-label leading-label text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {t("sampleScale", { concepts, relations, domains })}
        {/* One real edge teaches "relation" better than three aggregates. It does
            not pretend to be a queried fact, though — zero wiring, a static
            sentence in the grammar of an example. The storefront sample really
            does have `domains/order` relates `domains/fulfillment`. The dogfood
            vault is left empty rather than forcing a symmetry. */}
        {sampleSource === "storefront" ? (
          <span className="block text-[color:var(--topology-v2-panel-text-quaternary)]">
            {t("sampleRelationExample")}
          </span>
        ) : null}
      </p>

      {fsaUnsupported ? (
        /* Safari and Firefox have no File System Access API, so both "open
           folder" and "create a new vault" failed only after being pressed (the
           most prominent indigo button ending in one line of error as a first
           impression). Degrade honestly up front: one line of unsupported notice
           plus a link to the macOS app (/download). */
        <div
          data-testid="first-run-starter-unsupported"
          className="rounded-card border border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--topology-v2-panel-recess-a45)] px-3 py-2.5"
        >
          <p className="text-label leading-label text-[color:var(--topology-v2-panel-text-tertiary)]">
            {t("unsupportedNotice")}
          </p>
          <Link
            href="/download/"
            data-testid="first-run-starter-unsupported-cta"
            className={controlClass({ shape: "link", tone: "accentOnTint", className: "mt-2 gap-1.5 text-body font-[var(--font-weight-signature)] hover:text-[color:var(--topology-v2-panel-text-primary)]" })}
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
            <span className="rounded-micro border border-b-2 border-[color:var(--color-keycap-edge-on-accent)] px-1.5 py-px font-mono text-caption font-[var(--font-weight-signature)] opacity-80">
              ⌘O
            </span>
          ) : null}
        </button>
      )}

      {/*
        ⚠️ **The door for someone who already has code** (decision, 2026-08-24; it overturns that
        record's own no-go on this card's affordance count, on the owner's instruction).

        Measured on the shipped card: of its four actions **none makes an ontology from a
        repository that already exists**. Opening a folder with no Markdown gives an empty map,
        creating one gives five seeded examples, and the only real path was the folded terminal
        row whose own copy tells app users it excludes them.

        It stays **secondary**, outlined rather than filled. The 2026-08-02 record set this card's
        attention hierarchy deliberately and a second filled indigo would give it two winners; the
        addition is a route, not a re-ranking.

        Drawn only in the installed app. The web has no agent to hand the work to, and a door that
        cannot open is worse than no door — the same rule that keeps 「coming soon」 out of this
        product.
      */}
      {canBuildFromCode && !fsaUnsupported ? (
        <BuildFromCodeDoor build={build} variant="card" disabled={busy} />
      ) : null}

      {/* The tour's only entry point was a single icon in the right rail, and
          non-developers did not find it (measured in a live walkthrough).
          Promoted to a secondary CTA directly beneath the folder CTA — the "look
          around before opening" path. */}
      {onStartTour ? (
        <button
          type="button"
          data-testid="first-run-tour-cta"
          onClick={onStartTour}
          className={controlClass({ shape: "card", className: "touch-hit-expand mt-2 inline-flex h-8 w-full justify-center gap-1.5 border-[color:var(--topology-v2-panel-divider)] text-body text-[color:var(--topology-v2-panel-text-secondary)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--topology-v2-panel-text-primary)]" })}
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
                "touch-hit-expand border-b border-transparent pb-px hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
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
              "touch-hit-expand border-b border-transparent pb-px hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
          })}
        >
          {t("dismissLabel")}
        </button>
      </p>

      {/* A non-developer had no way to discover the "view mode" toggle inside the
          gear menu. When the callback is supplied, the hint sentence is promoted
          to a one-click toggle button — telling someone to "turn it on in the
          gear menu" was itself the friction. Without the callback the old hint stays. */}
      {onEnablePlainMode ? (
        audiencePlain ? null : (
          <button
            type="button"
            data-testid="first-run-plain-toggle"
            onClick={onEnablePlainMode}
            /* Ramp floor 24 (`min-h-6`) with the coarse hit area from
               `touch-hit-expand` — putting 44 in the box height would open this
               card up by 44px vertically. */
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
          className="mt-1 text-label leading-label text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {t("plainModeHint")}
        </p>
      )}

      {/* The raw browser string (`errorText`) used to occupy the whole
          user-facing slot. `window.showDirectoryPicker is not a function` is not
          a sentence a person can read and choose a next action from. Now one
          human sentence comes first and the cause string stays beneath it as a
          quiet clue — the cause is kept while the reading order is inverted.
          2026-08-02 — when the reference block moved to the bottom, this warning
          was pushed to the end of the card, far from the button it explains. It
          stays inside the action layer. */}
      {errorText !== null ? (
        <div role="alert" className="mt-2">
          <p className="text-label text-[color:var(--color-status-danger)]">
            {t("errorFallback")}
          </p>
          {errorText ? (
            <p
              data-testid="first-run-starter-error-detail"
              className="mt-0.5 break-words text-label leading-label text-[color:var(--topology-v2-panel-text-quaternary)]"
            >
              {errorText}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The reference layer (PO council 2026-08-02) — the glossary and the
          developer disclosure are "look at when needed", not "do now". `mt-auto`
          stands them at the bottom, creating a gap from the action layer. The
          empty space is left as is — the prescription is to separate the layers,
          not to fill it. */}
      <div className="mt-auto">
      {/* The three-term definitions (domain / capability / element) were promoted
          from the "?" shortcut modal to this first-run card. They are three
          always-visible lines rather than hidden behind a disclosure — this is
          the surface where a complete beginner must learn what the three words
          mean the moment they first open the map, so it is not something to fold. */}
      <div className="mt-4 border-t border-[color:var(--topology-v2-panel-divider)] pt-3">
        <p
          className={`mb-1.5 text-caption text-[color:var(--topology-v2-panel-text-quaternary)] ${eyebrow}`}
        >
          {glossary("title")}
        </p>
        {/**
         * **The term column's width is a design decision, not a by-product of
         * word length** (dogfooding 2026-07-29, measured on the English screen).
         *
         * The draft used `flex flex-wrap`, so each definition sat directly after
         * its term. Korean terms are a uniform two or three characters, so the
         * `=` lined up by coincidence; in English the terms differ (Domain 38px,
         * Capability 50px, Element 41px) and the `=` scattered across
         * 173.9 / 186 / …, and **the third row's definition dropped entirely to
         * the next line**, restarting at the left edge of the term column:
         *
         *     Element =
         *     A piece of code or a doc that implements it
         *
         * Two rows read as `term = definition` while one row reads as different
         * grammar.
         *
         * A two-column grid fixes it — the term column is sized once against the
         * longest term (`auto`) and the definition column takes the rest. A long
         * definition wraps within its own column instead of under the term. The
         * `=` stands on one line in every language.
         */}
        {/**
         * The columns are declared **as an inline style.** Written first as
         * `grid-cols-[auto_auto_1fr]`, Tailwind **did not generate** that
         * utility: the class stayed as a string, `grid-template-columns` became
         * `none`, and the three cells stacked into one column — the screen got
         * quietly worse while types, lint, and contract tests all passed. This is
         * the same failure `.claude/rules/design.md` records for the type ramp
         * (*"an undefined step is silent — something that does not exist leaves no
         * literal, so it is outside the reach of hardcoding checks"*), reproduced
         * on a different utility family.
         *
         * An inline value cannot fail to exist. `minmax(0, 1fr)` stops the
         * definition column from refusing to shrink below its own minimum on a
         * long sentence (grid's default `min-width: auto` causes overflow).
         */}
        <dl
          data-testid="first-run-starter-glossary"
          style={{ gridTemplateColumns: "auto auto minmax(0, 1fr)" }}
          className="grid gap-x-1.5 gap-y-1 text-label leading-label"
        >
          {GLOSSARY_TERMS.map((term) => (
            <Fragment key={term}>
              <dt className="font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-secondary)]">
                {glossary(`${term}Term`)}
              </dt>
              <span
                aria-hidden="true"
                className="text-[color:var(--topology-v2-panel-text-quaternary)]"
              >
                =
              </span>
              <dd className="text-[color:var(--topology-v2-panel-text-tertiary)]">
                {glossary(`${term}Definition`)}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>

      {/* The bridge to automatic codebase bootstrap (CLI/agent only). The two
          buttons above (open folder / create a new vault) only open an empty
          vault; they do not answer "analyze my repo and fill it in" — that answer
          is `node $ATLAS/cli/src/index.mjs bootstrap`, and the web's first screen
          had no pointer to it at all. It is hidden behind a collapsed disclosure
          so it is out of a non-developer's line of sight and only whoever expands
          it sees the command.
          Copy correction (PO council 2026-08-02): the label said "Start automatically from codebase" (= my repo), but the command takes a relative path
          and therefore scans **the folder it runs in** — inside a source checkout
          it bootstraps atlas itself. The command is the CLI's public contract and
          out of scope here, so the copy is narrowed to what the command actually
          does (consistent with `cliBridgeSourceOnly`'s honest notice). The toggle
          also moves from addressing a role ("If you are a developer") to addressing an action. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCliOpen((open) => !open)}
          aria-expanded={cliOpen}
          aria-controls="first-run-starter-cli-bridge"
          data-testid="first-run-starter-cli-toggle"
          className={controlClass({
            shape: "link",
            scope: "panel",
            tone: "muted",
            className:
              "touch-hit-expand hover:text-[color:var(--topology-v2-panel-text-secondary)]",
          })}
        >
          <ChevronRight
            size={ICON_SIZE.sm}
            aria-hidden
            className={`transition-transform motion-reduce:transition-none ${
              cliOpen ? "rotate-90" : ""
            }`}
          />
          {t("cliBridgeToggle")}
        </button>
        {cliOpen ? (
          /* Owner report 2026-07-23 — the label, command, and copy button split
             one row three ways, truncating the command mid-word
             ("npx ontology-atlas i…"). Split into a header row (label plus copy)
             and a full-width code line that wraps at word boundaries, so the full
             command is always visible. */
          <div
            id="first-run-starter-cli-bridge"
            data-testid="first-run-starter-cli-bridge"
            className="mt-2 rounded-chip border border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--topology-v2-panel-recess-a35)] px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 break-keep text-caption leading-display-tight text-[color:var(--topology-v2-panel-text-quaternary)]">
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
            <code className="mt-1 block whitespace-pre-wrap break-words font-mono text-label leading-label text-[color:var(--topology-v2-panel-text-secondary)]">
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

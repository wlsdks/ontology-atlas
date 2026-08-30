'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePanelPresence } from '@/shared/lib/use-presence';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Bell,
  Bot,
  ChevronRight,
  DownloadCloud,
  Expand,
  Footprints,
  HardDrive,
  Layers,
  MessageSquare,
  Monitor,
  Settings,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { useLocalVault } from '@/features/docs-vault-local';
import { useGuideAutoStart, useGuideReplay, writeGuideAutoStart } from '@/features/guided-tour';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  openTauriVaultInFinder,
} from '@/shared/lib/tauri-vault-fs';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { useDialogFocusTrap } from '@/shared/lib/use-dialog-focus-trap';
import { cn } from '@/shared/lib/cn';
import { Chip, IconButton, RowButton } from '@/shared/ui/controls';
import { subscribeSettingsViewIntent } from '@/shared/lib/settings-view-intent';

import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from '@/shared/ui/route-focus-manager';
import { DESTINATION_HREF } from '@/shared/config/destinations';

import { AppUpdateSettings } from './AppUpdateSettings';
import { AccentPicker, CanvasBackgroundPicker, GlyphSetPicker } from './AppearancePickers';
import { FootprintSettings } from './FootprintSettings';
import { ExpandSettings } from './ExpandSettings';
import { AgentActivitySettings } from './AgentActivitySettings';
import { SegmentSwitch, SettingsGroup, SettingsRow } from './settings-primitives';
import { useFrameMeter, writeFrameMeter } from '@/shared/lib/appearance-preferences';
import { BlockImportModule } from '@/features/ontology-blocks';
import { AiConnectionPanel } from './AiConnectionPanel';
import { useAiConnection } from '../model/use-ai-connection';
import { AGENT_GRAPH_WORKFLOW_HREF } from '@/shared/config';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * The single settings surface (settings consolidation 2026-07-24, owner
 * instruction). Settings used to be scattered across two places: ① the nav
 * rail gear's "map settings" popover (TopologyV2SettingsGear — language, view
 * mode, INDEX default state, switch vault) and ② each page header's "settings"
 * pill opening a five-tab "app settings" modal (three of the tabs were
 * effectively one link plus a large empty area). This widget is now settings'
 * only home: no tabs, a single-column sheet, and the "group header +
 * immediately operable rows" grammar (Toss public talks — one thing per screen,
 * simplified hierarchy).
 *
 * - [screen] language · view mode (when the host injects it) · INDEX default
 *   state. Map screen state (HomePage state) arrives through the optional
 *   `screenControls` prop, so pages that do not inject it do not render those
 *   rows.
 * - [workspace] one row of current vault name and status, plus open/switch
 *   folder and a docs-vault link. Of the old vault tab's LocalVaultPicker
 *   surface, **copy path and reveal in Finder** were restored into this group in
 *   #72 — the B2 merge recorded them as "handled by the /docs vault pill", but no
 *   surface actually rendered that component, so they were lost outright on the
 *   desktop (review 2026-07-25).
 * - [my agent connection] `VaultAgentSetupPanel` — the config file that lets
 *   outside tools (Claude Code · Codex · Cursor · Antigravity) read this folder.
 *   The long MCP proof, the status card grid and the decision-order document sit
 *   behind the "Advanced, detailed verification" fold.
 * - [in-app agent] (#80) key registration, connection check, sent log. Zero new
 *   routes — settings has one home.
 *
 * ## The drill-in corridor was removed (2026-08-02, design council A-3)
 *
 * Those last two were once **two summary rows inside one LNB section** called
 * "AI Agent", each drilling into a subview. Measuring that corridor pane gave
 * 108px of ink out of 698×617 — **82.5% empty** with zero settings items. A pane
 * where nothing can be chosen was consuming a whole section. Worse, drilling in
 * removed all 180px of the LNB, so the list you had just chosen from was gone and
 * a back step appeared.
 *
 * So **the corridor was deleted and both destinations promoted into the LNB**
 * (6 rows → 7). Subview transitions 2 → 0, back steps 1 → 0, LNB always present.
 * It also ended three names all starting with "AI" that never separated on their
 * first character — now "My" versus "In-app".
 *
 * The P3 defect ⑥ contract still holds — `open`/`onOpenChange` are optional
 * controlled props, ⌘K yields to the palette (settings demote), and Escape is
 * owned by this dialog and stopPropagation keeps it from leaking into the map's
 * Esc dismissal order.
 */

/**
 * LNB items — the left list's order and grouping *is* this array.
 *
 * "Map Background" (map background) and "Footprints" (footprints) sit at the **same
 * level** as "Screen" (screen) rather than under it because they carry 4 and 8
 * values respectively, and folding them into the screen section would let that
 * section swallow the rest. An LNB's advantage over drill-in is that adding a
 * section is nearly free, so sections were added.
 *
 * ## Why there are groups and icons (measured 2026-07-29)
 *
 * A text-only list with no icons put **19–51px** of text into a 163px item — 70%
 * of the width empty, and 329 of 505px (65%) empty vertically. That space is not
 * whitespace; it is **an absence of information**.
 *
 * Icons are not decoration but a **scanning channel** (in a list you reopen
 * repeatedly they let you remember positions before reading words). The group
 * titles say why the five items are in that order — the first three are what you
 * see, the last two are what this app is connected to.
 *
 * ## Dimensions are not borrowed from chrome (2026-08-02, owner: *"This LNB button is small too"*
 * — this LNB button is small too)
 *
 * Items used to be `px-2.5 py-1.5`, giving a height of **32px** with **14px**
 * icons. 32px is the nav rail utility tile's value
 * (`--app-nav-rail-tile-height`), and 14px has no basis anywhere in this sheet.
 * So the dimensions of **a tool bar that floats over the map and yields screen
 * space** were being borrowed by *a destination you deliberately enter to read
 * and choose in* — the exact reason "Locked-scale contract" (the locked-scale contract)
 * limits its own reach to workbench chrome, applied here in reverse
 * (`design.md`, the same logic as the `GatewayNav` exception).
 *
 * So the values are drawn **from inside this sheet**. No new tokens:
 *
 * - `px-3 py-2` — **the same padding** as the right pane's `SettingsRow`. Equal
 *   vertical inset derives a height of 36px, and equal horizontal inset puts the
 *   left list's and the right rows' text on the same rhythm.
 * - `text-body-lg` (14px) — this list is **what you choose from first** when the
 *   sheet opens (the attention winner). It has to be one step above the right
 *   rows' labels (12.5px) so "where do I go" and "what do I change" do not
 *   compete at equal weight.
 * - 16px icons — at 14px they matched the text (14px) and never became a
 *   scanning channel.
 */
const SETTINGS_GROUPS = [
  // Why "Expand" (expand) sits **between** background and footprints (owner,
  // 2026-08-01: *"It seems like putting one above footprints would work"* — put one above footprints):
  // the first two are what the map is drawn from (ground, glyphs) and expand is
  // what opens on top of that. Footprints are the trace left after everything is
  // drawn, so last is right.
  // Why "Notifications" (notify) sits **after** footprints: the first four follow how the
  // map is drawn (ground · glyph · expand · trace), and notify is the layer where
  // the app speaks on top of it. Why it is not moved under "Connected" is in the
  // render-branch comment.
  { key: 'look', items: ['screen', 'background', 'expand', 'footprint', 'notify'] },
  // Why "My Agent Connection" and "In-App Agent" sit **side by side** here: they
  // are two different destinations, not two summary rows of one section. One is
  // the **config file** that lets outside tools read this folder; the other is the
  // **key** for talking to an agent inside the app.
  /*
   * These three names **stay in English** (owner call, 2026-08-16: *"Wouldn't it be better to split these into Agents, MCP API KEY? They don't need to be Korean."* —
   * splitting into Agents, MCP and API KEY seems better, and they don't have to be
   * Korean). The three previous names (「Runtime」 · 「My Agent Connection」 ·
   * 「In-App Agent」) were all coinages of ours that said nothing about what the
   * pane does — 「Runtime」 especially is a literal translation of "runtime" and
   * means nothing when read in Korean.
   *
   * Agents · MCP · API Key are words the target user **already knows**, and they
   * do not overlap. What each pane does is stated in plain language by the line at
   * its top — the name is for finding, the explanation happens inside.
   *
   * The order carries meaning: **「Agents」 is first** because it is the path to
   * talking to an agent right inside this app, and **API Key is last** because
   * that path is frozen and was deliberately de-emphasised (2026-08-16 PO council).
   *
   * Name history — it has gone back and forth three times, so read this before a
   * fourth:
   * ① 「Agents」·「MCP」 (owner call, 2026-08-16) → ② 「Chat in App」 ·
   * 「Connect from Terminal」 (2026-08-17): someone trying to connect an agent could not
   * tell which of the two to press — one was a category name, the other a protocol
   * acronym, and both read as "connect an agent". So they were split by **where
   * you use them**. → ③ 「Agents」·「MCP Connection」 (owner instruction, 2026-08-19):
   * 「MCP Connection」 answers its half of the 08-17 concern (an acronym alone does not
   * show what action it is) with 「Connection」, but 「Agents」 still does not say that it
   * means in-app conversation — the one-line intro at the top of each pane carries
   * that distinction instead.
   * The 「Agents」 label is not a vendor condition — the list uses `Claude Agent`
   * (the recommended dropdown name), so it does not depend on being "inside a menu
   * named Agents" (`tests/contract/vendor-naming.contract.test.ts`).
   */
  /*
   * ⚠️ **`runtimes` and `agent` left for the 「Agent」 destination on
   * 2026-08-20** (ledger 90). Settings is where you choose values, while
   * downloading, installing, connecting and repairing tools is **operational work
   * with progress**, and a modal that blocks what is behind it is the wrong
   * container for that.
   *
   * What remains is 「Folder」 (folder) and 「Key」 (key) — both values you set once.
   * (`ai` is not promoted to a destination because the 2026-08-16 "frozen path,
   * de-emphasised" decision still stands.)
   *
   * For anyone looking for what left, **one signpost row stands at the head** of
   * this group — it draws no content and only sends you to the destination.
   */
  { key: 'connect', items: ['workspace', 'ai'] },
  /*
   * Why 「App」 (app) is **last**: the two groups before it are things you touch
   * daily (how the map looks · what attaches to this folder), while this group is
   * about **the app itself** and you only come here to look something up. It is
   * also where macOS convention puts it (about and updates at the end of a list).
   *
   * Desktop only — a browser tab cannot replace itself, so talking about updates
   * on the web offers something we cannot do. The section simply does not exist.
   */
  { key: 'app', items: ['update'] },
] as const;

type SettingsSection = (typeof SETTINGS_GROUPS)[number]['items'][number];

/** Section → icon. Exactly one icon per item, so this table is the single source. */
const SECTION_ICON: Record<SettingsSection, typeof Monitor> = {
  // A downward arrow — the only «fetches something in» silhouette in this list.
  update: DownloadCloud,
  screen: Monitor,
  background: Layers,
  // Arrows spreading in four directions — the only «expands outward» silhouette
  // in this list, so it never blurs with the rectangle (Monitor), stacked plates
  // (Layers), footprints, drive or bot (icons are a scanning channel, see above).
  expand: Expand,
  footprint: Footprints,
  // A bell — the only «ringing» silhouette in this list. It cannot be confused
  // with the speech bubble (ai): a bubble means «I speak to it», a bell means «the
  // app calls me», and their outlines separate as rectangle versus triangle.
  notify: Bell,
  workspace: HardDrive,
  ai: MessageSquare,
};
/**
 * Hover for an LNB row — **written in one place only** (2026-08-21).
 *
 * The signpost row made this hover a second copy. The value layer's
 * `hoverSurface: 'lift'` gives the row `overlay-1`, but this sheet's sibling rows
 * use `overlay-2`, so going through the axis would make **only this row brighten
 * differently**. So instead of moving it to the axis, the copy is deleted — what
 * the ratchet exists to stop is hand-written hovers **increasing**, and this
 * constant reduces them.
 */
const SETTINGS_NAV_ROW_HOVER =
  'hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]';

type SettingsTriggerVariant = 'header-pill' | 'rail-tile' | 'chrome-tile';

const SETTINGS_LOCALE_FOCUS_KEY = 'ontology-atlas:settings-locale-focus';
const SETTINGS_LOCALE_FOCUS_MAX_AGE_MS = 10_000;

/**
 * The **border and hover** of the indigo emphasis chip — the two layers the value
 * layer does not supply.
 *
 * `tone: 'accentOnTint'` gives only the text colour (that is what the ramp owns).
 * The border tint and hover colour are still outside the ramp, so three places
 * were each holding the same string by hand. One copy removes the divergence, and
 * when the ramp gains this layer there will be one place to delete.
 */
const INDIGO_ACTION_CHIP =
  'shrink-0 border-[color:var(--color-indigo-line-a32)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]';
// The single source for the value is `@/shared/config` — writing it again here
// makes it diverge from the sheet's copy, which is what actually happened on
// 2026-08-01. This file only consumes it and re-exports the name for existing
// consumers.
export { AGENT_GRAPH_WORKFLOW_HREF };

interface SettingsLocaleFocusIntent {
  locale: string;
  triggerVariant: SettingsTriggerVariant;
  createdAt: number;
}

function rememberSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
) {
  try {
    const intent: SettingsLocaleFocusIntent = {
      locale,
      triggerVariant,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(SETTINGS_LOCALE_FOCUS_KEY, JSON.stringify(intent));
  } catch {
    // sessionStorage unavailable — navigation still proceeds without restoration.
  }
}

function consumeSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
): boolean {
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_LOCALE_FOCUS_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as Partial<SettingsLocaleFocusIntent>;
    const age = Date.now() - Number(intent.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > SETTINGS_LOCALE_FOCUS_MAX_AGE_MS) {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
      return false;
    }
    if (intent.locale !== locale || intent.triggerVariant !== triggerVariant) return false;
    window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    return true;
  } catch {
    try {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    } catch {
      // sessionStorage unavailable — leave no in-memory focus contract behind.
    }
    return false;
  }
}

interface AppSettingsScreenControls {
  audiencePlain: boolean;
  onAudiencePlainChange: (next: boolean) => void;
  indexCollapsed: boolean;
  onIndexCollapsedChange: (next: boolean) => void;
}

export interface AppSettingsMenuProps {
  mode: 'static' | 'local';
  /** Controlled open state. Unset means self-managed (the previous behaviour). */
  open?: boolean;
  /** Called whenever open changes in controlled mode — the caller updates the real state. */
  onOpenChange?: (next: boolean) => void;
  /**
   * Screen state injected by the map (HomePage) only — view mode (dev/normal) and
   * INDEX default state. Those rows appear in the [screen] group only on pages
   * that inject them.
   */
  screenControls?: AppSettingsScreenControls;
  /**
   * Trigger surface contract. `header-pill` (default) = the page header's
   * "settings" pill. `rail-tile` = the nav rail's lower utility tile (the same
   * `--app-nav-rail-tile-*` geometry as activity and trail). `chrome-tile` = the
   * `--chrome-tile-size` tile in the `<lg` top utility lane. It inherits the old
   * TopologyV2SettingsGear's trigger grammar exactly — the only difference is that
   * this sheet opens instead of a popover.
   */
  triggerVariant?: SettingsTriggerVariant;
}

export function AppSettingsMenu({
  mode,
  open: openProp,
  onOpenChange,
  screenControls,
  triggerVariant = 'header-pill',
}: AppSettingsMenuProps) {
  const t = useTranslations('nav.settingsMenu');
  // #72 — the copy-path and Finder strings reuse the keys the old
  // LocalVaultPicker used, so only the surface moves and no copy is duplicated.
  const tPicker = useTranslations('featuresMisc.localVaultPicker');
  const locale = useLocale();
  const { state: copyState, copy } = useCopyFeedback();
  const router = useRouter();
  const localVault = useLocalVault();
  // Whether the bundled MCP server exists — decides whether one-click is possible.
  // The guide the current screen registered for "reopen the guide". On a screen
  // with no registration the row itself is absent (no empty rows, no dead buttons).
  const replayGuide = useGuideReplay();
  const guideAutoStart = useGuideAutoStart();
  const frameMeter = useFrameMeter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next);
      else setInternalOpen(next);
    },
    [isControlled, onOpenChange],
  );
  /** The LNB section currently shown. It survives closing the sheet (session only) — reopening lands where you were. */
  const [section, setSection] = useState<SettingsSection>('screen');
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const panelRef = useDialogFocusTrap<HTMLDivElement>({
    open,
    initialFocus: 'container',
    // closePanel owns the return target so ⌘K can intentionally yield focus
    // to the command palette without the modal cleanup stealing it back.
    restoreFocus: false,
    // ⚠️ trapTab defaults to true — this sheet regressed to modal plus dim on
    // 2026-07-30 (`aria-modal="true"`) and really does trap Tab. The "the dock is
    // non-modal" comment that used to sit here predated that and was deleted as
    // misinformation.
  });
  const titleId = useId();
  const isDesktopRuntime = isTauriVaultRuntime();

  const isLocalVaultLoaded = localVault.status === 'loaded';
  // #72 — the absolute path is knowable only on the desktop (a web FSA handle has no path).
  const vaultRootPath =
    isLocalVaultLoaded && localVault.handle
      ? (getTauriVaultRootPath(localVault.handle) ?? null)
      : null;

  const showVaultManagement = localVault.status !== 'unsupported';
  const vaultBusy = localVault.status === 'opening' || localVault.status === 'loading';
  const localVaultValidationSummary = (() => {
    if (localVault.status !== 'loaded' || !localVault.manifest) return null;
    const summary = summarizeVaultValidation(
      localVault.manifest.docs.map((doc) => ({
        slug: doc.slug,
        frontmatter: doc.frontmatter,
      })),
    );
    if (summary.errorCount === 0 && summary.warningCount === 0) return null;
    return { errorCount: summary.errorCount, warningCount: summary.warningCount };
  })();

  const vaultHref =
    mode === 'local' ? '/docs/' : isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const vaultNavigationHref = buildRouteFocusHref(vaultHref);
  const vaultBody = mode === 'local' ? t('vaultBodyLocal') : t('vaultBodyStatic');
  const vaultCta = mode === 'local' ? t('vaultCtaLocal') : t('vaultCtaStatic');
  const handleVaultNavigate = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    rememberRouteFocusIntent(vaultHref);
  };

  // [in-app agent] (#80) — with the sheet closed, neither the keychain nor the
  // audit log is read (zero silent queries).
  const aiConnection = useAiConnection({
    enabled: open,
    vaultHandle: isLocalVaultLoaded ? (localVault.handle ?? null) : null,
  });

  // P3 defect ⑥ — in controlled mode React state must be the source of truth for
  // this `<details>`. Re-aligning the DOM `open` to the React value on every render
  // removes the race structurally (in uncontrolled mode the same value is a no-op).
  /**
   * Exit presence (frame measurement, 2026-07-28). This sheet spent 8 frames
   * (134ms, peak 2.15) entering and **exactly 1 frame** leaving — that single
   * frame's delta was **4.7×** the entry peak (10.03). `settingsPanelIn` existed
   * with no counterpart: it did not leave the way it came in.
   *
   * Focus return, scroll lock and the Esc handler still read `open`, so behaviour
   * is unchanged and only **the drawing** is extended. That is why it becomes
   * `inert` plus `aria-hidden` while leaving, disappearing immediately from
   * assistive technology and the pointer so two modals are never read at once.
   */
  const settingsPresence = usePanelPresence(open);
  const settingsMounted = settingsPresence.mounted;
  const settingsExiting = settingsPresence.exiting;

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = open;
  }, [open]);

  useEffect(() => {
    if (!consumeSettingsLocaleFocus(locale, triggerVariant)) return undefined;
    const timer = window.setTimeout(() => {
      triggerRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locale, triggerVariant]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const details = detailsRef.current;
      const overlay = overlayRef.current;
      const target = event.target as Node;
      // The overlay is portalled (a direct child of body), so `details.contains`
      // alone misjudges a click inside the sheet as "outside" — check both.
      if (details?.contains(target) || overlay?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, setOpen]);

  const closePanel = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };
  /** Go to the requested section and **focus that list item** — the list records where you arrived. */
  const focusSection = (next: SettingsSection) => {
    setSection(next);
    window.setTimeout(() => {
      navRef.current
        ?.querySelector<HTMLButtonElement>(`[data-testid="app-settings-nav-${next}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  };

  // A request from another surface to open "that place in settings". The map's
  // right dock 「Register Key in Settings」 (register a key in settings) comes in this way —
  // giving the user a door instead of telling them where the gear is.
  //
  // This widget mounts twice depending on viewport width (rail tile at lg+, chrome
  // tile below lg) but **only the visible one responds**. The sheet is portalled,
  // so a hidden instance responding too would open the same sheet twice over. The
  // breakpoint is not duplicated here; the test is whether it actually renders
  // (`offsetParent`), so this code does not diverge when the width contract changes.
  useEffect(
    () =>
      subscribeSettingsViewIntent((next) => {
        const trigger = triggerRef.current;
        if (!trigger || trigger.offsetParent === null) return;
        setOpen(true);
        // With subviews gone the request lands directly on the **LNB section** —
        // the names `'ai'`/`'agent'` are unchanged, so callers see no difference.
        focusSection(next);
      }),
    [setOpen],
  );

  return (
    <details
      ref={detailsRef}
      open={open}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        // Guardian B2 — transient mutual exclusion: when ⌘K (the palette) opens,
        // settings demotes (no simultaneous stack, design.md popup-soup contract).
        // It closes without returning focus so the palette can take it.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          closePanel(false);
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        // This dialog owns Escape so the map's Esc dismissal order (a window
        // keydown) does not react twice to the same keypress — "one overlay owns
        // one Escape" (the same contract as the old settings gear). With drill-in
        // subviews gone the order is one rung: this sheet closes.
        event.stopPropagation();
        closePanel();
      }}
    >
      <summary
        ref={triggerRef}
        aria-label={t('triggerAria')}
        aria-expanded={open}
        title={t('triggerTitle')}
        data-testid="app-settings-trigger"
        data-trigger-variant={triggerVariant}
        onClick={(event) => {
          event.preventDefault();
          setOpen(!open);
        }}
        className={cn(
          ' list-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden',
          triggerVariant === 'rail-tile'
            ? // Nav rail utility tile contract — the same geometry and state
              // choreography as activity (AppNavRail) and trail (GitStatusTile).
              'flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)]'
            : triggerVariant === 'chrome-tile'
              ? // The `<lg` top utility lane's ChromeTile contract — height,
                // radius and surface matching the other tiles on that row.
                'flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
              : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-2 text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
        )}
      >
        <Settings
          size={triggerVariant === 'header-pill' ? 14 : undefined}
          aria-hidden
          className={
            triggerVariant === 'rail-tile'
              ? 'h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]'
              : triggerVariant === 'chrome-tile'
                ? 'size-[var(--topology-chrome-icon-size)]'
                : undefined
          }
        />
        {triggerVariant === 'header-pill' ? (
          <span className="hidden font-mono text-label uppercase tracking-[var(--tracking-caps-08)] sm:inline">
            {t('settingsLabel')}
          </span>
        ) : null}
      </summary>
      {/* `open ||` comes first — at the moment of opening the portal must stand in
          **the same commit** so autofocus and the focus trap find the panel on the
          first render (deferring to an effect is one commit late and focus leaks
          out). The presence check after it extends **only the closing side**. */}
      {(open || settingsMounted) && typeof document !== 'undefined'
        ? createPortal(
      <div
        ref={overlayRef}
        /*
         * **The right-hand dock is gone — this is a modal** (council prescription
         * 2026-07-29, owner instruction).
         *
         * ## Position and nature changed three times; this is the terminus
         *
         * ① centre modal (original) → ② right non-modal dock → ③ centre non-modal
         * → ④ **centre modal plus dim** (owner, 2026-07-30, referencing Claude
         * desktop's settings).
         *
         * The reason for ② was *"The settings window covers the map"* — the 「Map Background」 and 「Footprint」 sections promise *"change
         * it and the map updates immediately"* while covering that very map. So the
         * scrim was removed to keep the map visible.
         *
         * **That reason has gone away.** Both sections already carry a **live
         * preview inside the panel**: `FootprintSettings`' `FootprintPreview` draws
         * with the **same renderer** as the map, and the background swatches draw
         * with the real `--canvas-bg-*` tokens. So seeing the result while changing
         * a value was being solved **by the preview, not by the map**, and the dock
         * was sacrificing position for a problem already solved.
         *
         * So the dim comes back. With no overlap there is no need for the side
         * wiring that collapsed INDEX either (it was added once and reverted — it
         * did the dim's job a second time).
         *
         * ⚠️ **With a dim, `aria-modal` becomes true.** Not setting it during ②③
         * was not discipline but **fact** — telling assistive technology to ignore
         * an outside that is still alive is a lie. It really does block now, so it
         * is set again. The focus trap returns for the same reason.
         *
         * The portal (a direct child of body) stays — whichever chrome container
         * the trigger sits in, the sheet is not trapped in its stacking context.
         */
        className={`${settingsExiting ? 'app-settings-scrim-out' : 'app-settings-scrim-in'} fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[color:var(--color-backdrop-medium)] p-3 sm:p-6`}
        aria-hidden={settingsExiting || undefined}
        inert={settingsExiting || undefined}
        {...transientSurface("sheet")}
      data-testid="app-settings-overlay"
      >
        <div
          ref={panelRef}
          role="dialog"
          // The dim really does block what is behind, so `aria-modal` is **true**.
          // It was not set while this was a non-modal dock — the outside was alive
          // then, and telling anyone to "pretend it is gone" would have been a lie.
          aria-modal="true"
          aria-labelledby={titleId}
          data-surface-role="settings-dock"
          tabIndex={-1}
          /*
           * **Fixed size** (owner call, 2026-07-29: *"It needs sensible width and height and a fixed
           * size"* — it needs sensible width and height and a fixed
           * size). The height used to follow the content length, so the window grew
           * and shrank with every section change — a flat horizontal band in the
           * footprints section, a tall narrow window in the workspace section. A
           * settings window is a place you **stay**, so that wobble reads directly
           * as "untidy".
           *
           * The size has to fit inside the app's minimum window (1040×720) with its
           * own margin, and shrinks to the viewport on narrow screens (the only case
           * where the size changes). Overflowing content **scrolls the right pane**;
           * the window does not grow.
           *
           * ## Height 640 → 672 (2026-08-02, owner: *"The
           * inside of settings feels cramped"*
           *
           * At 640, the busiest section "Screen" was **clipped by 41px** (content 626
           * against a 585 visible pane). At the same time, on the measured 14-inch
           * viewport (1512×806), **118px outside this panel sat empty** — a clipped
           * box and spare room on the same screen, which is the mechanical form of
           * "cramped".
           *
           * 672 is not taste but a **derived value**: within the 696 that remains
           * after subtracting the overlay margin (`p-3`, 12px top and bottom) from
           * the 720 minimum window, it is the tallest height that leaves **one more
           * set** of that margin (696 − 24 = 672). Anything larger eats the gutter it
           * declared for itself in the minimum window. The 880 width is unchanged —
           * widening it only stretches the empty run between label and control
           * (measured at up to 541px).
           */
          className={`${settingsExiting ? 'app-settings-panel-out' : 'app-settings-panel-in'} flex h-[672px] max-h-[calc(100dvh-1.5rem)] w-[880px] focus:outline-none max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-body shadow-[var(--shadow-elevation-3)]`}
          data-testid="app-settings-popover"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* There is no back button — there is nowhere back to go. Every
                  destination is permanently in the LNB, so the title is always this
                  sheet's one name. */}
              <Settings
                size={ICON_SIZE.md}
                aria-hidden
                className="shrink-0 text-[color:var(--color-indigo-accent)]"
              />
              <h2
                id={titleId}
                className="truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
              >
                {t('title')}
              </h2>
            </div>
            {/* A square icon control, so `IconButton` is the right home — the
                accessible name is enforced by the type, and size (h-7 w-7) and tone
                (tertiary) come from the ramp. The missing border is this migration's
                price: the shape derived from the 36 measured icon controls has no
                border (`control-class.ts`). Hover and focus come from the consumer,
                as the discipline requires. */}
            <IconButton
              label={t('closeLabel')}
              onClick={() => closePanel()}
              className="hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset"
            >
              <X size={ICON_SIZE.md} aria-hidden />
            </IconButton>
          </div>

          {
            /*
             * Two-column LNB — list left, content right. Owner instruction
             * (2026-07-29, reconfirmed): *"Other services often use a
             * popup with an LNB; do it that way."* (other services often use a
             * popup with an LNB; do it that way). The earlier drill-in proposal (a
             * council recommendation) was overturned — with five sections, drill-in
             * means going back out and in again every time, which does not suit
             * comparing a handful of values before choosing. On 2026-08-02 the last
             * two drill-ins (agent connection · in-app agent) came up into this list
             * as well, so **no subview remains in this sheet**.
             */
            <div key="root" className="flex min-h-0 flex-1" data-testid="app-settings-body">
              <nav
                ref={navRef}
                aria-label={t('title')}
                data-testid="app-settings-nav"
                className="flex w-[180px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[color:var(--color-border-soft)] p-2"
              >
                {SETTINGS_GROUPS.map((group) => (
                  <div key={group.key} className="mb-3 last:mb-0">
                    <p className="px-2.5 pb-1 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                      {t(`sectionGroup.${group.key}`)}
                    </p>
                    {/*
                      **Signpost row** — the head of the "Connection" group (2026-08-21,
                      ledger 90, hierarchy seat's prescription).

                      When the runtimes and MCP connection panes left for the
                      destination, anyone who used to look for them here needed
                      **to be told where they went**. `surfaces.md`'s
                      "Blocking only half is the worst
                      option" is the basis — if it is removed from the nav, the way
                      in has to answer too.

                      The three hierarchy prescriptions are kept exactly: **zero
                      indigo** (this is not the sheet's protagonist; the winner is
                      "Open Chat" inside the destination) · a **single navigation
                      glyph** with no text in the control position · and it **closes
                      the sheet and goes** rather than drawing the destination's pane
                      inside the sheet.

                      No viewport branching — one sheet becoming two shapes costs
                      more (the hierarchy seat's proviso).
                    */}
                    {group.key === 'connect' ? (
                      <button
                        type="button"
                        data-testid="app-settings-nav-agents"
                        onClick={() => {
                          setOpen(false);
                          router.push(buildRouteFocusHref(DESTINATION_HREF.agents));
                        }}
                        className={controlClass({
                          shape: 'row',
                          size: 'md',
                          tone: 'muted',
                          className: `gap-2.5 rounded-card px-3 py-2 text-body-lg ${SETTINGS_NAV_ROW_HOVER}`,
                        })}
                      >
                        <Bot size={16} aria-hidden className="shrink-0" />
                        <span className="min-w-0 flex-1 text-left">{t('goToAgents')}</span>
                        <ChevronRight
                          size={16}
                          aria-hidden
                          className="shrink-0 text-[color:var(--color-text-quaternary)]"
                        />
                      </button>
                    ) : null}
                    {group.items.map((item) => {
                      const active = item === section;
                      const Icon = SECTION_ICON[item];
                      return (
                        <button
                          key={item}
                          type="button"
                          data-testid={`app-settings-nav-${item}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setSection(item)}
                          className={controlClass({
                            shape: 'row',
                            size: 'md',
                            tone: active ? 'accentOnTint' : 'muted',
                            className: `gap-2.5 rounded-card px-3 py-2 text-body-lg ${
                              active
                                ? 'bg-[color:var(--color-indigo-line-a13)]'
                                : SETTINGS_NAV_ROW_HOVER
                            }`,
                          })}
                        >
                          <Icon size={16} aria-hidden className="shrink-0" />
                          {t(`section.${item}`)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>

              <div
                // The 20px margin is the value from the macOS settings window layout guide.
                className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto p-5"
                data-testid={`app-settings-pane-${section}`}
              >
                {section === 'screen' ? (
                  <>
                  {/* The section title is not repeated — the left list already names this pane. */}
                  <SettingsGroup>
                <SettingsRow
                  label={t('languageTitle')}
                  control={
                    <LocaleSwitch
                      onSwitchStart={(nextLocale) =>
                        rememberSettingsLocaleFocus(nextLocale, triggerVariant)
                      }
                    />
                  }
                />
                {screenControls ? (
                  <>
                    <SettingsRow
                      label={t('viewModeLabel')}
                      caption={t('viewModeCaption')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('viewModeLabel')}
                          testId="app-settings-view-mode"
                          value={screenControls.audiencePlain}
                          onChange={screenControls.onAudiencePlainChange}
                          options={[
                            { value: false, label: t('viewModeDev') },
                            { value: true, label: t('viewModePlain') },
                          ]}
                        />
                      }
                    />
                    <SettingsRow
                      label={t('indexDefaultLabel')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('indexDefaultLabel')}
                          testId="app-settings-index-default"
                          value={screenControls.indexCollapsed}
                          onChange={screenControls.onIndexCollapsedChange}
                          options={[
                            { value: false, label: t('indexDefaultExpanded') },
                            { value: true, label: t('indexDefaultCollapsed') },
                          ]}
                        />
                      }
                    />
                  </>
                ) : null}
                {/* The icon set applies outside the map too (INDEX, studio, detail
                    glyphs), so it stays here rather than in a map subview. */}
                <GlyphSetPicker />
                {/* The accent is here for the same reason — it is the app's only
                    colour, not just the map's, so putting it in a map subview would
                    read as «map settings». */}
                <AccentPicker />
                {/* Replay the on-screen guide (2026-07-26) — a guide appears
                    automatically only once per destination, so there has to be a way
                    back. Adding a help button per screen would make the chrome count
                    diverge screen by screen (the #65 family), so they gather here in
                    the one menu every screen already has. This popover closes before
                    the guide opens — a guide card stacked over settings would break
                    the no-transient-stacking contract. */}
                {/*
                  Auto-display switch — it does not delete the guide. Off simply means
                  it does not appear by itself; "View Again" below and the map's compass
                  tile still open it. Owner: *"It only needs to show the first time, or when clicked"*
                  (it only needs to show the first time, or when clicked).
                */}
                <SettingsRow
                  testId="app-settings-guide-auto-start"
                  label={t('guideAutoStartLabel')}
                  caption={t('guideAutoStartCaption')}
                  control={
                    <SegmentSwitch
                      ariaLabel={t('guideAutoStartLabel')}
                      testId="app-settings-guide-auto-start-switch"
                      value={guideAutoStart}
                      onChange={writeGuideAutoStart}
                      options={[
                        { value: true, label: t('guideAutoStartOn') },
                        { value: false, label: t('guideAutoStartOff') },
                      ]}
                    />
                  }
                />
                {replayGuide ? (
                  <SettingsRow
                    testId="app-settings-replay-guide"
                    label={t('replayGuideLabel')}
                    caption={t('replayGuideCaption')}
                    control={
                      <Chip
                        size="lg"
                        tone="secondary"
                        data-testid="app-settings-replay-guide-button"
                        onClick={() => {
                          closePanel(false);
                          replayGuide();
                        }}
                        className="border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                      >
                        {t('replayGuideAction')}
                      </Chip>
                    }
                  />
                ) : null}
                  </SettingsGroup>
                  </>
                ) : section === 'notify' ? (
                  /*
                   * Why "Notifications" gets its own pane (2026-08-02, owner report).
                   *
                   * These three sat at the **bottom** of the "Screen" section until
                   * yesterday, justified by a comment saying *"both are settings for
                   * what the screen says"*. That sentence is true — and it is exactly
                   * **the argument for a section of their own**. The other six in
                   * "Screen" (language · view mode · INDEX default · glyph set · two
                   * guides) are «how the map is drawn», while these three are «what
                   * the app tells me».
                   *
                   * Volume says the same. Measured: "Screen" carried these three (3
                   * rows plus 6 chips) on top of its own six controls. The 6 chips of
                   * "Notifications Received" are **primary controls**, not collapsed detail, so
                   * another subject was occupying half of one section. Removing them
                   * still leaves six in "Screen".
                   *
                   * Why they go under "Visible Things" rather than "Connected Things":
                   * "Show During Work" literally appears **on the map**, and notifications
                   * are also something the app shows me. "Connected Things" is the place for
                   * «what outside thing this connects to», which is a different nature.
                   */
                  <AgentActivitySettings />
                ) : section === 'background' ? (
                  <>
                  {/* 3D layout (dome/cloud) is not here — the picker the map's top
                      "3D" chip opens owns it (`View3dMenu`). It was here at first and
                      the owner could not find it: *"Where can I see the cloud?"*
                      (where can I see the cloud?). A control that changes what you are
                      looking at belongs over what you are looking at, and two homes
                      break the «one fact, one place» discipline. */}
                  <CanvasBackgroundPicker />
                  {/* Frame meter — puts the map's real frame output in the
                      bottom-right meter stack. **Off by default**, and while off the
                      measurement loop does not run either (a performance meter that
                      eats performance is a liar). Why here: the "Map" pane collects
                      how the canvas is drawn, and the meter floats over that canvas. */}
                  <SettingsGroup>
                    <SettingsRow
                      testId="app-settings-frame-meter"
                      label={t('frameMeterLabel')}
                      caption={t('frameMeterCaption')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('frameMeterLabel')}
                          value={frameMeter}
                          onChange={writeFrameMeter}
                          options={[
                            { value: false, label: t('frameMeterOff') },
                            { value: true, label: t('frameMeterOn') },
                          ]}
                          testId="app-settings-frame-meter-switch"
                        />
                      }
                    />
                  </SettingsGroup>
                  </>
                ) : section === 'expand' ? (
                  <ExpandSettings />
                ) : section === 'footprint' ? (
                  <FootprintSettings />
                ) : section === 'workspace' ? (
                    <>
                  <SettingsGroup>
                {showVaultManagement ? (
                  <SettingsRow
                    testId="app-settings-workspace-folder"
                    label={t('workspaceFolderLabel')}
                    caption={
                      localVault.status === 'error'
                        ? (localVault.errorMessage ?? t('workspaceFolderErrorFallback'))
                        : localVault.status === 'permission-needed'
                          ? t('workspaceFolderPermissionCaption')
                          : isLocalVaultLoaded
                            ? localVaultValidationSummary
                              ? t('workspaceFolderDocCountIssues', {
                                  count: localVault.manifest?.docs.length ?? 0,
                                  errors: localVaultValidationSummary.errorCount,
                                  warnings: localVaultValidationSummary.warningCount,
                                })
                              : t('workspaceFolderDocCount', {
                                  count: localVault.manifest?.docs.length ?? 0,
                                })
                            : undefined
                    }
                    captionTone={
                      localVault.status === 'error'
                        ? 'danger'
                        : localVault.status === 'permission-needed'
                          ? 'warning'
                          : 'neutral'
                    }
                    control={
                      <>
                        <span
                          className={cn(
                            'max-w-[10rem] truncate text-body',
                            isLocalVaultLoaded
                              ? 'text-[color:var(--color-text-primary)]'
                              : 'text-[color:var(--color-text-quaternary)]',
                          )}
                        >
                          {isLocalVaultLoaded && localVault.handle
                            ? localVault.handle.name
                            : localVault.status === 'permission-needed'
                              ? (localVault.handle?.name ?? t('workspaceFolderEmpty'))
                              : t('workspaceFolderEmpty')}
                        </span>
                        {localVault.status === 'permission-needed' ? (
                          <Chip
                            size="lg"
                            tone="warning"
                            onClick={() => localVault.requestPermission()}
                            className="shrink-0 border-[color:var(--color-amber-source-a35)] hover:bg-[color:var(--color-amber-source-a12)]"
                          >
                            {t('workspaceFolderPermissionAction')}
                          </Chip>
                        ) : (
                          <Chip
                            size="lg"
                            tone="accentOnTint"
                            onClick={() => void localVault.open()}
                            disabled={vaultBusy}
                            data-testid="app-settings-open-folder"
                            className={INDIGO_ACTION_CHIP}
                          >
                            {vaultBusy
                              ? t('workspaceFolderOpening')
                              : isLocalVaultLoaded || localVault.status === 'error'
                                ? t('workspaceFolderChange')
                                : t('workspaceFolderOpen')}
                          </Chip>
                        )}
                      </>
                    }
                  />
                ) : null}
                {/* #72 — the selected vault's **absolute path** plus copy and reveal
                    in Finder. The B2 merge (5164f68d7) deleted `VaultToolsMenu`,
                    orphaning the `LocalVaultPicker` that owned this surface so that
                    nothing mounted it, and desktop users lost any way to see where
                    the vault sits on disk (a high-frequency path — pasting it to an
                    agent). The settings sheet's [workspace] group already handles
                    open and switch folder, so this is its home. It renders only when
                    the desktop actually knows the path — on the web it is quietly
                    absent. */}
                {vaultRootPath ? (
                  <SettingsRow
                    testId="app-settings-vault-path"
                    label={tPicker('copyPathTooltip')}
                    caption={vaultRootPath}
                    control={
                      <>
                        <Chip
                          size="lg"
                          data-testid="app-settings-copy-vault-path"
                          onClick={() => void copy(vaultRootPath)}
                          aria-label={tPicker('copyPathAriaLabel', { path: vaultRootPath })}
                          className="shrink-0 hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
                        >
                          {copyState === 'copied'
                            ? tPicker('copyPathCopied')
                            : copyState === 'failed'
                              ? tPicker('copyPathFailed')
                              : tPicker('copyPathTooltip')}
                        </Chip>
                        <Chip
                          size="lg"
                          tone="accentOnTint"
                          data-testid="app-settings-reveal-vault-path"
                          onClick={() => void openTauriVaultInFinder(vaultRootPath)}
                          aria-label={tPicker('revealPathAriaLabel', { path: vaultRootPath })}
                          className={INDIGO_ACTION_CHIP}
                        >
                          {tPicker('revealPathLabel')}
                        </Chip>
                      </>
                    }
                  />
                ) : null}
                {/* Recent workspaces — only while no vault is open (the recovery
                    path). While loading, "switch" (the OS picker) is the high-frequency path. */}
                {showVaultManagement &&
                !isLocalVaultLoaded &&
                localVault.recentVaults.length > 0
                  ? localVault.recentVaults.map((record) => (
                      <div
                        key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                        className="flex min-h-11 items-center gap-2 px-3 py-1.5"
                        data-testid="app-settings-recent-vault"
                      >
                        {/* A whole list row being pressable is `row` (measured 39
                            instances). `disabled:opacity-60` was removed because the
                            value layer already carries the disabled affordance — with
                            two copies, one eventually falls behind. */}
                        <RowButton
                          size="sm"
                          onClick={() => void localVault.openRecent(record)}
                          disabled={vaultBusy}
                          aria-label={t('workspaceRecentOpenAria', { name: record.name })}
                          title={record.desktopRootPath ?? record.name}
                          className="min-w-0 flex-1 hover:bg-[color:var(--color-overlay-2)]"
                        >
                          <HardDrive
                            size={ICON_SIZE.sm}
                            aria-hidden
                            className="shrink-0 text-[color:var(--color-indigo-accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-body text-[color:var(--color-text-secondary)]">
                              {record.name}
                            </span>
                            {record.desktopRootPath ? (
                              <span className="block truncate font-mono text-label text-[color:var(--color-text-quaternary)]">
                                {record.desktopRootPath}
                              </span>
                            ) : null}
                          </span>
                        </RowButton>
                        <IconButton
                          size="sm"
                          tone="muted"
                          onClick={() => void localVault.forgetRecent(record)}
                          label={t('workspaceRecentForgetAria', { name: record.name })}
                          className="hover:bg-[color:var(--color-danger-a10)] hover:text-[color:var(--color-status-danger)]"
                        >
                          <X size={ICON_SIZE.sm} aria-hidden />
                        </IconButton>
                      </div>
                    ))
                  : null}
                <Link
                  href={vaultNavigationHref}
                  onClick={handleVaultNavigate}
                  className={controlClass({ shape: "row", stacked: true, className: "min-h-12 justify-between gap-3 px-3 py-2 hover:bg-[color:var(--color-overlay-2)]" })}
                >
                  <span className="min-w-0">
                    <span className="block text-body text-[color:var(--color-text-secondary)]">
                      {t('vaultTitle')}
                    </span>
                    <span className="mt-0.5 block break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
                      {vaultBody}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-body text-[color:var(--color-indigo-accent)]">
                    {vaultCta}
                    <ChevronRight size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                  </span>
                </Link>
                  </SettingsGroup>
                    {/*
                      "Import nodes from another folder"
                      — moved here from the bottom of INDEX (2026-08-02, owner:
                      *"What is this?
                      why is this text here? is it unnecessary?"*
                      (what is this?
                      why is this text here? is it unnecessary?).

                      Why here: this job is about **what comes into this folder**, and
                      that is this section's subject. It does not belong as a permanent
                      button on a screen for reading the map — it gets used once or
                      twice in a lifetime.

                      The name changed too. "Block" in the old "Import Block" is
                      defined nowhere in this app, so a first-time reader had no way to
                      know what the button opens.

                      The module is self-contained and renders itself only while a
                      vault is loaded.
                    */}
                    <BlockImportModule />
                    </>

                ) : section === 'update' ? (
                  <AppUpdateSettings />

                ) : (
                  <AiConnectionPanel
                    connection={aiConnection}
                    vaultRootPath={vaultRootPath}
                    downloadHref={buildRouteFocusHref('/download/')}
                    onDownloadNavigate={() => rememberRouteFocusIntent('/download/')}
                  />
                )}
              </div>
            </div>
          }
        </div>
      </div>,
          document.body,
        )
        : null}
    </details>
  );
}

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePanelPresence } from '@/shared/lib/use-presence';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Bell,
  ChevronRight,
  DownloadCloud,
  Expand,
  Sparkles,
  HardDrive,
  KeyRound,
  Layers,
  Monitor,
  Plug,
  Settings,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { useLocalVault } from '@/entities/vault-session';
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
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { Chip, IconButton, RowButton } from '@/shared/ui/controls';
import { CloseButton } from '@/shared/ui/close-button';

import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from '@/shared/ui/route-focus-manager';
import { AGENTS_MODELS_HREF, DESTINATION_HREF } from '@/shared/config/destinations';

import { AppUpdateSettings } from './AppUpdateSettings';
import { AccentPicker, CanvasBackgroundPicker, GlyphSetPicker } from './AppearancePickers';
import { FootprintSettings } from './FootprintSettings';
import { ExpandSettings } from './ExpandSettings';
import { AgentActivitySettings } from './AgentActivitySettings';
import {
  DETAIL_TOGGLE_CHIP,
  SegmentSwitch,
  SettingsGroup,
  SettingsPaneHead,
  SettingsRow,
} from './settings-primitives';
import { VaultShapeSettings } from './VaultShapeSettings';
import { WikiWriteModeSettings } from './WikiWriteModeSettings';
import { useFrameMeter, writeFrameMeter } from '@/shared/lib/appearance-preferences';
import { BlockImportModule } from '@/features/ontology-blocks';
import { AGENT_GRAPH_WORKFLOW_HREF } from '@/shared/config';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * LNB items: the left list's order and grouping is this array. Group titles say why items sit
 * in that order, and icons are a scanning channel. Item dimensions come from this sheet, not
 * the workbench chrome (`design.md` locked-scale scope): `px-3 py-2` like `SettingsRow`, the
 * body text step so the pane head stays the loudest line, and 16px icons.
 */
const SETTINGS_GROUPS = [
  // Ordered as the map is drawn (ground, glyphs, expand, the walked path), then notifications,
  // the layer where the app speaks on top of it.
  { key: 'look', items: ['screen', 'background', 'expand', 'footprint', 'notify'] },
  /*
   * Agents, MCP and API Key stay in English: words the target user already knows, with each
   * pane's first line saying what it does. The Agents label is not a vendor condition (`tests/contract/vendor-naming.contract.test.ts`).
   */
  /*
   * Only values set once stay here; operational work with progress (runtimes, agent
   * connection) lives on the Agents destination, reached by signpost rows at this group's head.
   */
  { key: 'connect', items: ['workspace'] },
  /*
   * App is last, as in macOS convention; desktop only, since a browser tab cannot replace itself.
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
  footprint: Sparkles,
  // A bell — the only «ringing» silhouette in this list.
  notify: Bell,
  workspace: HardDrive,
};
/**
 * Hover for an LNB row, defined once: `hoverSurface: 'lift'` gives `overlay-1`, but the
 * sibling rows use `overlay-2`.
 */
const SETTINGS_NAV_ROW_HOVER =
  'hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]';

type SettingsTriggerVariant = 'header-pill' | 'rail-tile' | 'chrome-tile';

const SETTINGS_LOCALE_FOCUS_KEY = 'ontology-atlas:settings-locale-focus';
const SETTINGS_LOCALE_FOCUS_MAX_AGE_MS = 10_000;

/**
 * Border and hover of the indigo emphasis chip, which `tone: 'accentOnTint'` does not supply;
 * delete when the ramp gains this layer.
 */
const INDIGO_ACTION_CHIP =
  'shrink-0 border-[color:var(--color-indigo-line-a32)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]';
// @/shared/config owns the value; re-exported here for existing consumers.
export { AGENT_GRAPH_WORKFLOW_HREF };

interface SettingsLocaleFocusIntent {
  locale: string;
  triggerVariant: SettingsTriggerVariant;
  /** The pane the language was changed from — the sheet reopens there. */
  section?: SettingsSection;
  createdAt: number;
}

function rememberSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
  section: SettingsSection,
) {
  try {
    const intent: SettingsLocaleFocusIntent = {
      locale,
      triggerVariant,
      section,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(SETTINGS_LOCALE_FOCUS_KEY, JSON.stringify(intent));
  } catch {
    // sessionStorage unavailable — navigation still proceeds without restoration.
  }
}

const SETTINGS_SECTIONS: readonly string[] = SETTINGS_GROUPS.flatMap((group) => [...group.items]);

/**
 * Reads the intent left by a language switch: the pane to reopen on, or `null`. `canConsume` is
 * asked first because several instances are mounted and only the visible one may take it.
 */
function consumeSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
  canConsume: () => boolean,
): SettingsSection | null {
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_LOCALE_FOCUS_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as Partial<SettingsLocaleFocusIntent>;
    const age = Date.now() - Number(intent.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > SETTINGS_LOCALE_FOCUS_MAX_AGE_MS) {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
      return null;
    }
    if (intent.locale !== locale || intent.triggerVariant !== triggerVariant) return null;
    if (!canConsume()) return null;
    window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    return typeof intent.section === 'string' && SETTINGS_SECTIONS.includes(intent.section)
      ? (intent.section as SettingsSection)
      : 'screen';
  } catch {
    try {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    } catch {
      // sessionStorage unavailable — leave no in-memory focus contract behind.
    }
    return null;
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
   * Trigger surface: `header-pill` (default) is the page header's settings pill, `rail-tile`
   * the nav rail's lower utility tile, `chrome-tile` the `<lg` top utility lane tile.
   */
  triggerVariant?: SettingsTriggerVariant;
}

/**
 * The single settings surface: a modal sheet with an always-visible LNB and one pane per
 * section, no drill-in. Map screen rows appear only where the host injects `screenControls`.
 * The `open`/`onOpenChange` props are optional controlled props, ⌘K yields to the palette, and Escape
 * stops propagation so it does not reach the map's Esc dismissal order.
 */
export function AppSettingsMenu({
  mode,
  open: openProp,
  onOpenChange,
  screenControls,
  triggerVariant = 'header-pill',
}: AppSettingsMenuProps) {
  const t = useTranslations('nav.settingsMenu');
  // The copy-path and Finder strings reuse the localVaultPicker keys, so no copy is duplicated.
  const tPicker = useTranslations('featuresMisc.localVaultPicker');
  const locale = useLocale();
  const { state: copyState, copy } = useCopyFeedback();
  const router = useRouter();
  const localVault = useLocalVault();
  // The guide the current screen registered for "reopen the guide". On a screen
  // with no registration the row itself is absent (no empty rows, no dead buttons).
  const replayGuide = useGuideReplay();
  const guideAutoStart = useGuideAutoStart();
  const frameMeter = useFrameMeter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [animateSection, setAnimateSection] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) setAnimateSection(false);
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
  /** Whether the current press went down on the dim itself — only such a press may close. */
  const scrimPressRef = useRef(false);
  const navRef = useRef<HTMLElement | null>(null);
  const panelRef = useDialogFocusTrap<HTMLDivElement>({
    open,
    initialFocus: 'container',
    // closePanel owns the return target so ⌘K can intentionally yield focus
    // to the command palette without the modal cleanup stealing it back.
    restoreFocus: false,
    // Tab stays trapped (the default): the sheet is aria-modal over a scrim.
  });
  const titleId = useId();
  const isDesktopRuntime = isTauriVaultRuntime();
  /*
   * The web lists no pane it cannot fill: `AppUpdateSettings` is null outside the desktop
   * shell, so the App group is dropped there.
   */
  const desktopShell = isDesktopShell();
  const settingsGroups = SETTINGS_GROUPS.filter((group) => group.key !== 'app' || desktopShell);
  const shownSection: SettingsSection =
    section === 'update' && !desktopShell ? 'screen' : section;

  const isLocalVaultLoaded = localVault.status === 'loaded';
  // The absolute path is knowable only on the desktop (a web FSA handle has no path).
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


  /**
   * Exit presence, so the sheet leaves the way it came in. Focus return, scroll lock and Esc
   * still read `open`; while leaving the sheet is `inert` and `aria-hidden`, so two modals are
   * never read at once.
   */
  const settingsPresence = usePanelPresence(open);
  const settingsMounted = settingsPresence.mounted;
  const settingsExiting = settingsPresence.exiting;

  // In controlled mode React state is the truth for this `<details>`: re-aligning the DOM
  // open state on every change removes the race (a no-op when uncontrolled).
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = open;
    if (open) {
      navRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [open]);

  /*
   * A language switch remounts the `[locale]` layout, so the sheet reopens on the same pane
   * instead of dropping focus to `<body>`; `RouteFocusManager` leaves the `aria-modal` sheet alone.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const reopen = consumeSettingsLocaleFocus(
        locale,
        triggerVariant,
        () => triggerRef.current !== null && triggerRef.current.offsetParent !== null,
      );
      if (!reopen) return;
      setSection(reopen);
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locale, triggerVariant, setOpen]);

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

  return (
    <details
      ref={detailsRef}
      open={open}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        // ⌘K opens the palette, so settings closes without returning focus: one transient
        // surface at a time (design.md).
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          closePanel(false);
          return;
        }
        // Only an open sheet owns Escape: the gear keeps focus after closing, and a closed sheet
        // that took the key would leave the map's own dismissal order unreachable.
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        // This dialog owns Escape, so the map's window-level Esc order does not react to the
        // same keypress twice; with no subviews the sheet simply closes.
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
      {/* `open ||` first, so the portal mounts in the opening commit and autofocus and the trap
          find the panel; the presence check extends only the closing side. */}
      {(open || settingsMounted) && typeof document !== 'undefined'
        ? createPortal(
      <div
        ref={overlayRef}
        /*
         * A centred modal with a scrim; the map-affecting panes carry live previews, so covering
         * the map costs nothing. Because it truly blocks, `aria-modal` and the focus trap are set.
         * Portalled to body so no chrome stacking context traps it.
         */
        className={`${settingsExiting ? 'app-settings-scrim-out' : 'app-settings-scrim-in'} fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[color:var(--color-backdrop-medium)] p-3 sm:p-6`}
        aria-hidden={settingsExiting || undefined}
        inert={settingsExiting || undefined}
        {...transientSurface("sheet")}
      data-testid="app-settings-overlay"
        /*
         * A press that starts and ends on the scrim closes the sheet, as for every `<Dialog>`; a
         * drag out of the panel is not a dismissal. The press is kept from moving focus, since
         * WebKit would hand it to `<body>`, outside the trap and Escape.
         */
        onMouseDown={(event) => {
          scrimPressRef.current = event.target === event.currentTarget;
          if (scrimPressRef.current) event.preventDefault();
        }}
        onClick={(event) => {
          const pressedOnScrim = scrimPressRef.current;
          scrimPressRef.current = false;
          if (pressedOnScrim && event.target === event.currentTarget) closePanel();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-surface-role="settings-dock"
          tabIndex={-1}
          className={`${settingsExiting ? 'app-settings-panel-out' : 'app-settings-panel-in'} flex h-[var(--dialog-h-lg)] max-h-[calc(100dvh-1.5rem)] w-[var(--dialog-w-lg)] focus:outline-none max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-body shadow-[var(--shadow-elevation-3)]`}
          data-testid="app-settings-popover"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* No back button: every destination is always in the LNB. */}
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
            <CloseButton label={t('closeLabel')} onClick={() => closePanel()} />
          </div>

          {
            /* Two columns, LNB left and content right, with no subviews, so values compare without going back. */
            <div key="root" className="flex min-h-0 flex-1 flex-col sm:flex-row" data-testid="app-settings-body">
              <nav
                ref={navRef}
                aria-label={t('title')}
                data-testid="app-settings-nav"
                className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-[color:var(--color-border-soft)] p-2 scroll-px-2 sm:w-[180px] sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:border-b-0 sm:border-r"
              >
                {settingsGroups.map((group) => (
                  <div key={group.key} className="flex w-max shrink-0 gap-1 sm:mb-3 sm:block sm:w-auto sm:last:mb-0">
                    <p className="hidden px-3 pb-1 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)] sm:block">
                      {t(`sectionGroup.${group.key}`)}
                    </p>
                    {/*
                      Signpost rows at the Connection group's head tell where moved panes went
                      (`surfaces.md`): no indigo, one navigation glyph, and a press closes the sheet
                      and goes rather than drawing that pane here.
                    */}
                    {/*
                      Points at `/mcp`, the folder's connection; the runner list is one named hop
                      further through its connector dialog, and `AcpRuntimeSettings` links back.
                    */}
                    {group.key === 'connect' ? (
                      <button
                        type="button"
                        data-testid="app-settings-nav-mcp"
                        onClick={() => {
                          setOpen(false);
                          router.push(buildRouteFocusHref(DESTINATION_HREF.mcp));
                        }}
                        className={controlClass({
                          shape: 'row',
                          size: 'md',
                          tone: 'muted',
                          className: `w-auto shrink-0 whitespace-nowrap gap-2.5 rounded-card px-3 py-2 text-body sm:w-full ${SETTINGS_NAV_ROW_HOVER}`,
                        })}
                      >
                        {/* The destination's own rail icon, so the row and the tile agree. */}
                        <Plug size={16} aria-hidden className="shrink-0" />
                        <span className="min-w-0 flex-1 text-left">{t('goToMcp')}</span>
                        <ChevronRight
                          size={16}
                          aria-hidden
                          className="shrink-0 text-[color:var(--color-text-quaternary)]"
                        />
                      </button>
                    ) : null}
                    {/* A pointer row to Agents → Models, where the keys live, like the MCP row above. */}
                    {group.key === 'connect' ? (
                      <button
                        type="button"
                        data-testid="app-settings-nav-models"
                        title={t('goToModelsHint')}
                        aria-label={t('goToModelsHint')}
                        onClick={() => {
                          setOpen(false);
                          router.push(buildRouteFocusHref(AGENTS_MODELS_HREF));
                        }}
                        className={controlClass({
                          shape: 'row',
                          size: 'md',
                          tone: 'muted',
                          className: `w-auto shrink-0 whitespace-nowrap gap-2.5 rounded-card px-3 py-2 text-body sm:w-full ${SETTINGS_NAV_ROW_HOVER}`,
                        })}
                      >
                        <KeyRound size={16} aria-hidden className="shrink-0" />
                        <span className="min-w-0 flex-1 text-left">{t('goToModels')}</span>
                        <ChevronRight
                          size={16}
                          aria-hidden
                          className="shrink-0 text-[color:var(--color-text-quaternary)]"
                        />
                      </button>
                    ) : null}
                    {group.items.map((item) => {
                      const active = item === shownSection;
                      const Icon = SECTION_ICON[item];
                      return (
                        <button
                          key={item}
                          type="button"
                          data-testid={`app-settings-nav-${item}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => {
                            if (item === shownSection) return;
                            setAnimateSection(true);
                            setSection(item);
                          }}
                          className={controlClass({
                            shape: 'row',
                            size: 'md',
                            tone: active ? 'accentOnTint' : 'muted',
                            className: `w-auto shrink-0 whitespace-nowrap gap-2.5 rounded-card px-3 py-2 text-body sm:w-full ${
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
                key={shownSection}
                // The 20px margin is the value from the macOS settings window layout guide.
                // A new section starts at its first control. Only section selection fades;
                // opening the dialog already has its own panel animation.
                className={cn('grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto p-3 sm:p-5', animateSection && 'settings-section-in')}
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget) setAnimateSection(false);
                }}
                data-testid={`app-settings-pane-${shownSection}`}
              >
                <SettingsPaneHead
                  testId="app-settings-pane-head"
                  title={t(`section.${shownSection}`)}
                  description={t(`sectionPurpose.${shownSection}`)}
                />
                {shownSection === 'screen' ? (
                  <>
                  <SettingsGroup>
                <SettingsRow
                  label={t('languageTitle')}
                  control={
                    <LocaleSwitch
                      onSwitchStart={(nextLocale) =>
                        rememberSettingsLocaleFocus(nextLocale, triggerVariant, shownSection)
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
                {/* The accent is the app's colour, not only the map's, so it stays here too. */}
                <AccentPicker />
                {/* Guides show once per destination, so replay lives here, and the sheet closes before
                    the guide opens. Off only stops automatic display; replay and the compass still open it. */}
                <SettingsRow
                  testId="app-settings-guide-auto-start"
                  label={t('replayGuideLabel')}
                  caption={t('guideAutoStartCaption')}
                  control={
                    <>
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
                      {replayGuide ? (
                        <Chip
                          size="lg"
                          tone="secondary"
                          data-testid="app-settings-replay-guide-button"
                          onClick={() => {
                            closePanel(false);
                            replayGuide();
                          }}
                          className={DETAIL_TOGGLE_CHIP}
                        >
                          {t('replayGuideAction')}
                        </Chip>
                      ) : null}
                    </>
                  }
                />
                  </SettingsGroup>
                  </>
                ) : shownSection === 'notify' ? (
                  /*
                   * Notifications get their own pane: they are what the app tells me, not how the map
                   * is drawn, and they sit under the visible-things group because they appear on screen.
                   */
                  <AgentActivitySettings />
                ) : shownSection === 'background' ? (
                  <>
                  {/* The 3D layout lives in the map's `View3dMenu`, over what it changes, not here. */}
                  <CanvasBackgroundPicker />
                  {/* Frame meter: off by default, and while off its measurement loop does not run. */}
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
                ) : shownSection === 'expand' ? (
                  <ExpandSettings />
                ) : shownSection === 'footprint' ? (
                  <FootprintSettings />
                ) : shownSection === 'workspace' ? (
                    <>
                  <SettingsGroup>
                <VaultShapeSettings />
                <WikiWriteModeSettings />
                {showVaultManagement ? (
                  <SettingsRow
                    testId="app-settings-workspace-folder"
                    label={t('workspaceFolderLabel')}
                    caption={
                      localVault.status === 'error'
                        ? /*
                           * The caption comes from the error code, never the raw browser message, and
                           * matches how `FirstRunPage` branches on the same code.
                           */
                          localVault.errorCode === 'grant-needed'
                          ? t('workspaceFolderErrorGrantNeeded')
                          : localVault.errorCode === 'path-missing'
                          ? t('workspaceFolderErrorPathMissing')
                          : localVault.errorCode === 'permission-denied'
                            ? t('workspaceFolderErrorPermissionDenied')
                            : localVault.errorCode === 'root-rejected'
                              ? t('workspaceFolderErrorRootRejected')
                              : t('workspaceFolderErrorFallback')
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
                {/* The vault's absolute path with copy and reveal in Finder, only where the desktop knows it. */}
                {vaultRootPath ? (
                  <SettingsRow
                    testId="app-settings-vault-path"
                    /* The row names the value and the buttons name the act; the accent stays on the pane's primary act. */
                    label={t('workspacePathLabel')}
                    caption={vaultRootPath}
                    control={
                      <>
                        <Chip
                          size="lg"
                          tone="secondary"
                          data-testid="app-settings-copy-vault-path"
                          onClick={() => void copy(vaultRootPath)}
                          aria-label={tPicker('copyPathAriaLabel', { path: vaultRootPath })}
                          className={DETAIL_TOGGLE_CHIP}
                        >
                          {copyState === 'copied'
                            ? tPicker('copyPathCopied')
                            : copyState === 'failed'
                              ? tPicker('copyPathFailed')
                              : t('workspacePathCopy')}
                        </Chip>
                        <Chip
                          size="lg"
                          tone="secondary"
                          data-testid="app-settings-reveal-vault-path"
                          onClick={() => void openTauriVaultInFinder(vaultRootPath)}
                          aria-label={tPicker('revealPathAriaLabel', { path: vaultRootPath })}
                          className={DETAIL_TOGGLE_CHIP}
                        >
                          {t('workspacePathReveal')}
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
                        {/* A pressable list row is `row`, which already carries the disabled affordance. */}
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
                {/* The same row grammar as its neighbours: label and caption left, one `lg` secondary chip right. */}
                <SettingsRow
                  testId="app-settings-vault-docs"
                  label={t('vaultTitle')}
                  caption={vaultBody}
                  control={
                    <Link
                      href={vaultNavigationHref}
                      onClick={handleVaultNavigate}
                      data-testid="app-settings-vault-docs-open"
                      className={controlClass({ shape: 'chip', size: 'lg', tone: 'secondary', className: DETAIL_TOGGLE_CHIP })}
                    >
                      {vaultCta}
                    </Link>
                  }
                />
                    {/*
                      Importing nodes is about what comes into this folder, so it is this group's
                      last row; the module owns the pick, the preview and its states.
                    */}
                    <BlockImportModule
                      renderTrigger={(trigger) => (
                        <SettingsRow
                          testId="app-settings-block-import"
                          label={trigger.label}
                          caption={trigger.status ?? trigger.caption}
                          captionTone={trigger.statusKind === 'error' ? 'danger' : 'neutral'}
                          control={
                            <Chip
                              size="lg"
                              tone="secondary"
                              data-testid="block-import-open"
                              onClick={trigger.onPick}
                              disabled={trigger.disabled}
                              title={trigger.title}
                              className={DETAIL_TOGGLE_CHIP}
                            >
                              {trigger.action}
                            </Chip>
                          }
                        />
                      )}
                    />
                  </SettingsGroup>
                    </>

                ) : (
                  <AppUpdateSettings />
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

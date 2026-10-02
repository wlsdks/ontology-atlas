'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { OPEN_SETTINGS_EVENT, useSurfaceRequest } from '@/shared/lib/surface-requests';
import { useDialogFocusTrap } from '@/shared/lib/use-dialog-focus-trap';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { CloseButton } from '@/shared/ui/close-button';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { buildRouteFocusHref } from '@/shared/ui/route-focus-manager';
import { transientSurface } from '@/shared/ui/transient-surface';
import { AGENT_GRAPH_WORKFLOW_HREF } from '@/shared/config';

import { SETTINGS_CATALOG } from '../model/catalog';
import type { SettingsSectionId } from '../model/catalog/types';
import { resolveSettingsSection } from '../model/settings-sections';
import {
  groupSettingsResults,
  searchSettings,
  type SettingsSearchItem,
} from '../model/settings-search';
import { AgentActivitySettings } from './AgentActivitySettings';
import { ExpandSettings } from './ExpandSettings';
import { FootprintSettings } from './FootprintSettings';
import { AboutPane } from './panes/AboutPane';
import { AgentsPane } from './panes/AgentsPane';
import { MapPane } from './panes/MapPane';
import { PrivacyPane } from './panes/PrivacyPane';
import { ScreenPane } from './panes/ScreenPane';
import { WorkspacePane } from './panes/WorkspacePane';
import { SettingsNav, useSettingsSearchItems } from './SettingsNav';
import {
  orderedSettingsResults,
  SettingsSearchField,
  SettingsSearchResults,
  useSettingsSearchCursor,
} from './SettingsSearch';
import { SettingsPaneHead } from './settings-primitives';

export { AGENT_GRAPH_WORKFLOW_HREF };

type SettingsTriggerVariant = 'header-pill' | 'rail-tile' | 'chrome-tile';

const SETTINGS_LOCALE_FOCUS_KEY = 'ontology-atlas:settings-locale-focus';
const SETTINGS_LOCALE_FOCUS_MAX_AGE_MS = 10_000;

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

interface SettingsLocaleFocusIntent {
  locale: string;
  triggerVariant: SettingsTriggerVariant;
  section?: string;
  createdAt: number;
}

function rememberSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
  section: SettingsSectionId,
) {
  try {
    const intent: SettingsLocaleFocusIntent = { locale, triggerVariant, section, createdAt: Date.now() };
    window.sessionStorage.setItem(SETTINGS_LOCALE_FOCUS_KEY, JSON.stringify(intent));
  } catch {
    return;
  }
}

/**
 * Reads the intent left by a language switch: the pane to reopen on, or `null`. `canConsume` is
 * asked first because several instances are mounted and only the visible one may take it.
 */
function consumeSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
  canConsume: () => boolean,
): SettingsSectionId | null {
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
    return resolveSettingsSection(intent.section) ?? 'screen';
  } catch {
    try {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    } catch {
      return null;
    }
    return null;
  }
}

interface AppSettingsScreenControls {
  indexCollapsed: boolean;
  onIndexCollapsedChange: (next: boolean) => void;
}

export interface AppSettingsMenuProps {
  mode: 'static' | 'local';
  /** Controlled open state. Unset means self-managed. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** The map's INDEX default; the Map pane draws that row only where the map injects it. */
  screenControls?: AppSettingsScreenControls;
  triggerVariant?: SettingsTriggerVariant;
}

/**
 * The single settings surface: a modal sheet whose left list groups panes by where their values
 * live, with search at its head. ⌘K yields to the palette, and Escape stops propagation so it
 * does not reach the map's Esc dismissal order.
 */
export function AppSettingsMenu({
  mode,
  open: openProp,
  onOpenChange,
  screenControls,
  triggerVariant = 'header-pill',
}: AppSettingsMenuProps) {
  const t = useTranslations('nav.settingsMenu');
  const locale = useLocale();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [animateSection, setAnimateSection] = useState(false);
  const [query, setQuery] = useState('');
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) {
        setAnimateSection(false);
        setQuery('');
      }
      if (isControlled) onOpenChange?.(next);
      else setInternalOpen(next);
    },
    [isControlled, onOpenChange],
  );
  const [section, setSection] = useState<SettingsSectionId>('screen');
  const pendingSettingRef = useRef<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrimPressRef = useRef(false);
  const navRef = useRef<HTMLElement | null>(null);
  const panelRef = useDialogFocusTrap<HTMLDivElement>({
    open,
    initialFocus: 'container',
    // closePanel owns the return target so ⌘K can yield focus to the palette.
    restoreFocus: false,
  });
  const titleId = useId();
  const listId = useId();
  const desktop = isDesktopShell();

  const searchItems = useSettingsSearchItems(desktop);
  const searching = query.trim() !== '';
  const groups = searching ? groupSettingsResults(searchSettings(searchItems, query)) : [];
  const ordered = orderedSettingsResults(groups);
  const cursor = useSettingsSearchCursor(ordered);

  const settingsPresence = usePanelPresence(open);

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = open;
    if (open) {
      navRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [open]);

  const triggerVisible = () => triggerRef.current !== null && triggerRef.current.offsetParent !== null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const reopen = consumeSettingsLocaleFocus(locale, triggerVariant, triggerVisible);
      if (!reopen) return;
      setSection(reopen);
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locale, triggerVariant, setOpen]);

  useSurfaceRequest(OPEN_SETTINGS_EVENT, () => {
    if (!triggerVisible()) return false;
    if (open) searchRef.current?.focus();
    else setOpen(true);
    return true;
  });

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // The overlay is portalled to body, so a press inside it is not inside `details`.
      if (detailsRef.current?.contains(target) || overlayRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, setOpen]);

  useEffect(() => {
    const id = pendingSettingRef.current;
    if (!id || searching) return;
    pendingSettingRef.current = null;
    const pane = paneRef.current;
    const row = pane?.querySelector<HTMLElement>(`[data-setting-id="${id}"]`);
    if (!pane || !row) {
      pane?.scrollTo?.({ top: 0 });
      return;
    }
    row.scrollIntoView?.({ block: 'nearest' });
    const target = row.matches(FOCUSABLE) ? row : row.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, [section, searching]);

  const closePanel = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const leave = () => closePanel(false);

  const showSection = (next: SettingsSectionId) => {
    setQuery('');
    if (next === section) return;
    setAnimateSection(true);
    setSection(next);
  };

  const openResult = (item: SettingsSearchItem) => {
    const href = SETTINGS_CATALOG.find((entry) => entry.id === item.id)?.href;
    if (href) {
      leave();
      router.push(buildRouteFocusHref(href));
      return;
    }
    pendingSettingRef.current = item.id;
    showSection(item.section);
  };

  return (
    <details
      ref={detailsRef}
      open={open}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        const command = event.metaKey || event.ctrlKey;
        if (command && event.key.toLowerCase() === 'k') {
          closePanel(false);
          return;
        }
        if (command && event.key === ',' && open) {
          event.preventDefault();
          searchRef.current?.focus();
          return;
        }
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
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
            ? 'flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)]'
            : triggerVariant === 'chrome-tile'
              ? 'flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
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
      {/* `open ||` first, so the portal mounts in the opening commit and the trap finds the panel. */}
      {(open || settingsPresence.mounted) && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={overlayRef}
              className={`${settingsPresence.exiting ? 'app-settings-scrim-out' : 'app-settings-scrim-in'} fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[color:var(--color-backdrop-medium)] p-3 sm:p-6`}
              aria-hidden={settingsPresence.exiting || undefined}
              inert={settingsPresence.exiting || undefined}
              {...transientSurface('sheet')}
              data-testid="app-settings-overlay"
              onMouseDown={(event) => {
                scrimPressRef.current = event.target === event.currentTarget;
                // WebKit would hand focus to `<body>`, outside the trap and Escape.
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
                className={`${settingsPresence.exiting ? 'app-settings-panel-out' : 'app-settings-panel-in'} flex h-[var(--dialog-h-lg)] max-h-[calc(100dvh-1.5rem)] w-[var(--dialog-w-lg)] focus:outline-none max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-body shadow-[var(--shadow-elevation-3)]`}
                data-testid="app-settings-popover"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Settings size={ICON_SIZE.md} aria-hidden className="shrink-0 text-[color:var(--color-indigo-accent)]" />
                    <h2
                      id={titleId}
                      className="truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                    >
                      {t('title')}
                    </h2>
                  </div>
                  <CloseButton label={t('closeLabel')} onClick={() => closePanel()} />
                </div>

                <div className="flex min-h-0 flex-1 flex-col sm:flex-row" data-testid="app-settings-body">
                  <SettingsNav
                    navRef={navRef}
                    shownSection={searching ? null : section}
                    onSelect={showSection}
                    searchField={
                      <SettingsSearchField
                        value={query}
                        onValueChange={setQuery}
                        listId={listId}
                        activeId={cursor.active?.id ?? null}
                        expanded={searching}
                        onMove={cursor.move}
                        onOpen={() => {
                          if (cursor.active) openResult(cursor.active);
                        }}
                        inputRef={searchRef}
                      />
                    }
                  />

                  <div
                    ref={paneRef}
                    key={searching ? 'search' : section}
                    className={cn(
                      'grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto p-3 sm:p-5',
                      animateSection && 'settings-section-in',
                    )}
                    onAnimationEnd={(event) => {
                      if (event.target === event.currentTarget) setAnimateSection(false);
                    }}
                    data-testid={searching ? 'app-settings-pane-search' : `app-settings-pane-${section}`}
                  >
                    {searching ? (
                      <SettingsSearchResults
                        query={query}
                        groups={groups}
                        listId={listId}
                        activeId={cursor.active?.id ?? null}
                        onOpen={openResult}
                        onPoint={cursor.point}
                      />
                    ) : (
                      <>
                        <SettingsPaneHead
                          testId="app-settings-pane-head"
                          title={t(`section.${section}`)}
                          description={t(`sectionPurpose.${section}`)}
                        />
                        {section === 'screen' ? (
                          <ScreenPane
                            onClose={closePanel}
                            onLocaleSwitchStart={(next) => rememberSettingsLocaleFocus(next, triggerVariant, section)}
                          />
                        ) : section === 'map' ? (
                          <MapPane screenControls={screenControls} />
                        ) : section === 'expand' ? (
                          <ExpandSettings />
                        ) : section === 'footprint' ? (
                          <FootprintSettings />
                        ) : section === 'notify' ? (
                          <AgentActivitySettings />
                        ) : section === 'agents' ? (
                          <AgentsPane onClose={leave} />
                        ) : section === 'privacy' ? (
                          <PrivacyPane onShowSection={showSection} onClose={leave} />
                        ) : section === 'workspace' ? (
                          <WorkspacePane mode={mode} onClose={leave} />
                        ) : (
                          <AboutPane onLeave={leave} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </details>
  );
}

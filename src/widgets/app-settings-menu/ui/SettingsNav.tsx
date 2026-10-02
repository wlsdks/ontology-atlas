'use client';

import { useMemo, type ReactNode, type Ref } from 'react';
import {
  Bell,
  Bot,
  Expand,
  HardDrive,
  Info,
  Map as MapIcon,
  Monitor,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';

import { settingsCatalogFor } from '../model/catalog';
import { SETTINGS_SECTION_SCOPE, type SettingsSectionId } from '../model/catalog/types';
import { SETTINGS_NAV_GROUPS } from '../model/settings-sections';
import type { SettingsSearchItem } from '../model/settings-search';

const SECTION_ICON: Record<SettingsSectionId, LucideIcon> = {
  screen: Monitor,
  map: MapIcon,
  expand: Expand,
  footprint: Sparkles,
  notify: Bell,
  agents: Bot,
  privacy: ShieldCheck,
  workspace: HardDrive,
  about: Info,
};

const NAV_ROW_HOVER =
  'hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]';

const DESTINATION_SEGMENTS = ['agents', 'automations', 'git', 'projects'] as const;

export function useSettingsSearchItems(desktop: boolean): SettingsSearchItem[] {
  const t = useTranslations();
  const tNav = useTranslations('nav.settingsMenu');
  const tRail = useTranslations('navRail');
  return useMemo(
    () =>
      settingsCatalogFor(desktop).map((entry) => {
        const label = t(entry.labelKey);
        const segment = entry.href?.split(/[/?]/).find(Boolean);
        const place = DESTINATION_SEGMENTS.find((id) => id === segment);
        return {
          id: entry.id,
          section: entry.section,
          label,
          keywords: entry.keywordsKey ? t(entry.keywordsKey) : '',
          sectionLabel: tNav(`section.${entry.section}`),
          scopeLabel: tNav(`scope.${SETTINGS_SECTION_SCOPE[entry.section]}`),
          opensLabel: entry.href ? (place ? tRail(place) : label) : undefined,
        };
      }),
    [desktop, t, tNav, tRail],
  );
}

export function SettingsNav({
  shownSection,
  onSelect,
  searchField,
  navRef,
}: {
  shownSection: SettingsSectionId | null;
  onSelect: (section: SettingsSectionId) => void;
  searchField: ReactNode;
  navRef: Ref<HTMLElement>;
}) {
  const t = useTranslations('nav.settingsMenu');
  return (
    <nav
      ref={navRef}
      aria-label={t('title')}
      data-testid="app-settings-nav"
      className="flex w-full shrink-0 flex-col gap-2 overflow-x-auto border-b border-[color:var(--color-border-soft)] p-2 sm:w-[11.25rem] sm:overflow-x-hidden sm:overflow-y-auto sm:border-b-0 sm:border-r"
    >
      {searchField}
      <div className="flex gap-1 sm:block">
        {SETTINGS_NAV_GROUPS.map((group) => (
          <div
            key={group.scope}
            role="group"
            aria-label={t(`scope.${group.scope}`)}
            data-testid={`app-settings-nav-group-${group.scope}`}
            className="flex w-max shrink-0 gap-1 sm:mt-1.5 sm:block sm:w-auto sm:border-t sm:border-[color:var(--color-divider)] sm:pt-1.5 sm:first:mt-0 sm:first:border-t-0 sm:first:pt-0"
          >
            <p className="hidden px-3 pb-1 font-mono text-label font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-secondary)] sm:block">
              {t(`scope.${group.scope}`)}
            </p>
            {group.sections.map((item) => {
              const active = item === shownSection;
              const Icon = SECTION_ICON[item];
              return (
                <button
                  key={item}
                  type="button"
                  data-testid={`app-settings-nav-${item}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(item)}
                  className={controlClass({
                    shape: 'row',
                    size: 'md',
                    tone: active ? 'accentOnTint' : 'muted',
                    className: `w-auto shrink-0 gap-2 whitespace-nowrap rounded-card px-3 py-2 text-body sm:w-full sm:whitespace-normal ${
                      active ? 'bg-[color:var(--color-indigo-line-a13)]' : NAV_ROW_HOVER
                    }`,
                  })}
                >
                  <Icon size={16} aria-hidden className="shrink-0" />
                  <span className="min-w-0 text-left">{t(`section.${item}`)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

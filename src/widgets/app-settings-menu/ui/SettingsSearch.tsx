'use client';

import { useCallback, useState, type KeyboardEvent, type Ref } from 'react';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';
import { Input } from '@/shared/ui/input';

import type { SettingsSearchGroup, SettingsSearchItem } from '../model/settings-search';
import { SETTINGS_SECTION_LABEL } from './settings-primitives';

export function orderedSettingsResults(groups: readonly SettingsSearchGroup[]): SettingsSearchItem[] {
  return groups.flatMap((group) => group.items);
}

export function useSettingsSearchCursor(ordered: readonly SettingsSearchItem[]) {
  const [cursor, setCursor] = useState<{ key: string; index: number }>({ key: '', index: 0 });
  const key = ordered.map((item) => item.id).join('|');
  const index = cursor.key === key ? Math.min(cursor.index, Math.max(ordered.length - 1, 0)) : 0;
  const move = useCallback(
    (delta: 1 | -1) => {
      if (ordered.length === 0) return;
      setCursor({ key, index: (index + delta + ordered.length) % ordered.length });
    },
    [index, key, ordered.length],
  );
  const point = useCallback((id: string) => {
    const at = ordered.findIndex((item) => item.id === id);
    if (at >= 0) setCursor({ key, index: at });
  }, [key, ordered]);
  return { active: ordered[index] ?? null, move, point };
}

function settingsResultOptionId(listId: string, id: string): string {
  return `${listId}-${id}`;
}

export function SettingsSearchField({
  value,
  onValueChange,
  listId,
  activeId,
  expanded,
  onMove,
  onOpen,
  inputRef,
}: {
  value: string;
  onValueChange: (next: string) => void;
  listId: string;
  activeId: string | null;
  expanded: boolean;
  onMove: (delta: 1 | -1) => void;
  onOpen: () => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const t = useTranslations('settingsSearch');
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing || !activeId) return;
      event.preventDefault();
      onOpen();
      return;
    }
    if (event.key === 'Escape' && value !== '') {
      event.preventDefault();
      event.stopPropagation();
      onValueChange('');
    }
  };
  return (
    <Input
      ref={inputRef}
      type="search"
      size="sm"
      aria-label={t('label')}
      placeholder={t('placeholder')}
      role="combobox"
      aria-expanded={expanded}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={activeId ? settingsResultOptionId(listId, activeId) : undefined}
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={onKeyDown}
      data-testid="app-settings-search"
    />
  );
}

export function SettingsSearchResults({
  query,
  groups,
  listId,
  activeId,
  onOpen,
  onPoint,
}: {
  query: string;
  groups: readonly SettingsSearchGroup[];
  listId: string;
  activeId: string | null;
  onOpen: (item: SettingsSearchItem) => void;
  onPoint: (id: string) => void;
}) {
  const t = useTranslations('settingsSearch');
  if (groups.length === 0) {
    return (
      <p
        id={listId}
        role="status"
        data-testid="app-settings-search-empty"
        className="px-3 text-body leading-body text-[color:var(--color-text-tertiary)]"
      >
        {t('empty', { query: query.trim() })}
      </p>
    );
  }
  return (
    <div
      id={listId}
      role="listbox"
      aria-label={t('results')}
      className="grid min-w-0 gap-4"
      data-testid="app-settings-search-results"
    >
      {groups.map((group) => (
        <div key={group.section} role="group" aria-label={group.sectionLabel} className="min-w-0">
          <p className={`flex min-h-8 items-center ${SETTINGS_SECTION_LABEL}`} aria-hidden>
            {group.sectionLabel}
          </p>
          <div className="mt-1.5 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
            {group.items.map((item) => (
              <div
                key={item.id}
                id={settingsResultOptionId(listId, item.id)}
                role="option"
                aria-selected={item.id === activeId}
                data-setting-result={item.id}
                onMouseMove={() => onPoint(item.id)}
                onClick={() => onOpen(item)}
                className={controlClass({
                  shape: 'row',
                  size: 'md',
                  tone: 'muted',
                  active: item.id === activeId,
                  hoverInk: 'strong',
                  hoverSurface: 'lift',
                  className: 'min-h-12 cursor-pointer gap-3 px-3 py-2',
                })}
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-body text-[color:var(--color-text-primary)]">{item.label}</span>
                  <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {t('where', { section: item.sectionLabel, scope: item.scopeLabel })}
                  </span>
                </span>
                {item.opensLabel ? (
                  <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
                    {t('opens', { place: item.opensLabel })}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

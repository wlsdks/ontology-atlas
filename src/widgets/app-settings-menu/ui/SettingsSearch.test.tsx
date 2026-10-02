import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import {
  groupSettingsResults,
  searchSettings,
  type SettingsSearchItem,
} from '../model/settings-search';
import {
  SettingsSearchField,
  SettingsSearchResults,
  orderedSettingsResults,
  useSettingsSearchCursor,
} from './SettingsSearch';

const items: SettingsSearchItem[] = [
  { id: 'text-size', section: 'screen', label: 'Text size', keywords: 'zoom', sectionLabel: 'Screen · language', scopeLabel: 'This computer' },
  { id: 'door-models', section: 'agents', label: 'Models · API keys', keywords: 'key', sectionLabel: 'Agents', scopeLabel: 'This computer', opensLabel: 'Agents' },
  { id: 'version', section: 'about', label: 'Running build', keywords: 'version', sectionLabel: 'About', scopeLabel: 'App' },
];

function Harness({ onOpen, onClose }: { onOpen: (item: SettingsSearchItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const groups = groupSettingsResults(searchSettings(items, query));
  const ordered = orderedSettingsResults(groups);
  const cursor = useSettingsSearchCursor(ordered);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <SettingsSearchField
        value={query}
        onValueChange={setQuery}
        listId="settings-results"
        activeId={cursor.active?.id ?? null}
        expanded={query.trim() !== ''}
        onMove={cursor.move}
        onOpen={() => {
          if (cursor.active) onOpen(cursor.active);
        }}
      />
      {query.trim() !== '' ? (
        <SettingsSearchResults
          query={query}
          groups={groups}
          listId="settings-results"
          activeId={cursor.active?.id ?? null}
          onOpen={onOpen}
          onPoint={cursor.point}
        />
      ) : null}
    </div>
  );
}

function renderHarness() {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Harness onOpen={onOpen} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onOpen, onClose, field: screen.getByTestId('app-settings-search') };
}

describe('SettingsSearch', () => {
  it('shows each result with its pane and scope, and marks a link with where it opens', () => {
    const { field } = renderHarness();
    fireEvent.change(field, { target: { value: 'e' } });
    const results = screen.getByTestId('app-settings-search-results');
    expect(results).toHaveTextContent('Screen · language · This computer');
    expect(results).toHaveTextContent('About · App');
    const door = results.querySelector('[data-setting-result="door-models"]');
    expect(door).toHaveTextContent('Opens Agents');
    expect(results.querySelector('[data-setting-result="version"]')).not.toHaveTextContent('Opens');
  });

  it('moves with the arrows, wraps, and opens the active result with Enter', () => {
    const { field, onOpen } = renderHarness();
    fireEvent.change(field, { target: { value: 'e' } });
    expect(field).toHaveAttribute('aria-activedescendant', 'settings-results-text-size');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field).toHaveAttribute('aria-activedescendant', 'settings-results-door-models');
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(field).toHaveAttribute('aria-activedescendant', 'settings-results-version');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'version' }));
  });

  it('opens a result on click', () => {
    const { field, onOpen } = renderHarness();
    fireEvent.change(field, { target: { value: 'api' } });
    fireEvent.click(screen.getByText('Models · API keys'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'door-models' }));
  });

  it('clears the query on the first Escape and lets the second close the sheet', () => {
    const { field, onClose } = renderHarness();
    fireEvent.change(field, { target: { value: 'size' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue('');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says plainly when nothing matches', () => {
    const { field, onOpen } = renderHarness();
    fireEvent.change(field, { target: { value: 'zzz' } });
    expect(screen.getByTestId('app-settings-search-empty')).toHaveTextContent('No setting matches “zzz”.');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });
});

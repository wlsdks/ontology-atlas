import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREEN_CATALOG } from '../../model/catalog/screen';
import { ScreenPane } from './ScreenPane';

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => 'en',
}));
vi.mock('@/shared/lib/render-timing/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => mocks.reducedMotion,
}));
vi.mock('@/shared/lib/preferences/guide-auto-start', () => ({
  useGuideAutoStart: () => true,
  writeGuideAutoStart: vi.fn(),
}));
vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: ({ onSwitchStart }: { onSwitchStart?: (locale: string) => void }) => (
    <button type="button" data-testid="locale-switch" onClick={() => onSwitchStart?.('ko')}>
      locale
    </button>
  ),
}));
vi.mock('../pane-settings/appearance-pickers', () => ({
  GlyphSetPicker: ({ settingId }: { settingId?: string }) => (
    <div data-testid="app-settings-glyph-set" data-setting-id={settingId} />
  ),
}));

function renderPane() {
  const onClose = vi.fn();
  const onLocaleSwitchStart = vi.fn();
  const view = render(<ScreenPane onClose={onClose} onLocaleSwitchStart={onLocaleSwitchStart} />);
  return { ...view, onClose, onLocaleSwitchStart };
}

beforeEach(() => {
  mocks.reducedMotion = false;
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-text-size');
});

afterEach(() => {
  document.documentElement.removeAttribute('data-text-size');
});

describe('ScreenPane', () => {
  it('draws the catalog rows in D5 order', () => {
    const { container } = renderPane();
    const ids = [...container.querySelectorAll('[data-setting-id]')].map((element) =>
      element.getAttribute('data-setting-id'),
    );
    expect(ids).toEqual(SCREEN_CATALOG.map((entry) => entry.id));
    expect(SCREEN_CATALOG.every((entry) => entry.section === 'screen')).toBe(true);
  });

  it('reports a locale switch to the sheet', () => {
    const { onLocaleSwitchStart } = renderPane();
    fireEvent.click(screen.getByTestId('locale-switch'));
    expect(onLocaleSwitchStart).toHaveBeenCalledWith('ko');
  });

  it('writes view mode to the shared store on every screen', () => {
    renderPane();
    const plain = screen.getByRole('radio', { name: 'settingsScreen.viewModePlain' });
    fireEvent.click(plain);
    expect(window.localStorage.getItem('demo:audience-plain:v1')).toBe('1');
  });

  it('sets the text size on the root and removes it for default', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('app-settings-text-size-larger'));
    expect(document.documentElement.getAttribute('data-text-size')).toBe('larger');
    fireEvent.click(screen.getByTestId('app-settings-text-size-default'));
    expect(document.documentElement.hasAttribute('data-text-size')).toBe(false);
  });

  it('names the motion source the app reads', () => {
    mocks.reducedMotion = true;
    renderPane();
    const row = screen.getByTestId('app-settings-motion');
    expect(row.textContent).toContain('settingsScreen.motionReduced');
    expect(row.textContent).toContain('settingsScreen.motionCaptionApp');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_CATALOG } from '../../model/catalog/map';
import { MapPane } from './MapPane';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock('../AppearancePickers', () => ({
  CanvasBackgroundPicker: ({ settingId }: { settingId?: string }) => (
    <div data-testid="app-settings-canvas-background" data-setting-id={settingId} />
  ),
}));

beforeEach(() => window.localStorage.clear());

describe('MapPane', () => {
  it('anchors every map catalog entry when INDEX controls are injected', () => {
    const { container } = render(
      <MapPane screenControls={{ indexCollapsed: false, onIndexCollapsedChange: vi.fn() }} />,
    );
    const anchored = [...container.querySelectorAll('[data-setting-id]')].map((el) => el.getAttribute('data-setting-id'));
    expect(anchored).toEqual(MAP_CATALOG.map((entry) => entry.id));
  });

  it('leaves INDEX default out when no screen controls are given', () => {
    const { container } = render(<MapPane />);
    expect(container.querySelector('[data-setting-id="index-default"]')).toBeNull();
    expect(screen.getByTestId('app-settings-map-drag-speed-1')).toBeInTheDocument();
  });

  it('reads the frame meter On before Off and turns it on', () => {
    render(<MapPane />);
    const options = screen.getByTestId('app-settings-frame-meter-switch').querySelectorAll('[role="radio"]');
    expect([...options].map((option) => option.textContent)).toEqual([
      'nav.settingsMenu.frameMeterOn',
      'nav.settingsMenu.frameMeterOff',
    ]);
    fireEvent.click(options[0]!);
    expect(options[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('passes the INDEX choice back to the screen that owns it', () => {
    const onIndexCollapsedChange = vi.fn();
    render(<MapPane screenControls={{ indexCollapsed: false, onIndexCollapsedChange }} />);
    const collapsed = [...screen.getByTestId('app-settings-index-default').querySelectorAll('[role="radio"]')].find(
      (option) => option.textContent === 'nav.settingsMenu.indexDefaultCollapsed',
    );
    fireEvent.click(collapsed!);
    expect(onIndexCollapsedChange).toHaveBeenCalledWith(true);
  });
});

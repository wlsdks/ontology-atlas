import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { WikiWriteModeSettings } from './WikiWriteModeSettings';

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <WikiWriteModeSettings />
    </NextIntlClientProvider>,
  );
}

describe('how an agent\'s wiki page lands is a setting', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts at "write at once" and remembers "ask each time" under the key the Library reads', () => {
    mount();
    expect(screen.getByTestId('app-settings-wiki-write-mode-auto').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('app-settings-wiki-write-mode-ask'));
    expect(window.localStorage.getItem('library.wikiWriteMode')).toBe('ask');
    expect(screen.getByTestId('app-settings-wiki-write-mode').textContent).toContain('Every page stops');
    expect(screen.getByTestId('app-settings-wiki-write-mode')).toHaveAttribute('data-setting-id', 'wiki-write-mode');
  });
});

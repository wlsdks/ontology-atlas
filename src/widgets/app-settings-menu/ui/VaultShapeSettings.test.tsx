import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { VaultShapeSettings } from './VaultShapeSettings';

const state = vi.hoisted(() => ({
  status: 'loaded' as string,
  docs: [] as Array<{ slug: string; frontmatter: Record<string, unknown> }>,
  scaffold: vi.fn(async () => ({ created: 1, skipped: 0 })),
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({ status: state.status, manifest: { docs: state.docs }, scaffoldOntology: state.scaffold }),
}));
vi.mock('@/shared/ui/toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

function mount() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <VaultShapeSettings />
    </NextIntlClientProvider>,
  );
}

describe('VaultShapeSettings', () => {
  it('offers the missing part and marks the present one, for a wiki without a map', () => {
    state.docs = [{ slug: 'wiki/_template', frontmatter: {} }];
    mount();
    expect(screen.getByTestId('app-settings-shape-start-map')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-shape-wiki').getAttribute('data-present')).toBe('true');
    expect(screen.queryByTestId('app-settings-shape-start-wiki')).not.toBeInTheDocument();
  });

  it('writes only the chosen part, in the screen language', async () => {
    state.docs = [{ slug: 'project', frontmatter: { kind: 'project' } }];
    mount();
    screen.getByTestId('app-settings-shape-start-wiki').click();
    await vi.waitFor(() => expect(state.scaffold).toHaveBeenCalledWith('ko', { map: false, wiki: true }));
  });
});

import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import type { UpdatePhase } from '../model/update-state';
import { UpdateToast } from './UpdateToast';

function renderPhase(phase: UpdatePhase) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <UpdateToast
        phase={phase}
        onInstall={vi.fn()}
        onRestart={vi.fn()}
        onDismiss={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('UpdateToast failure scope', () => {
  it('does not duplicate a manual check failure that already lives in Settings', () => {
    renderPhase({ kind: 'failed', operation: 'check', message: 'remote 404' } as UpdatePhase);
    expect(screen.queryByTestId('app-update-toast')).not.toBeInTheDocument();
  });

  it('labels an install failure correctly and does not expose a raw library error', () => {
    renderPhase({
      kind: 'failed',
      operation: 'install',
      message: 'Could not fetch a valid release JSON from the remote',
    } as UpdatePhase);
    const toast = screen.getByTestId('app-update-toast');
    expect(toast).toHaveTextContent('업데이트를 설치하지 못했어요');
    expect(toast).toHaveTextContent(ko.appUpdate.failedBody);
    expect(toast).not.toHaveTextContent('Could not fetch a valid release JSON');
  });
});

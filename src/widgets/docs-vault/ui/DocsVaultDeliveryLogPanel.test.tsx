import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeveloperActivityDelivery } from '@/features/docs-vault-activity';
import { DocsVaultDeliveryLogPanel } from './DocsVaultDeliveryLogPanel';

function delivery(
  overrides: Partial<DeveloperActivityDelivery> = {},
): DeveloperActivityDelivery {
  return {
    id: overrides.id ?? 'delivery-1',
    deliveryId: overrides.deliveryId ?? 'github-delivery-1234567890',
    eventName: overrides.eventName ?? 'push',
    status: overrides.status ?? 'failed',
    repository: overrides.repository ?? 'stark/project-map',
    actor: overrides.actor ?? 'codex-agent',
    reason: overrides.reason ?? '문서 slug 매핑 중 오류가 발생했습니다.',
    targetSlugs: overrides.targetSlugs ?? ['ARCHITECTURE'],
    updatedAt: overrides.updatedAt ?? '2026-04-24T10:30:00.000Z',
    ...overrides,
  };
}

describe('DocsVaultDeliveryLogPanel', () => {
  it('separates stored payload reprocess from GitHub redelivery', () => {
    const onReprocess = vi.fn();
    const onRedeliver = vi.fn();

    render(
      <DocsVaultDeliveryLogPanel
        deliveries={[delivery()]}
        onReprocess={onReprocess}
        onRedeliver={onRedeliver}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('확인 필요 1');

    fireEvent.click(screen.getByText('GitHub Delivery Recovery'));

    expect(screen.getByText(/저장된 payload 재처리/)).toBeInTheDocument();
    expect(screen.getByText('ARCHITECTURE')).toBeInTheDocument();
    expect(screen.getByText('codex-agent')).toBeInTheDocument();
    expect(screen.getByText(/delivery github-/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'stark/project-map 저장된 payload 재처리',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'stark/project-map GitHub delivery 재전송 요청',
      }),
    );

    expect(onReprocess).toHaveBeenCalledWith('delivery-1');
    expect(onRedeliver).toHaveBeenCalledWith('delivery-1');
  });

  it('shows unmapped deliveries without recovery buttons when action is unavailable', () => {
    render(
      <DocsVaultDeliveryLogPanel
        deliveries={[
          delivery({
            deliveryId: null,
            repository: undefined,
            status: 'ignored',
            targetSlugs: [],
          }),
        ]}
        onReprocess={vi.fn()}
        onRedeliver={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('GitHub Delivery Recovery'));

    expect(screen.getByText('매핑된 문서 없음')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /GitHub delivery 재전송 요청/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'push 저장된 payload 재처리',
      }),
    ).toBeInTheDocument();
  });
});

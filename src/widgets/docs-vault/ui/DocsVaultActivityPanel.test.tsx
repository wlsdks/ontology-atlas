import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeveloperActivityEvent, VaultDoc } from '@/entities/docs-vault';
import { DocsVaultActivityPanel } from './DocsVaultActivityPanel';

function doc(overrides: Partial<VaultDoc> = {}): VaultDoc {
  return {
    slug: overrides.slug ?? 'projects/aslan-ingest',
    path: `${overrides.slug ?? 'projects/aslan-ingest'}.md`,
    title: overrides.title ?? 'Aslan Ingest',
    description: overrides.description,
    tags: overrides.tags ?? ['ingest'],
    frontmatter: overrides.frontmatter ?? {},
    headings: [],
    excerpt: overrides.excerpt ?? '',
    wordCount: overrides.wordCount ?? 12,
    updatedAt: overrides.updatedAt ?? '2026-04-24T00:00:00.000Z',
    mode: overrides.mode ?? 'engineer',
    linksOut: overrides.linksOut ?? [],
    ...overrides,
  };
}

function event(
  overrides: Partial<DeveloperActivityEvent> = {},
): DeveloperActivityEvent {
  return {
    id: overrides.id ?? 'evt-1',
    source: overrides.source ?? 'github',
    kind: overrides.kind ?? 'github.push',
    title: overrides.title ?? 'agent docs sync',
    createdAt: overrides.createdAt ?? '2026-04-24T10:30:00.000Z',
    summary: overrides.summary ?? '문서와 코드 변경이 함께 들어왔습니다.',
    actor: overrides.actor ?? 'codex-agent',
    docSlug: overrides.docSlug ?? 'projects/aslan-ingest',
    repository: overrides.repository ?? 'stark/project-map',
    branch: overrides.branch ?? 'main',
    unread: overrides.unread ?? true,
    ...overrides,
  };
}

describe('DocsVaultActivityPanel', () => {
  it('labels developer events with the target document and acknowledge action', () => {
    const ingestDoc = doc();
    const onNavigate = vi.fn();
    const onAcknowledge = vi.fn();

    render(
      <DocsVaultActivityPanel
        events={[event()]}
        docsBySlug={new Map([[ingestDoc.slug, ingestDoc]])}
        selectedSlug={ingestDoc.slug}
        onNavigate={onNavigate}
        onAcknowledge={onAcknowledge}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 new');
    expect(screen.getByText('새 이벤트가 닿은 문서를 먼저 확인하세요.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('이벤트 로그'));

    expect(screen.getByText('미확인')).toBeInTheDocument();
    expect(screen.getByText('codex-agent')).toBeInTheDocument();
    expect(screen.getByText('stark/project-map')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Aslan Ingest 열고 agent docs sync 확인 처리',
      }),
    );

    expect(onNavigate).toHaveBeenCalledWith('projects/aslan-ingest');
    expect(onAcknowledge).toHaveBeenCalledWith('evt-1');
  });

  it('shows when an activity event has no mapped document', () => {
    render(
      <DocsVaultActivityPanel
        events={[event({ docSlug: 'missing-doc' })]}
        docsBySlug={new Map()}
        selectedSlug={null}
        onNavigate={vi.fn()}
        onAcknowledge={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('작업 이벤트 있음'));
    fireEvent.click(screen.getByText('이벤트 로그'));

    expect(screen.getByText('연결된 문서 없음')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /열고/ })).not.toBeInTheDocument();
  });

  it('lets a user restore an acknowledged event', () => {
    const onRestore = vi.fn();

    render(
      <DocsVaultActivityPanel
        events={[event({ unread: false })]}
        docsBySlug={new Map([[doc().slug, doc()]])}
        selectedSlug={null}
        onNavigate={vi.fn()}
        onAcknowledge={vi.fn()}
        onRestore={onRestore}
      />,
    );

    fireEvent.click(screen.getByText('작업 이벤트 있음'));
    fireEvent.click(screen.getByText('이벤트 로그'));

    expect(screen.getByText('확인됨')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'agent docs sync 확인 취소' }),
    );

    expect(onRestore).toHaveBeenCalledWith('evt-1');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  RelationshipRadarSuggestion,
  VaultDoc,
} from '@/entities/docs-vault';
import { DocsVaultRelationshipRadar } from './DocsVaultRelationshipRadar';

function doc(overrides: Partial<VaultDoc> = {}): VaultDoc {
  return {
    slug: overrides.slug ?? 'docs/a',
    path: `${overrides.slug ?? 'docs/a'}.md`,
    title: overrides.title ?? 'A 문서',
    description: overrides.description,
    tags: overrides.tags ?? [],
    frontmatter: overrides.frontmatter ?? {},
    headings: [],
    excerpt: overrides.excerpt ?? '',
    wordCount: overrides.wordCount ?? 10,
    updatedAt: overrides.updatedAt ?? '2026-04-24T00:00:00.000Z',
    mode: overrides.mode ?? 'both',
    linksOut: overrides.linksOut ?? [],
    ...overrides,
  };
}

function suggestion(
  overrides: Partial<RelationshipRadarSuggestion> = {},
): RelationshipRadarSuggestion {
  return {
    doc: overrides.doc ?? doc({ slug: 'docs/b', title: 'B 문서' }),
    score: overrides.score ?? 84,
    linked: overrides.linked ?? false,
    reasons: overrides.reasons ?? ['공통 태그 1', '같은 프로젝트'],
    sharedTags: overrides.sharedTags ?? ['strategy'],
  };
}

describe('DocsVaultRelationshipRadar', () => {
  it('explains suggestions are review-only and not automatic links', () => {
    render(
      <DocsVaultRelationshipRadar
        suggestions={[suggestion()]}
        confirmedSlugs={new Set()}
        onNavigate={vi.fn()}
        onConfirm={vi.fn()}
        onReset={vi.fn()}
        onDismiss={vi.fn()}
        onClearDismissed={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('검토 1');

    fireEvent.click(screen.getByText(/자동 연결 없이 후보만 정리/));

    expect(screen.getByText(/검토 완료와 무시는 이 볼트에 저장/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'B 문서 문서 보기' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'B 문서 추천 검토 완료' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
  });

  it('shows confirmed suggestions as reviewed and hides the confirm button', () => {
    render(
      <DocsVaultRelationshipRadar
        suggestions={[suggestion()]}
        confirmedSlugs={new Set(['docs/b'])}
        onNavigate={vi.fn()}
        onConfirm={vi.fn()}
        onReset={vi.fn()}
        onDismiss={vi.fn()}
        onClearDismissed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/자동 연결 없이 후보만 정리/));

    expect(screen.getAllByRole('status')[0]).toHaveTextContent('검토 0');
    expect(screen.getByText('완료 1')).toBeInTheDocument();
    expect(screen.getByText('검토 완료')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'B 문서 추천 검토 완료' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'B 문서 추천 검토 취소' }),
    ).toBeInTheDocument();
  });

  it('keeps dismissed suggestions recoverable', () => {
    const onClearDismissed = vi.fn();

    render(
      <DocsVaultRelationshipRadar
        suggestions={[]}
        confirmedSlugs={new Set()}
        dismissedCount={2}
        onNavigate={vi.fn()}
        onConfirm={vi.fn()}
        onReset={vi.fn()}
        onDismiss={vi.fn()}
        onClearDismissed={onClearDismissed}
      />,
    );

    expect(screen.getByText('무시 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/자동 연결 없이 후보만 정리/));
    expect(screen.getByText(/표시할 후보가 없습니다/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '무시 되돌리기' }));

    expect(onClearDismissed).toHaveBeenCalledTimes(1);
  });
});

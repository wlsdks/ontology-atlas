import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocsVaultAudienceMismatchNotice } from './DocsVaultAudienceMismatchNotice';

describe('DocsVaultAudienceMismatchNotice', () => {
  it('explains that the body stays visible and switches to the document audience', () => {
    const onSwitchAudience = vi.fn();

    render(
      <DocsVaultAudienceMismatchNotice
        docMode="engineer"
        currentAudience="planner"
        onSwitchAudience={onSwitchAudience}
      />,
    );

    expect(screen.getByText('현재 관점 밖의 참고 문서')).toBeInTheDocument();
    expect(screen.getByText(/본문은 그대로 유지/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '개발자 관점으로 보기' }),
    );

    expect(onSwitchAudience).toHaveBeenCalledWith('engineer');
  });

  it('does not render for matching, shared, or all audiences', () => {
    const { rerender } = render(
      <DocsVaultAudienceMismatchNotice
        docMode="planner"
        currentAudience="planner"
        onSwitchAudience={vi.fn()}
      />,
    );

    expect(
      screen.queryByLabelText('현재 관점 밖의 문서 안내'),
    ).not.toBeInTheDocument();

    rerender(
      <DocsVaultAudienceMismatchNotice
        docMode="both"
        currentAudience="planner"
        onSwitchAudience={vi.fn()}
      />,
    );

    expect(
      screen.queryByLabelText('현재 관점 밖의 문서 안내'),
    ).not.toBeInTheDocument();

    rerender(
      <DocsVaultAudienceMismatchNotice
        docMode="engineer"
        currentAudience="all"
        onSwitchAudience={vi.fn()}
      />,
    );

    expect(
      screen.queryByLabelText('현재 관점 밖의 문서 안내'),
    ).not.toBeInTheDocument();
  });
});

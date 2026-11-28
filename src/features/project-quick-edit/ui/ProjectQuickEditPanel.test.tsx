import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/entities/project';
import koMessages from '../../../../messages/ko.json';
import { ProjectQuickEditPanel } from './ProjectQuickEditPanel';

const patchProject = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/features/project-data-source', () => ({
  useProjectMutations: () => ({ patchProject }),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: 'demo-project',
    name: '데모 프로젝트',
    category: 'service',
    status: 'active',
    description: '테스트용 프로젝트 설명입니다.',
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <IntlProvider locale="ko" messages={koMessages}>
      <ProjectQuickEditPanel project={makeProject()} />
    </IntlProvider>,
  );
}

describe('ProjectQuickEditPanel modal contract', () => {
  beforeEach(() => {
    patchProject.mockReset();
    document.body.removeAttribute('style');
  });

  it('moves focus inside, traps Tab, closes with Escape, restores focus, and keeps the draft', async () => {
    renderPanel();
    const trigger = screen.getByTestId('public-quick-edit-toggle');
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: '프로젝트 정보 수정' });
    const close = within(dialog).getByRole('button', { name: '정보 수정 닫기' });
    const name = within(dialog).getByTestId('public-quick-edit-name');
    const tags = within(dialog).getByTestId('public-quick-edit-tags');

    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    expect(dialog).toHaveAttribute('tabindex', '-1');

    tags.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(tags);

    fireEvent.change(name, { target: { value: '수정 중인 이름' } });
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe('');
    expect(patchProject).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: '프로젝트 정보 수정' });
    expect(screen.getByTestId('public-quick-edit-name')).toHaveValue('수정 중인 이름');
  });
});

import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import type { VaultDoc } from '@/entities/docs-vault';
import { DocsVaultEditor } from './DocsVaultEditor';

// next-intl provider 로 감싼 render — useTranslations 가 throw 하지 않게.
// 기존 한국어 카피 assert 는 ko 로컬 메시지로 그대로 작동.
function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const doc: VaultDoc = {
  slug: 'ARCHITECTURE',
  path: 'docs/ARCHITECTURE.md',
  title: 'Architecture',
  description: 'Architecture doc',
  tags: ['architecture'],
  frontmatter: {},
  headings: [],
  excerpt: 'Architecture overview',
  wordCount: 10,
  updatedAt: '2026-04-23',
  linksOut: [],
};

describe('DocsVaultEditor', () => {
  it('saves edited content and shows saved feedback', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <DocsVaultEditor
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(doc.slug, 'updated'));
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
  });

  it('asks before closing with unsaved changes', async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <DocsVaultEditor
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: /취소/ }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /취소/ }));
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('마크다운 편집 textarea 가 접근명(aria-label)을 가진다', async () => {
    render(
      <DocsVaultEditor
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('initial');
    expect(
      screen.getByRole('textbox', { name: '마크다운 편집기' }),
    ).toBeInTheDocument();
  });

  it('로딩 스켈레톤이 role=status 로 announce 된다 (a11y)', async () => {
    // content 가 resolve 되기 전 초기 로딩 상태 — 스켈레톤이 스크린리더에
    // "불러오는 중" 으로 announce 돼야 한다.
    let resolve!: (v: string) => void;
    render(
      <DocsVaultEditor
        doc={doc}
        getDocContent={() => new Promise<string>((r) => (resolve = r))}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', '파일 불러오는 중…');
    // 마무리: resolve 해서 dangling promise 정리.
    resolve('done');
    await screen.findByDisplayValue('done');
  });
});

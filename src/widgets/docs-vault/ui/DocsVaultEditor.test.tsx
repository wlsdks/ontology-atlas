import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import type { VaultDoc } from '@/entities/docs-vault';
import { DocsVaultEditor } from './DocsVaultEditor';

// Wrapped in the next-intl provider so useTranslations does not throw; Korean copy assertions use
// the ko messages.
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

/**
 * Draft keys include the vault scope, or same-named files in different folders overwrite each
 * other's drafts.
 */
const VAULT_SCOPE = 'test-vault';
const draftKey = `ontology-atlas:docs-vault-editor-draft:${VAULT_SCOPE}:${doc.slug}`;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('DocsVaultEditor', () => {
  it('retains the last edit when leaving before the draft debounce fires', async () => {
    const onSave = vi.fn();
    const view = render(<DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'original'} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByDisplayValue('original'), { target: { value: 'last keystroke' } });
    view.unmount();
    expect(JSON.parse(window.localStorage.getItem(draftKey)!)).toMatchObject({ content: 'last keystroke', diskContent: 'original', slug: doc.slug });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a static native character only while the actual save is pending', async () => {
    let finish!: () => void;
    const pendingSave = new Promise<void>((resolve) => { finish = resolve; });
    render(<DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'initial'} onSave={() => pendingSave} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByDisplayValue('initial'), { target: { value: 'updated' } });
    const save = screen.getByRole('button', { name: '저장' });
    expect(save.querySelector('[data-brand-detail]')).toBeNull();
    fireEvent.click(save);
    expect(save).toBeDisabled();
    const mark = save.querySelector('[data-brand-detail="micro"]');
    expect(mark).toHaveAttribute('width', '16');
    expect(mark).toHaveAttribute('height', '16');
    expect(mark).toHaveClass('atlas-inline-waiting-mark');
    expect(mark?.parentElement).toHaveClass('size-3');
    expect(save.querySelector('.animate-spin')).toBeNull();
    await act(async () => finish());
    expect(save.querySelector('[data-brand-detail]')).toBeNull();
  });

  it('saves edited content and shows saved feedback', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(doc.slug, 'updated', undefined),
    );
    await waitFor(() => expect(window.localStorage.getItem(draftKey)).toBeNull());
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
    expect(screen.getByText('디스크에 반영됨')).toBeInTheDocument();
  });

  it('makes the draft-vs-disk save state explicit while editing', async () => {
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByDisplayValue('initial');
    expect(screen.getByText('디스크와 같음')).toBeInTheDocument();
    expect(
      screen.getByLabelText('자동 백업과 최종 저장 상태'),
    ).toBeInTheDocument();
    expect(screen.getByText('자동 백업')).toBeInTheDocument();
    expect(screen.getByText('최종 저장')).toBeInTheDocument();
    expect(screen.getByText('대기 중인 초안 없음')).toBeInTheDocument();
    expect(screen.getByText('디스크 파일과 같음')).toBeInTheDocument();
    expect(screen.getByLabelText('저장·검증·되돌리기 흐름')).toBeInTheDocument();
    expect(screen.getByText('검증')).toBeInTheDocument();
    /*
     * Read from the catalogue rather than pinned as a literal (`documentation.md` forbids pinning
     * authored sentences).
     */
    expect(
      screen.getByText(koMessages.vaultWidgets.editor.validateContractClean),
    ).toBeInTheDocument();
    expect(screen.getByText('되돌리기')).toBeInTheDocument();
    expect(screen.getByText('닫기 전 확인 · git diff로 최종 복구 가능')).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: 'unsaved draft' } });

    expect(screen.getByText('변경 사항 있음')).toBeInTheDocument();
    expect(screen.getByText('저장 전까지 디스크 미반영')).toBeInTheDocument();
    expect(screen.getByText('로컬 백업 준비 중')).toBeInTheDocument();
    expect(screen.getByText('디스크 저장 아님 · 저장 버튼 또는 ⌘S 필요')).toBeInTheDocument();
    expect(await screen.findByText('임시저장됨')).toBeInTheDocument();
    expect(screen.getByText('임시 보관 중 · 최종 저장 필요')).toBeInTheDocument();
    expect(screen.getByText('초안을 임시 보관해요')).toBeInTheDocument();
    expect(screen.getByText('저장 전: 검증은 아직 디스크 기준')).toBeInTheDocument();
    expect(screen.getByText('취소하면 임시 초안이 지워져요')).toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey)).toContain('unsaved draft');

    fireEvent.change(editor, { target: { value: 'initial' } });

    expect(screen.getByText('디스크와 같음')).toBeInTheDocument();
    expect(await screen.findByText('대기 중인 초안 없음')).toBeInTheDocument();
    expect(screen.getByText('디스크 파일과 같음')).toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey)).toBeNull();
  });

  it('restores a browser draft after remount while keeping final disk save explicit', async () => {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        slug: doc.slug,
        content: 'restored browser draft',
        diskContent: 'initial',
        updatedAt: Date.now(),
      }),
    );
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByDisplayValue('restored browser draft')).toBeInTheDocument();
    expect(screen.getByText('임시저장됨')).toBeInTheDocument();
    expect(screen.getByText('임시 보관 중 · 최종 저장 필요')).toBeInTheDocument();
  });

  // Data-loss guard: a poll gives `getDocContent` a new identity, and the load effect must not
  // re-fetch over unsaved edits.
  it('does not clobber unsaved edits when getDocContent identity changes (poll)', async () => {
    const { rerender } = render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'initial'} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'my unsaved edits' } });

    // Simulate a poll: a NEW getDocContent identity returning DIFFERENT disk content.
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'EXTERNAL CHANGE'} onSave={vi.fn()} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );

    // The user's unsaved edits must survive — no silent overwrite from the re-fetch.
    await waitFor(() =>
      expect(screen.getByDisplayValue('my unsaved edits')).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue('EXTERNAL CHANGE')).not.toBeInTheDocument();
  });

  it('saves against the mtime that was read before an external poll changed the doc', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initialDoc = { ...doc, mtime: 1000 };
    const firstMount = render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
        doc={initialDoc}
        getDocContent={async () => 'initial'}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'my unsaved edits' } });
    await waitFor(() =>
      expect(window.localStorage.getItem(draftKey)).toContain(
        'my unsaved edits',
      ),
    );
    firstMount.unmount();

    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
        doc={{ ...initialDoc, mtime: 2000 }}
        getDocContent={async () => 'external agent edit'}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    await screen.findByDisplayValue('my unsaved edits');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        initialDoc.slug,
        'my unsaved edits',
        1000,
      ),
    );
  });

  it('does not clobber edits when a clean re-fetch resolves AFTER the user starts typing', async () => {
    let resolveFetch: ((v: string) => void) | undefined;
    const { rerender } = render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'initial'} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    await screen.findByDisplayValue('initial'); // mounted, clean
    // a poll starts a NEW (clean) re-fetch that hasn't resolved yet
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocsVaultEditor vaultScope={VAULT_SCOPE}
          doc={doc}
          getDocContent={() => new Promise<string>((r) => { resolveFetch = r; })}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    // user types WHILE that fetch is in flight
    fireEvent.change(screen.getByDisplayValue('initial'), { target: { value: 'typed mid-fetch' } });
    // the in-flight clean fetch now resolves with stale disk content
    resolveFetch?.('STALE DISK CONTENT');
    await waitFor(() =>
      expect(screen.getByDisplayValue('typed mid-fetch')).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue('STALE DISK CONTENT')).not.toBeInTheDocument();
  });

  it('still reflects an external change when the editor is NOT dirty (clean re-fetch)', async () => {
    const { rerender } = render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'initial'} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    await screen.findByDisplayValue('initial');
    // clean editor (no edits) — a poll bringing new content SHOULD reflect it.
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'fresh from disk'} onSave={vi.fn()} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue('fresh from disk')).toBeInTheDocument(),
    );
  });

  // Data-loss guard: a save rejected by VaultConflictError must keep the buffer dirty and show a
  // localized conflict message, so the next poll cannot overwrite the edits.
  it('keeps edits dirty (and a poll cannot clobber) when the save is rejected by a conflict', async () => {
    const conflict = Object.assign(new Error('Vault conflict — external change'), {
      name: 'VaultConflictError',
    });
    const onSave = vi.fn().mockRejectedValue(conflict);
    const { rerender } = render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'initial'} onSave={onSave} onClose={vi.fn()} />,
    );
    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'my unsaved edits' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    // Rejected save: no phantom "Saved"; the conflict message shows once the rejection settles.
    expect(
      await screen.findByText(
        '디스크에서 먼저 변경되어 저장하지 못했어요. 편집 내용은 유지돼요. 내용을 복사한 뒤 새로고침해 최신 파일에 다시 반영하세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument();

    // buffer must still be dirty → a subsequent poll re-fetch must not clobber it
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'DISK VERSION'} onSave={onSave} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue('my unsaved edits')).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue('DISK VERSION')).not.toBeInTheDocument();
  });

  // A save blocked by the identity guard is translated like a conflict.
  it('surfaces a localized message when the save is rejected by the uid identity guard', async () => {
    const guard = Object.assign(
      new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.'),
      { name: 'VaultIdentityUidError' },
    );
    const onSave = vi.fn().mockRejectedValue(guard);
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE} doc={doc} getDocContent={async () => 'initial'} onSave={onSave} onClose={vi.fn()} />,
    );
    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'uid deleted' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // The message renders after the rejected save settles, not in the same tick as the call.
    expect(
      await screen.findByText(
        '이 줄(uid)은 문서 이름이 바뀌어도 같은 문서임을 알아보게 하는 고유 번호라서 지우거나 바꿀 수 없어요. uid 줄을 원래대로 되돌리면 저장돼요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is immutable/)).not.toBeInTheDocument();
  });

  it('asks before closing with unsaved changes', async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
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

  it('gives the markdown textarea an accessible name', async () => {
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
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

  /*
   * Kept on purpose: the skeleton delay hides fast loads, and this test keeps slow loads announced.
   */
  it('announces a slow load through role=status', async () => {
    let resolve!: (v: string) => void;
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
        doc={doc}
        getDocContent={() => new Promise<string>((r) => (resolve = r))}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    // Nothing is announced before the window passes — there may be nothing to wait for.
    expect(screen.queryByRole('status')).toBeNull();
    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-label', '파일 불러오는 중…');
    // Cleanup: resolve to clear the dangling promise.
    resolve('done');
    await screen.findByDisplayValue('done');
  });

  /**
   * Another vault's draft must not leak into this editor; with byte-identical files a save could
   * write A's draft over B's file.
   */
  it('does not read another vault\'s draft because the key includes the vault', async () => {
    window.localStorage.setItem(
      `ontology-atlas:docs-vault-editor-draft:other-vault:${doc.slug}`,
      JSON.stringify({
        slug: doc.slug,
        content: '# 남의 볼트에서 쓰던 글',
        diskContent: '# 남의 볼트에서 쓰던 글',
        updatedAt: Date.now(),
      }),
    );

    render(
      <DocsVaultEditor
        vaultScope={VAULT_SCOPE}
        doc={doc}
        getDocContent={() => Promise.resolve('# 이 볼트의 원본')}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const area = await screen.findByRole('textbox');
    await waitFor(() => expect((area as HTMLTextAreaElement).value).toContain('이 볼트의 원본'));
    expect((area as HTMLTextAreaElement).value).not.toContain('남의 볼트');
  });

  /**
   * Switching vaults with the editor open: `vaultScope` builds the draft key, so hooks missing it
   * write to or clear another vault's key.
   */
  it('moves a pending debounced draft to the new scope when the vault switches', async () => {
    const OTHER = 'other-vault';
    const otherKey = `ontology-atlas:docs-vault-editor-draft:${OTHER}:${doc.slug}`;

    const view = render(
      <DocsVaultEditor
        vaultScope={VAULT_SCOPE}
        doc={doc}
        getDocContent={() => Promise.resolve('# 원본')}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const area = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(area.value).toContain('원본'));
    window.localStorage.clear();

    /*
     * Order matters: type first, then switch only the vault, so an armed debounce
     * without `vaultScope` in its deps writes to the old key. Typing after the switch would mask it.
     */
    fireEvent.change(area, { target: { value: '# 고친 것' } });

    view.rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocsVaultEditor
          vaultScope={OTHER}
          doc={doc}
          getDocContent={() => Promise.resolve('# 원본')}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      const written = window.localStorage.getItem(otherKey);
      expect(
        written,
        'the draft must land under the new scope key',
      ).toBeTruthy();
      expect(JSON.parse(written as string).content).toContain('고친 것');
    });

    expect(
      window.localStorage.getItem(draftKey),
      'the draft must not remain under the old scope key',
    ).toBeNull();
  });

});

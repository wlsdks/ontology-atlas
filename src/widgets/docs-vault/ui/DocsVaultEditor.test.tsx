import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import type { VaultDoc } from '@/entities/docs-vault';
import { DocsVaultEditor } from './DocsVaultEditor';

// Render wrapped in the next-intl provider so useTranslations does not throw. The
// existing Korean copy assertions keep working against the ko messages.
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
 * A draft key **includes the vault scope** (2026-08-01). While it was slug-only,
 * files of the same name in different folders overwrote each other's drafts, and if
 * the two files were byte-identical a save overwrote the other file.
 */
const VAULT_SCOPE = 'test-vault';
const draftKey = `ontology-atlas:docs-vault-editor-draft:${VAULT_SCOPE}:${doc.slug}`;

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('DocsVaultEditor', () => {
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
    expect(screen.getByText('저장 후 문서함 점검 또는 vault validate 실행')).toBeInTheDocument();
    expect(screen.getByText('되돌리기')).toBeInTheDocument();
    expect(screen.getByText('닫기 전 확인 · git diff로 최종 복구 가능')).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: 'unsaved draft' } });

    expect(screen.getByText('변경 사항 있음')).toBeInTheDocument();
    expect(screen.getByText('저장 전까지 디스크 미반영')).toBeInTheDocument();
    expect(screen.getByText('로컬 백업 준비 중')).toBeInTheDocument();
    expect(screen.getByText('디스크 저장 아님 · 저장 버튼 또는 ⌘S 필요')).toBeInTheDocument();
    expect(await screen.findByText('임시저장됨')).toBeInTheDocument();
    expect(screen.getByText('브라우저에 보관 · 최종 저장 필요')).toBeInTheDocument();
    expect(screen.getByText('브라우저에 초안 보관')).toBeInTheDocument();
    expect(screen.getByText('저장 전: 검증은 아직 디스크 기준')).toBeInTheDocument();
    expect(screen.getByText('취소 시 브라우저 초안 제거')).toBeInTheDocument();
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
    expect(screen.getByText('브라우저에 보관 · 최종 저장 필요')).toBeInTheDocument();
  });

  // Atlas A#5(a) — data-loss guard. A background poll rebuilds the vault
  // manifest, which gives `getDocContent` (editResolver, memoized on fileHandles)
  // a new identity on every detected change. The content-load effect must NOT
  // re-fetch over the user's UNSAVED edits when that identity changes.
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

  // Data-loss guard: a save REJECTED by a disk conflict (VaultConflictError —
  // the file changed between read and write) must NOT phantom-clean the buffer
  // or flash "Saved". If it did, dirty would drop and the next poll would
  // clobber the unsaved edits. The buffer stays dirty + a localized conflict
  // message is surfaced; a subsequent poll re-fetch must not overwrite.
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

    // rejected save → NO phantom "Saved", and a localized conflict message shows
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '디스크에서 먼저 변경되어 저장하지 못했습니다. 편집 내용은 유지됩니다. 내용을 복사한 뒤 새로고침해 최신 파일에 다시 반영하세요.',
      ),
    ).toBeInTheDocument();

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

  // A save blocked by the identity guard (clearing or changing uid, editing
  // merged_uids) is translated with the same grammar as a conflict — previously an
  // English developer sentence appeared verbatim on a Korean screen.
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
    expect(
      screen.getByText(
        '문서의 uid 는 이 노드의 영구 신원이라 지우거나 바꿀 수 없어요. uid 줄을 원래대로 되돌리면 저장됩니다.',
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

  it('마크다운 편집 textarea 가 접근명(aria-label)을 가진다', async () => {
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
   * **A slow load is still announced.**
   *
   * On 2026-08-08 the skeleton was deferred behind `SKELETON_DELAY_MS` (150ms),
   * because switching documents flashed the three-bar skeleton for a single frame
   * (measured 8.2–15.9ms). So this test also has to measure **past that window**.
   *
   * ⚠️ Why this test is not deleted: the delay exists for "invisible when fast",
   * and the property "announced when slow" has to stay alive. Delete it and the next
   * person can remove the skeleton entirely with nothing breaking.
   */
  it('오래 걸리는 로딩은 role=status 로 announce 된다 (a11y)', async () => {
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
    const status = await screen.findByRole('status', {}, { timeout: 2_000 });
    expect(status).toHaveAttribute('aria-label', '파일 불러오는 중…');
    // Cleanup: resolve to clear the dangling promise.
    resolve('done');
    await screen.findByDisplayValue('done');
  });

  /**
   * **Another vault's draft does not leak into this vault's editor** (added
   * 2026-08-01).
   *
   * The old key was slug-only (`…:README`). So opening folder A's `README.md`
   * showed folder B's body carrying a 「Temporarily saved · Final save required」 tag — prose the
   * user never wrote, presented as the user's unsaved changes.
   *
   * And if the two files were **byte-identical** at that moment, both the conflict
   * branch and the mtime guard passed, so a save wrote A's draft **over B's file**.
   * What this test pins is not cosmetics but that data-loss path.
   */
  it('다른 볼트의 초안을 읽지 않는다 — 키에 볼트가 들어간다', async () => {
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
   * **Switching vaults with the editor open** — the only candidate defect from the
   * 2026-08-06 `exhaustive-deps` audit that **touches data**.
   *
   * `vaultScope` is what builds the draft's localStorage key, and the four hooks
   * that write and clear drafts were **not holding it in their dependencies**. Then
   * a scope change does not rebuild the hook, and the closed-over value (the old
   * scope) writes to or clears **another vault's key**.
   *
   * This check reproduces that defect **through behaviour** — remove the dependency
   * and the draft does not appear under the new scope's key.
   */
  it('디바운스 중에 볼트를 갈아타면 초안이 **새 스코프**로 간다 — 옛 볼트로 새지 않는다', async () => {
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
     * ⚠️ **The order is the whole of this check.** Typing runs the draft-write effect
     * and arms a 250ms debounce timer. Switching only the vault **after that** leaves
     * `content`, `dirty` and `doc.slug` unchanged, so unless `vaultScope` is in the
     * dependencies the effect **does not re-run** and the armed timer writes to **the
     * old scope's key**.
     *
     * Written in the reverse order at first, the defect did not reproduce: typing
     * **after** the switch changes `content`, so the effect re-runs with a fresh
     * closure and the missing dependency is masked.
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

    await waitFor(
      () => {
        const written = window.localStorage.getItem(otherKey);
        expect(
          written,
          '초안이 새 스코프 키에 안 생겼다 — vaultScope 가 의존성에서 빠져 옛 스코프로 샜다',
        ).toBeTruthy();
        expect(JSON.parse(written as string).content).toContain('고친 것');
      },
      { timeout: 2000 },
    );

    expect(
      window.localStorage.getItem(draftKey),
      '옛 스코프 키에 초안이 남았다 — 남의 볼트를 오염시킨다',
    ).toBeNull();
  });

});

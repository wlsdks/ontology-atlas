import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * 초안 키에는 **볼트 범위가 들어간다** (2026-08-01). 슬러그만이던 시절엔 다른
 * 폴더의 같은 이름 파일이 서로의 초안을 덮었고, 두 파일이 바이트가 같으면
 * 저장이 남의 파일을 덮어썼다.
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
  // or flash "저장됨". If it did, dirty would drop and the next poll would
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

    // rejected save → NO phantom "저장됨", and a localized conflict message shows
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

  it('로딩 스켈레톤이 role=status 로 announce 된다 (a11y)', async () => {
    // content 가 resolve 되기 전 초기 로딩 상태 — 스켈레톤이 스크린리더에
    // "불러오는 중" 으로 announce 돼야 한다.
    let resolve!: (v: string) => void;
    render(
      <DocsVaultEditor vaultScope={VAULT_SCOPE}
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

  /**
   * **다른 볼트의 초안이 이 볼트의 편집기로 새지 않는다** (2026-08-01 신설).
   *
   * 종전 키는 슬러그만이었다(`…:README`). 그래서 폴더 A 의 `README.md` 를 열면
   * 폴더 B 의 본문이 「임시저장됨 · 최종 저장 필요」 딱지를 달고 나타났다 —
   * 사용자가 쓴 적 없는 글이 사용자의 미저장 변경으로 제시된 것이다.
   *
   * 그리고 두 파일이 그 시점에 **바이트가 같으면** 충돌 분기도 mtime 가드도
   * 통과해서, 저장이 A 의 초안을 **B 의 파일 위에** 썼다. 이 시험이 잠그는 것은
   * 미관이 아니라 그 데이터 손실 경로다.
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

});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import { LibraryCollectionsConflictError, type LibraryCollectionItem } from '@/entities/library-collection';
import type { ConstellationCandidate, SavedConstellation } from '@/features/saved-constellations';
import { SavedConstellationsControl } from './SavedConstellationsControl';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  reload: vi.fn(),
  remove: vi.fn(),
  constellations: [] as SavedConstellation[],
}));

vi.mock('@/features/saved-constellations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/saved-constellations')>();
  return {
    ...original,
    useSavedConstellations: () => ({
      status: 'ready' as const,
      constellations: mocks.constellations,
      error: null,
      reload: mocks.reload,
      saveConstellation: mocks.save,
      deleteConstellation: mocks.remove,
    }),
  };
});

const FOLDER_ID = '11111111-1111-4111-8111-111111111111';
const UID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function candidate(uid: string, label: string, x: number): ConstellationCandidate {
  return {
    uid,
    mergedUids: [],
    mapId: `element:${label}`,
    lastKnownPath: `elements/${label}.md`,
    label,
    kind: 'element',
    galaxyPoint: { x, y: x / 2 },
  };
}

const candidates = [
  candidate(UID_A, '첫 번째', -20),
  candidate(UID_B, '두 번째', 10),
  candidate(UID_C, '세 번째', 30),
];

function item(uid: string, label: string, order: number): LibraryCollectionItem {
  return {
    id: `${order + 4}0000000-0000-4000-8000-000000000000`,
    folderId: FOLDER_ID,
    order,
    label,
    target: { kind: 'ontology', uid, lastKnownPath: `elements/${label}.md` },
  };
}

function saved(name: string, purpose: string, items: LibraryCollectionItem[]): SavedConstellation {
  return {
    folder: {
      id: FOLDER_ID,
      name,
      purpose,
      parentId: null,
      order: 0,
      presentation: 'constellation',
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    },
    items,
  };
}

function renderControl() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <SavedConstellationsControl
        handle={{ kind: 'directory', name: 'vault' } as FileSystemDirectoryHandle}
        candidates={candidates}
        selectedSlug={null}
        onFocus={vi.fn()}
        onClear={vi.fn()}
        onPrepare={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

async function openEditedDraft() {
  fireEvent.click(screen.getByRole('button', { name: '내 별자리' }));
  fireEvent.click(await screen.findByRole('button', { name: '편집' }));
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: '내 초안' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /두 번째/ }));
  fireEvent.click(screen.getByRole('button', { name: '별자리 저장' }));
  await screen.findByRole('button', { name: '변경 내용 확인' });
}

/**
 * **The chip expands a named region, and says which one** (map round,
 * 2026-09-20).
 *
 * It used to claim `aria-haspopup="dialog"` while what opened was an unnamed
 * `div`: measured on the live map, zero elements with `role="dialog"`, no
 * `aria-controls` on the trigger, and no accessible name on the panel — a
 * reader heard "expanded" and had nothing to move to. Giving it the dialog role
 * would have been a hand-assembled modal, which `dialog.tsx` owns and the
 * adoption ratchet refuses, and a lie besides: no scrim, no focus trap, focus
 * stays on the chip and the map behind stays live. So it is what it always
 * behaved as — a disclosure pointing at a named region.
 */
describe('SavedConstellationsControl — the chip expands a named region', () => {
  it('names the region, ties it to the chip, and claims no dialog', () => {
    renderControl();
    const trigger = screen.getByRole('button', { name: '내 별자리' });
    expect(trigger).not.toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: '저장한 범위' })).toBeNull();

    fireEvent.click(trigger);

    const region = screen.getByRole('region', { name: '저장한 범위' });
    const id = region.getAttribute('id');
    expect(id, 'the region needs an id for aria-controls').toBeTruthy();
    expect(trigger).toHaveAttribute('aria-controls', id!);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('SavedConstellationsControl conflict recovery', () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.reload.mockReset();
    mocks.remove.mockReset();
    mocks.constellations = [saved('이전 이름', '이전 목적', [item(UID_A, '첫 번째', 0)])];
    mocks.save.mockRejectedValueOnce(new LibraryCollectionsConflictError('{}'));
  });

  it('keeps the draft, reviews the latest set, and applies only after the explicit action', async () => {
    const latest = saved('밖에서 바꾼 이름', '밖에서 바꾼 목적', [item(UID_C, '세 번째', 0)]);
    mocks.reload.mockResolvedValue({ status: 'ready', constellations: [latest] });
    mocks.save.mockResolvedValueOnce(FOLDER_ID);
    renderControl();

    await openEditedDraft();
    expect(screen.getByRole('alert')).toHaveTextContent('초안은 그대로 있어요');
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('내 초안');

    fireEvent.click(screen.getByRole('button', { name: '변경 내용 확인' }));
    const review = await screen.findByTestId('saved-constellation-conflict-review');
    expect(review).toHaveTextContent('밖에서 바꾼 이름');
    expect(review).toHaveTextContent('밖에서 바꾼 목적');
    expect(review).toHaveTextContent('첫 번째, 두 번째');
    expect(review).toHaveTextContent('세 번째');
    expect(mocks.save).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '이 초안 적용' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({
      id: FOLDER_ID,
      name: '내 초안',
      members: expect.arrayContaining([
        expect.objectContaining({ uid: UID_A }),
        expect.objectContaining({ uid: UID_B }),
      ]),
    });
  });

  it('refuses apply after a failed reload and never resurrects a deleted saved ID', async () => {
    mocks.reload
      .mockResolvedValueOnce({ status: 'corrupt', error: 'broken latest bytes' })
      .mockResolvedValueOnce({ status: 'ready', constellations: [] });
    mocks.save.mockResolvedValueOnce('99999999-9999-4999-8999-999999999999');
    renderControl();

    await openEditedDraft();
    fireEvent.click(screen.getByRole('button', { name: '변경 내용 확인' }));
    await screen.findByRole('button', { name: '변경 내용 확인' });
    expect(screen.getByRole('alert')).toHaveTextContent('최신 저장 파일을 읽지 못했어요');
    expect(screen.queryByRole('button', { name: '이 초안 적용' })).not.toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '변경 내용 확인' }));
    expect(await screen.findByTestId('saved-constellation-conflict-review')).toHaveTextContent('삭제되었어요');
    fireEvent.click(screen.getByRole('button', { name: '새 별자리로 저장' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1]?.[0]).not.toHaveProperty('id');
  });
});

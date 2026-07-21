import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import { LocalVaultPicker } from './LocalVaultPicker';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function recentVault(name: string, rootPath: string, lastAccessedAt: number): LocalFsHandleRecord {
  return {
    id: rootPath,
    handle: { kind: 'directory', name } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name,
    createdAt: lastAccessedAt,
    lastAccessedAt,
  };
}

describe('LocalVaultPicker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('idle 상태에서 로컬 markdown vault 사용 모델을 설명한다', () => {
    render(
      <LocalVaultPicker
        status="idle"
        handleName={null}
        docCount={0}
        errorMessage={null}
        lastLoadedAt={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRequestPermission={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/마크다운 파일이 있는 로컬 폴더를 선택하세요/),
    ).toBeInTheDocument();
    expect(screen.getByText(/업로드는 없습니다/)).toBeInTheDocument();
  });

  it('idle 상태에서 최근 desktop vault 를 원클릭 재열기 affordance 로 보여준다', () => {
    const onOpenRecent = vi.fn();
    const onForgetRecent = vi.fn();
    const record = recentVault(
      'ontology',
      '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      1779498839000,
    );

    render(
      <LocalVaultPicker
        status="idle"
        handleName={null}
        docCount={0}
        errorMessage={null}
        lastLoadedAt={null}
        recentVaults={[record]}
        onOpen={vi.fn()}
        onOpenRecent={onOpenRecent}
        onForgetRecent={onForgetRecent}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRequestPermission={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('최근에 열었던 vault')).toBeInTheDocument();
    expect(screen.getByText(/열었음/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '최근 vault 열기: ontology' }));

    expect(onOpenRecent).toHaveBeenCalledWith(record);
    fireEvent.click(screen.getByRole('button', { name: '최근 vault 지우기: ontology' }));

    expect(onForgetRecent).toHaveBeenCalledWith(record);
  });

  it('idle 상태의 최근 vault 상대시각도 앱을 열어둔 동안 갱신한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1779498839000);
    const record = recentVault(
      'ontology',
      '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      1779498839000,
    );

    render(
      <LocalVaultPicker
        status="idle"
        handleName={null}
        docCount={0}
        errorMessage={null}
        lastLoadedAt={null}
        recentVaults={[record]}
        onOpen={vi.fn()}
        onOpenRecent={vi.fn()}
        onForgetRecent={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRequestPermission={vi.fn()}
      />,
    );

    expect(screen.getByText('방금 열었음')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText('15초 전 열었음')).toBeInTheDocument();
  });

  it('error + path-missing 이면 폴더가 사라졌다는 지역화 안내 + 최근 재열기 목록을 함께 보여준다', () => {
    // P5 데스크톱: 저장된 vault 폴더가 이동/삭제된 침묵 실패. 이제 왜
    // 안 되는지(폴더 사라짐) + 다음 행동(다시 선택/다른 최근)을 말해야 한다.
    const onOpen = vi.fn();
    const onOpenRecent = vi.fn();
    const record = recentVault(
      'ontology',
      '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      Date.now() - 3_000,
    );

    render(
      <LocalVaultPicker
        status="error"
        handleName={null}
        docCount={0}
        errorMessage={null}
        errorCode="path-missing"
        lastLoadedAt={null}
        recentVaults={[record]}
        onOpen={onOpen}
        onOpenRecent={onOpenRecent}
        onForgetRecent={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRequestPermission={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/이전에 열었던 폴더를 더 이상 찾을 수 없어요/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/폴더를 다시 선택하세요/),
    ).toBeInTheDocument();
    // generic fallback 은 뜨지 않는다.
    expect(
      screen.queryByText(/폴더 접근 중 문제가 생겼습니다/),
    ).not.toBeInTheDocument();
    // 다음 행동: 다시 선택 + 최근 재열기.
    fireEvent.click(screen.getByRole('button', { name: '다시 선택' }));
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: '최근 vault 열기: ontology' }),
    );
    expect(onOpenRecent).toHaveBeenCalledWith(record);
  });

  it('error + access-failed 이면 원인 문자열(예: Tauri Err(String))을 그대로 노출한다', () => {
    // 침묵 금지: Tauri invoke 가 문자열로 reject 한 실제 원인이 보여야 한다.
    render(
      <LocalVaultPicker
        status="error"
        handleName={null}
        docCount={0}
        errorMessage="No such file or directory (os error 2)"
        errorCode="access-failed"
        lastLoadedAt={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRequestPermission={vi.fn()}
      />,
    );

    expect(
      screen.getByText('No such file or directory (os error 2)'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/폴더 접근 중 문제가 생겼습니다/),
    ).not.toBeInTheDocument();
  });

  it('권한 재승인 상태에서도 다른 최근 vault 로 바로 전환할 수 있다', () => {
    const onOpenRecent = vi.fn();
    const record = recentVault(
      'client-vault',
      '/Users/jinan/work/client-vault',
      Date.now() - 60_000,
    );

    render(
      <LocalVaultPicker
        status="permission-needed"
        handleName="old-vault"
        docCount={0}
        errorMessage={null}
        lastLoadedAt={null}
        recentVaults={[record]}
        onOpen={vi.fn()}
        onOpenRecent={onOpenRecent}
        onForgetRecent={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRequestPermission={vi.fn()}
      />,
    );

    expect(screen.getByText(/다시 승인하면 그대로 이어서 봅니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '최근 vault 열기: client-vault' }));

    expect(onOpenRecent).toHaveBeenCalledWith(record);
  });
});

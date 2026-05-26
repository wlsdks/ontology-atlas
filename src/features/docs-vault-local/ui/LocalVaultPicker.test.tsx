import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
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
      '/Users/jinan/side-project/oh-my-ontology/docs/ontology',
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
});

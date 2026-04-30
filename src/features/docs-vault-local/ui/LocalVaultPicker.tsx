'use client';

import { useEffect, useState } from 'react';
import { FolderOpen, FolderX, HardDrive, RefreshCw, Shield } from 'lucide-react';
import { Tooltip } from '@/shared/ui';

interface Props {
  status:
    | 'idle'
    | 'opening'
    | 'loading'
    | 'loaded'
    | 'permission-needed'
    | 'unsupported'
    | 'error';
  handleName: string | null;
  docCount: number;
  errorMessage: string | null;
  /** 마지막 스캔 epoch ms. null 이면 표시 안 함. */
  lastLoadedAt: number | null;
  onOpen: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onRequestPermission: () => void;
}

function formatRelative(now: number, ts: number): string {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return `${h}시간 전`;
}

/**
 * 로컬 볼트 상단 바. 폴더 미선택 → 열기 버튼. 선택 후 → 폴더 이름 + 새로
 * 고침 + 닫기. 권한 만료 → 재요청. 브라우저 미지원 → 안내.
 */
export function LocalVaultPicker({
  status,
  handleName,
  docCount,
  errorMessage,
  lastLoadedAt,
  onOpen,
  onClose,
  onRefresh,
  onRequestPermission,
}: Props) {
  // 상대시각이 실시간으로 업데이트되도록 15초 tick. loaded 상태일 때만 작동.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'loaded' || lastLoadedAt === null) return;
    const t = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [status, lastLoadedAt]);
  if (status === 'unsupported') {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-md border border-[color:rgba(239,180,120,0.3)] bg-[color:rgba(239,180,120,0.06)] px-3 py-1.5 text-[11.5px] text-[color:rgba(239,200,150,0.95)]">
        <Shield size={12} aria-hidden />
        이 브라우저는 File System Access API 를 지원하지 않아 로컬 볼트를
        쓸 수 없습니다. Chrome·Edge·Safari 18.2+ 또는 Opera 권장.
      </div>
    );
  }
  if (status === 'permission-needed') {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-md border border-[color:rgba(239,180,120,0.3)] bg-[color:rgba(239,180,120,0.06)] px-3 py-1.5 text-[11.5px] text-[color:rgba(239,200,150,0.95)]">
        <Shield size={12} aria-hidden />
        <span className="flex-1">
          이전에 열었던 폴더가 있어요. 다시 승인하면 그대로 이어서 봅니다.
        </span>
        <button
          type="button"
          onClick={onRequestPermission}
          className="rounded-sm border border-[color:rgba(239,200,150,0.4)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:rgba(239,180,120,0.12)]"
        >
          재승인
        </button>
        <Tooltip content="폴더 지우기" withProvider={false}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            지우기
          </button>
        </Tooltip>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-md border border-[color:rgba(220,120,120,0.3)] bg-[color:rgba(220,120,120,0.06)] px-3 py-1.5 text-[11.5px] text-[color:rgba(240,180,180,0.95)]">
        <span>{errorMessage ?? '로컬 볼트 오류'}</span>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto rounded-sm border border-[color:rgba(240,180,180,0.4)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:rgba(220,120,120,0.12)]"
        >
          다시 선택
        </button>
      </div>
    );
  }
  if (status === 'loaded' && handleName) {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-tertiary)]">
        <HardDrive
          size={12}
          className="text-[color:rgba(139,151,255,0.7)]"
          aria-hidden
        />
        <span className="truncate text-[color:var(--color-text-primary)]">
          {handleName}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {docCount} 문서
        </span>
        {lastLoadedAt !== null ? (
          <span
            className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
            title={new Date(lastLoadedAt).toLocaleString('ko-KR')}
          >
            · {formatRelative(nowTick, lastLoadedAt)} 스캔
          </span>
        ) : null}
        <Tooltip content="다시 스캔" withProvider={false}>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="다시 스캔"
            className="ml-auto inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.25)] hover:text-[color:var(--color-text-primary)]"
          >
            <RefreshCw size={11} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content="로컬 볼트 닫기" withProvider={false}>
          <button
            type="button"
            onClick={onClose}
            aria-label="로컬 볼트 닫기"
            className="inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(220,120,120,0.3)] hover:text-[color:rgba(240,180,180,0.95)]"
          >
            <FolderX size={11} aria-hidden />
          </button>
        </Tooltip>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={status === 'opening' || status === 'loading'}
      className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-[color:rgba(139,151,255,0.3)] bg-[color:rgba(94,106,210,0.06)] px-3 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.9)] transition-colors hover:border-[color:rgba(139,151,255,0.5)] hover:bg-[color:rgba(94,106,210,0.1)] disabled:opacity-60"
    >
      <FolderOpen size={12} aria-hidden />
      {status === 'opening'
        ? '폴더 여는 중…'
        : status === 'loading'
          ? '매니페스트 빌드 중…'
          : '내 PC 의 마크다운 폴더 열기'}
    </button>
  );
}

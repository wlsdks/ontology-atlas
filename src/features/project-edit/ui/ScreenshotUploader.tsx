'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { uploadScreenshot, deleteScreenshot } from '@/entities/project/api';

interface Props {
  slug: string;
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * 스크린샷 업로드/삭제. Firebase Storage를 직접 호출.
 * slug가 비어 있으면(= create 모드, 아직 저장 전) 업로드 차단 — 저장 후에만 가능.
 */
export function ScreenshotUploader({ slug, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUpload = slug.length > 0;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!canUpload) {
      setError('프로젝트를 먼저 저장한 뒤 업로드하세요.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        // storage.rules와 동기화: png/jpeg/webp, 5MB 제한.
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
          throw new Error(`${file.name}: png/jpeg/webp만 허용됩니다.`);
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`${file.name}: 5MB 초과`);
        }
        const url = await uploadScreenshot(slug, file);
        uploaded.push(url);
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (url: string) => {
    if (!confirm('이 스크린샷을 삭제할까요?')) return;
    onChange(value.filter((u) => u !== url));
    // 스토리지 삭제는 best-effort — 실패해도 폼에선 제거
    void deleteScreenshot(url);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
      {/* 기존 스크린샷 그리드 */}
      {value.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {value.map((url) => (
            <div
              key={url}
              className="group relative aspect-video overflow-hidden rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-canvas)]"
            >
              <Image
                src={url}
                alt="screenshot"
                fill
                sizes="(min-width: 768px) 33vw, 50vw"
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => handleDelete(url)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-backdrop-strong)] text-[color:var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                aria-label="삭제"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[color:var(--color-text-quaternary)]">
          등록된 스크린샷이 없습니다.
        </p>
      )}

      {/* 업로드 버튼 */}
      <div className="border-t border-[color:var(--color-overlay-2)] pt-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading || !canUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !canUpload}
          className={cn(
            'flex h-9 items-center gap-2 rounded-md border border-dashed border-[color:var(--color-border-strong)] px-3 text-xs transition-colors',
            'text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Upload size={12} aria-hidden />
          {uploading ? '업로드 중…' : '이미지 업로드 (여러 장 가능)'}
        </button>
        {!canUpload && (
          <p className="mt-1.5 text-[11px] text-[color:var(--color-text-quaternary)]">
            새 프로젝트는 먼저 저장해야 업로드할 수 있습니다.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-1.5 text-[11px] text-[color:var(--color-status-danger)]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

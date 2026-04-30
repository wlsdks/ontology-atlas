'use client';

import { type ReactNode } from 'react';
import { toast as sonnerToast, Toaster } from 'sonner';

type ToastTone = 'success' | 'info' | 'error';

interface ToastApi {
  /** 기존 API 보존 — `useToast()` 호출자가 그대로 작동. */
  show: (message: string, tone?: ToastTone) => void;
}

/**
 * sonner 기반 토스트 (Fire 5).
 *
 * 변경:
 * - 자체 ToastProvider (framer-motion + state stack) → sonner `<Toaster />`
 * - aria-live + 우하단 stack + auto dismiss = sonner 내장 동작
 * - tone 별 색은 `<Toaster />` 의 toastOptions.classNames 로 디자인 헌장 §11
 *   준수 (인디고 alpha + 무채색, glow 0)
 *
 * 호출 사이트 (~50 곳) 는 무수정. `useToast().show(message, tone)` API 유지.
 *
 * 본 모듈이 'use client' 인 이유: sonner 내부 store 가 클라이언트 전용.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        offset={16}
        gap={8}
        containerAriaLabel="작업 알림"
        // sonner 기본 hotkey (Alt+T) 는 한국어 사용자에게 의미 전달 약함 +
        // screen reader 가 "알림 alt+T" 로 읽어 라벨을 모호하게 만듦. 빈 배열로
        // 비활성화해 region 라벨이 "작업 알림" 만 노출되도록 함.
        hotkey={[]}
        // 디자인 헌장 §11 — 무채색 + 인디고 alpha 만. swipe / scale 같은 기본
        // 애니메이션 은 sonner 의 onmount/exit 만 (motion-reduce 자동 존중).
        toastOptions={{
          classNames: {
            toast:
              'rounded-full border bg-[color:var(--color-panel)] px-3.5 py-2 text-[12px] shadow-[0_10px_28px_rgba(0,0,0,0.42)]',
            success:
              'border-[color:rgba(120,190,150,0.35)] text-[color:var(--color-text-primary)]',
            info: 'border-[color:rgba(139,151,255,0.35)] text-[color:var(--color-text-primary)]',
            error:
              'border-[color:rgba(236,116,116,0.35)] text-[color:var(--color-text-primary)]',
          },
        }}
      />
    </>
  );
}

/**
 * 기존 `useToast().show(msg, tone)` API 유지를 위한 thin wrapper. sonner 의
 * imperative API 를 invoke. tone fallback = 'success' (이전 ToastProvider 와
 * 동일).
 *
 * Provider 밖 호출이어도 sonner 가 내부 store 를 유지하므로 noop 분기는 불요
 * (자체 구현의 context-null 분기 제거됨).
 */
export function useToast(): ToastApi {
  return {
    show: (message: string, tone: ToastTone = 'success') => {
      switch (tone) {
        case 'error':
          sonnerToast.error(message);
          return;
        case 'info':
          sonnerToast.info(message);
          return;
        case 'success':
        default:
          sonnerToast.success(message);
      }
    },
  };
}

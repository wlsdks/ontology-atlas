'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast as sonnerToast, Toaster } from 'sonner';

type ToastTone = 'success' | 'info' | 'error';

interface ToastApi {
  /** 기존 API 보존 — `useToast()` 호출자가 그대로 작동. */
  show: (message: string, tone?: ToastTone) => void;
}

/**
 * sonner 기반 토스트 — 앱의 **단일 canonical 알림 팝업**이다. 개별 화면이
 * 각자 팝업을 만들지 않고 전부 `useToast().show()` 로 이 컴포넌트를 거친다.
 *
 * 변경:
 * - 자체 ToastProvider (framer-motion + state stack) → sonner `<Toaster />`
 * - aria-live + 우하단 stack + auto dismiss = sonner 내장 동작
 * - tone 별 색은 `<Toaster />` 의 toastOptions.classNames 로 디자인 헌장 §11
 *   준수 (인디고 alpha + 무채색, glow 0)
 * - **다크 단일 계약**: `theme="dark"` 를 명시해 sonner 기본 라이트 테마의
 *   흰색 팝업을 차단한다 (소유자 실보고 2026-07-24: 공방 알림이 흰색
 *   오프브랜드로 떴다 — 원인은 `theme` 미지정 시 sonner 가 light 로 폴백).
 * - **닫기 어포던스**: `closeButton` 으로 모든 팝업에 실제 닫기 버튼을 단다.
 *
 * 호출 사이트 (~50 곳) 는 무수정. `useToast().show(message, tone)` API 유지.
 *
 * 본 모듈이 'use client' 인 이유: sonner 내부 store 가 클라이언트 전용.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        closeButton
        position="bottom-right"
        // 하단 오프셋만 CSS 변수로 받아, 하단에 쓰기 바가 있는 빌더 페이지가
        // 토스트를 바 위로 밀어 "vault 에 쓰기" 버튼을 가리지 않게 한다
        // (`toast-position.ts` 계약 · 빌더 감사 #5). 다른 페이지는 기본 16px.
        offset={{
          top: 16,
          right: 16,
          bottom: 'var(--app-toast-bottom-offset, 16px)',
          left: 16,
        }}
        gap={8}
        containerAriaLabel={t('notificationsAriaLabel')}
        // sonner 기본 hotkey (Alt+T) 는 한국어 사용자에게 의미 전달 약함 +
        // screen reader 가 "알림 alt+T" 로 라벨을 모호하게 만듦. 빈 배열로
        // 비활성화해 region 라벨이 locale-aware "Notifications / 작업 알림"
        // 만 노출되도록 한다.
        hotkey={[]}
        // 디자인 헌장 §11 — 무채색 + 인디고 alpha 만. swipe / scale 같은 기본
        // 애니메이션 은 sonner 의 onmount/exit 만 (motion-reduce 자동 존중).
        toastOptions={{
          classNames: {
            toast:
              'rounded-full border bg-[color:var(--color-panel)] px-3.5 py-2 text-body text-[color:var(--color-text-primary)] shadow-[0_10px_28px_var(--color-shadow-a42)]',
            success:
              'border-[color:var(--color-success-a35)] text-[color:var(--color-text-primary)]',
            info: 'border-[color:var(--color-indigo-line-a35)] text-[color:var(--color-text-primary)]',
            error:
              'border-[color:var(--color-danger-a32)] text-[color:var(--color-text-primary)]',
            // Close affordance — token-styled so it reads as our dark chrome,
            // never sonner's default light chip.
            closeButton:
              'border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
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

'use client';

import { type ReactNode } from 'react';
import { toast as sonnerToast, Toaster } from 'sonner';

type ToastTone = 'success' | 'info' | 'error';

/**
 * 토스트가 **하나만** 달 수 있는 후속 동작 (2026-08-03, PO 카운슬 평결 ⑤).
 *
 * 왜 하나인가 — 토스트는 스스로 사라지는 표면이라 **선택을 물을 자격이 없다.**
 * 둘 이상이면 사용자는 사라지기 전에 고르라는 압박을 받는다. 하나면 그건
 * 선택이 아니라 「방금 한 일로 가는 길」이다.
 *
 * 왜 필수가 아닌가 — 이 동작을 놓쳐도 사용자가 잃는 것이 없어야 한다. 놓치면
 * 곤란한 일은 토스트가 아니라 상주 표면이 맡는다.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastApi {
  /**
   * 기존 API 보존 — `useToast()` 호출자 ~50곳이 그대로 작동한다.
   * `action` 은 **옵션**이라 기존 호출부는 한 글자도 안 바뀐다.
   */
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void;
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
export function ToastProvider({
  children,
  /**
   * 알림 영역의 접근 이름. **문자열은 주입받는다** (2026-08-15 이식성 슬라이스).
   *
   * 종전에는 이 부품이 `useTranslations('nav')` 로 직접 번역을 읽었다 — 그
   * 한 줄 때문에 알림 부품이 이 앱의 next-intl 설정과 `nav` 네임스페이스에
   * 묶여, 디자인 시스템만 받아 간 사람의 프로젝트에서는 **부품이 아예 안
   * 돈다**. 프리미티브가 자기 문자열을 스스로 가져오면 그 프리미티브는 그
   * 앱의 것이지 시스템의 것이 아니다.
   *
   * 기본값은 영어 한 단어 — 주입을 잊어도 스크린리더가 이름 없는 영역을
   * 만나지 않는다. 이 앱은 `AppProviders` 에서 번역을 넣어 준다.
   */
  notificationsLabel = 'Notifications',
}: {
  children: ReactNode;
  notificationsLabel?: string;
}) {
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
        containerAriaLabel={notificationsLabel}
        // sonner 기본 hotkey (Alt+T) 는 한국어 사용자에게 의미 전달 약함 +
        // screen reader 가 "알림 alt+T" 로 라벨을 모호하게 만듦. 빈 배열로
        // 비활성화해 region 라벨이 locale-aware "Notifications / 작업 알림"
        // 만 노출되도록 한다.
        hotkey={[]}
        // 디자인 헌장 §11 — 무채색 + 인디고 alpha 만.
        toastOptions={{
          classNames: {
            // `app-toast` 는 스타일이 아니라 **모션 훅**이다 — sonner 의
            // 공장값 400ms `ease`(첫 프레임 2.5%, 피크 6프레임 = 등장에
            // ease-in)를 앱 램프로 갈아 끼우고, 감속 사용자에게 하드컷 대신
            // 동등물을 주는 규칙이 이 클래스에 걸린다 (`app/globals.css`
            // "토스트(sonner) 모션" 절, 2026-07-28 프레임 실측).
            toast:
              'app-toast rounded-full border bg-[color:var(--color-panel)] px-3.5 py-2 text-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)]',
            success:
              'border-[color:var(--color-success-a35)] text-[color:var(--color-text-primary)]',
            info: 'border-[color:var(--color-indigo-line-a35)] text-[color:var(--color-text-primary)]',
            error:
              'border-[color:var(--color-danger-a32)] text-[color:var(--color-text-primary)]',
            // Close affordance — token-styled so it reads as our dark chrome,
            // never sonner's default light chip.
            closeButton:
              'border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
            // 후속 동작 버튼 — 닫기와 같은 이유로 토큰을 입힌다(sonner 기본은
            // 라이트 칩이라 다크 단일 계약을 깬다). **채워진 인디고가 아니다**:
            // 토스트는 사라지는 표면이고, 여기서 주목을 가져가면 화면의 진짜
            // 주목 승자와 경쟁한다. 조용한 ghost 로 두고 라벨이 일하게 한다.
            actionButton:
              'border border-[color:var(--color-indigo-line-a35)] bg-transparent text-[color:var(--color-indigo-accent)] hover:bg-[color:var(--color-indigo-a16)]',
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
    show: (message: string, tone: ToastTone = 'success', action?: ToastAction) => {
      // `action` 이 없으면 sonner 에 옵션 객체 자체를 넘기지 않는다 — 기존
      // 호출부의 동작을 한 톨도 바꾸지 않기 위해서다.
      const options = action
        ? { action: { label: action.label, onClick: action.onClick } }
        : undefined;
      switch (tone) {
        case 'error':
          sonnerToast.error(message, options);
          return;
        case 'info':
          sonnerToast.info(message, options);
          return;
        case 'success':
        default:
          sonnerToast.success(message, options);
      }
    },
  };
}

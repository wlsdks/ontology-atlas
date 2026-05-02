'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ACCOUNT_QUERY_KEY, normalizeAccountId } from '@/shared/lib/account-scope';
import {
  buildGuardHomeHref,
  buildGuardLoginHref,
} from '../model/guard-navigation';

type Variant = 'unauthenticated' | 'denied' | 'loading';

interface Props {
  variant: Variant;
}

interface SurfaceCopy {
  eyebrow: string;
  title: string;
  body: string;
}

interface VariantCopy {
  primaryLabel: string;
  primaryHref: string;
  showSecondary: boolean;
}

// 운영 surface 별 1줄 가치 설명 — 같은 "로그인하세요" 가 아니라
// "여기서 무엇을 하게 될지" 를 미리 알려, 사용자가 로그인할 동기를 잡고
// 어떤 화면인지 컨텍스트를 잃지 않게 한다. pathname prefix 로 매칭.
const SURFACE_HINTS: ReadonlyArray<{
  match: (path: string) => boolean;
  unauthenticated: SurfaceCopy;
  denied: SurfaceCopy;
}> = [
  {
    match: (p) => p.startsWith('/knowledge'),
    unauthenticated: {
      eyebrow: '문서',
      title: '문서를 다루려면 로그인이 필요해요',
      body: 'cloud 모드 문서 surface 입니다. 로그인하면 바로 이 화면으로 돌아옵니다. (로그인 없이 vault 만 쓰려면 /docs 에서 폴더 선택)',
    },
    denied: {
      eyebrow: '문서',
      title: '이 공간의 문서를 다룰 수 없어요',
      body: '이 공간의 문서 작업은 owner/editor 권한이 필요합니다. 다른 계정으로 로그인하거나 권한을 요청하세요.',
    },
  },
  {
    match: (p) => p.startsWith('/review'),
    unauthenticated: {
      eyebrow: '문서 확인',
      title: '문서 확인은 로그인이 필요해요',
      body: 'AI 가 문서에서 찾아낸 프로젝트·허브 연결 후보를 살펴보고 골라냅니다. 골라낸 것만 공개 지도에 보입니다.',
    },
    denied: {
      eyebrow: '문서 확인',
      title: '이 공간의 문서를 확인할 수 없어요',
      body: '문서 확인은 owner/editor 만 다룰 수 있습니다. 다른 계정으로 로그인하거나 권한을 요청하세요.',
    },
  },
  {
    match: (p) => p.startsWith('/settings'),
    unauthenticated: {
      eyebrow: '카테고리',
      title: '카테고리를 정리하려면 로그인이 필요해요',
      body: '지도의 카테고리·상태·API 키를 정리합니다. 로그인하면 바로 이 화면으로 돌아옵니다.',
    },
    denied: {
      eyebrow: '카테고리',
      title: '이 공간을 정리할 수 없어요',
      body: '이 공간 정리는 owner 권한이 필요합니다. 다른 계정으로 로그인하거나 권한을 요청하세요.',
    },
  },
  {
    match: (p) => p.startsWith('/diagnostics'),
    unauthenticated: {
      eyebrow: '챙길 곳',
      title: '챙길 곳을 보려면 로그인이 필요해요',
      body: '지금 손대야 할 프로젝트와 데이터 상태를 한 화면에 모읍니다. 운영 정보라 로그인이 필요합니다.',
    },
    denied: {
      eyebrow: '챙길 곳',
      title: '이 공간의 챙길 곳을 볼 수 없어요',
      body: '챙길 곳은 owner/editor 만 볼 수 있습니다. 다른 계정으로 로그인하거나 권한을 요청하세요.',
    },
  },
];

const DEFAULT_SURFACE: { unauthenticated: SurfaceCopy; denied: SurfaceCopy } = {
  unauthenticated: {
    eyebrow: '내 공간',
    title: '로그인이 필요합니다',
    body: '내 공간을 편집하려면 로그인해주세요. 처음이면 회원가입으로 자기 공간이 자동 생성됩니다.',
  },
  denied: {
    eyebrow: '접근 권한 없음',
    title: '이 공간에 접근할 수 없습니다',
    body: '로그인은 되어있지만 이 공간의 편집 권한이 없습니다. 공간 소유자에게 권한을 요청하거나 다른 계정으로 다시 로그인해주세요.',
  },
};

const VARIANT_ACTIONS: Record<Variant, VariantCopy> = {
  unauthenticated: {
    primaryLabel: '로그인',
    primaryHref: '/login/',
    showSecondary: true,
  },
  denied: {
    primaryLabel: '다른 계정으로 로그인',
    primaryHref: '/login/',
    showSecondary: true,
  },
  loading: {
    primaryLabel: '',
    primaryHref: '',
    showSecondary: false,
  },
};

function resolveSurfaceCopy(
  pathname: string,
  variant: Variant,
): SurfaceCopy {
  if (variant === 'loading') {
    return { eyebrow: '', title: '확인 중입니다…', body: '계정 상태를 확인하고 있습니다.' };
  }
  const hint = SURFACE_HINTS.find((s) => s.match(pathname));
  return (hint ?? DEFAULT_SURFACE)[variant];
}

/**
 * 모든 PermissionGate 가 공유하는 빈 상태 UI. 로그인이 필요하거나 권한이
 * 없을 때 사용자에게 다음 행동(로그인 이동, 공개 홈 복귀)을 제공한다.
 */
export function PermissionFallback({ variant }: Props) {
  const isLoading = variant === 'loading';
  const pathname = usePathname() ?? '';
  const surfaceCopy = resolveSurfaceCopy(pathname, variant);
  const action = VARIANT_ACTIONS[variant];
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const accountId = normalizeAccountId(searchParams.get(ACCOUNT_QUERY_KEY));
  const currentPath = `${pathname}${search ? `?${search}` : ''}`;
  const primaryHref = action.primaryHref
    ? buildGuardLoginHref({ accountId, currentPath })
    : '';
  const homeHref = buildGuardHomeHref(accountId);

  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center px-6 py-12"
    >
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-7 text-center shadow-[0_24px_48px_rgba(0,0,0,0.24)]">
        {surfaceCopy.eyebrow && (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
            {surfaceCopy.eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {surfaceCopy.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
          {surfaceCopy.body}
        </p>
        {!isLoading && (
          <div className="mt-6 flex flex-col items-stretch gap-2">
            <Link
              href={primaryHref}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[color:var(--color-indigo-brand)] px-4 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-opacity hover:opacity-90"
            >
              {action.primaryLabel}
            </Link>
            {action.showSecondary && (
              <Link
                href={homeHref}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[color:var(--color-divider)] px-4 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                공개 홈으로 돌아가기
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

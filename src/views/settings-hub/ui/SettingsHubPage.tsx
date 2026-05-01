'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Compass,
  Database,
  Layers,
  Network,
  Tag,
} from 'lucide-react';
import { PermissionGate } from '@/features/permissions';
import {
  ACCOUNT_QUERY_KEY,
} from '@/shared/lib/account-scope';
import { OperationsNav } from '@/widgets/operations-nav';

/**
 * 정리 surface 의 hub. iOS Settings 결의 grouped list — 각 행이 sub-page
 * 로 drill-in. 모바일에서는 BottomTabBar "정리" 탭의 정착지이고, 데스크톱
 * 에서는 OperationsNav 가 같은 destination 을 더 빠르게 보여주지만 같은
 * hub 페이지 자체도 valid 한 entry point.
 *
 * 그룹은 사용자 멘탈 모델로 묶었다:
 *  - "지도 정비" : 카테고리 · 상태 · 가져오기 (지도 콘텐츠 자체를 다룸)
 *  - "오늘 점검" : 오늘 챙길 곳 · 마이그레이션 (운영 진단)
 */
interface HubItem {
  label: string;
  helper: string;
  href: string;
  icon: typeof Layers;
}

interface HubGroup {
  title: string;
  items: ReadonlyArray<HubItem>;
}

function SettingsHubContent() {
  const searchParams = useSearchParams();
  const accountId = null;

  const groups: ReadonlyArray<HubGroup> = [
    {
      title: '지도 정비',
      items: [
        {
          label: '카테고리',
          helper: '지도 위 클러스터의 라벨·배치·크기',
          href: '/settings/categories/',
          icon: Layers,
        },
        {
          label: '상태',
          helper: '프로젝트 상태 라벨과 dot 색',
          href: '/settings/statuses/',
          icon: Tag,
        },
        {
          label: '프로젝트 가져오기',
          helper: '샘플로 시작하거나 CSV 로 한 번에 올리기',
          href: '/settings/import/',
          icon: Database,
        },
        {
          label: '온톨로지 schema',
          helper: '활성 TBox 클래스·관계 보기 (곧 직접 추가 가능)',
          href: '/settings/ontology/',
          icon: Network,
        },
      ],
    },
    {
      title: '오늘 점검',
      items: [
        {
          label: '오늘 챙길 곳',
          helper: '오래된 · 외톨이 · 허브 후보',
          href: '/diagnostics/insights/',
          icon: Compass,
        },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">정리</h1>
      <OperationsNav />

      <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-10 md:py-10">
        <header>
          <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
            정리
          </h1>
          <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
            지도 콘텐츠 정비 · 외부 연결 · 오늘 점검을 한곳에 모았어요.
          </p>
        </header>

        <div className="mt-6 flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="break-keep px-1 text-[12px] text-[color:var(--color-text-quaternary)]">
                {group.title}
              </h2>
              <ul className="mt-2 overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                {group.items.map((item, index) => {
                  const Icon = item.icon;
                  const isLast = index === group.items.length - 1;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[color:var(--color-overlay-1)] active:bg-[color:var(--color-overlay-2)] ${
                          isLast ? '' : 'border-b border-[color:var(--color-overlay-2)]'
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:rgba(94,106,210,0.1)] text-[color:var(--color-indigo-accent)]">
                          <Icon size={18} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="break-keep text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                            {item.label}
                          </p>
                          <p className="mt-0.5 break-keep text-[12.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                            {item.helper}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          aria-hidden
                          className="shrink-0 text-[color:var(--color-text-quaternary)]"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

export function SettingsHubPage() {
  return (
    <PermissionGate>
      <SettingsHubContent />
    </PermissionGate>
  );
}

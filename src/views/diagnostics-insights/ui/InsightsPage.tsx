"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, MapPin } from "lucide-react";
import { PermissionGate } from "@/features/permissions";
import {
  detectOrphanProjects,
  detectPromotionCandidates,
  detectStaleProjects,
  getProjectDetailHref,
  subscribeProjects,
  type Project,
  type PromotionCandidate,
} from "@/entities/project";
import { DetailCard, EmptyState } from "@/shared/ui";
import { formatDate } from "@/shared/lib/format-date";
import {
  ACCOUNT_QUERY_KEY,
} from "@/shared/lib/account-scope";
import { OperationsNav } from "@/widgets/operations-nav";
import { cn } from "@/shared/lib/cn";

const STALE_DAYS_THRESHOLD = 30;
const STALE_LIMIT = 10;
const ORPHAN_LIMIT = 10;
const PROMOTION_MIN_FAN_IN = 4;
const PROMOTION_LIMIT = 10;

function buildProjectEditHref(
  slug: string,
  accountId: string | null,
): string {
  const params = new URLSearchParams();
  if (accountId) {
    params.set(ACCOUNT_QUERY_KEY, accountId);
  }
  const query = params.toString();
  return `/project/${encodeURIComponent(slug)}/edit/${query ? `?${query}` : ""}`;
}

function buildTopologyFocusHref(slug: string, accountId: string | null): string {
  // 홈 토폴로지에서 이 슬러그를 선택 상태로 진입. ?p= 계약을 그대로 쓴다.
  const params = new URLSearchParams();
  params.set("p", slug);
  if (accountId) {
    params.set(ACCOUNT_QUERY_KEY, accountId);
  }
  return `/?${params.toString()}`;
}

function InsightsContent() {
  const searchParams = useSearchParams();
  const accountId = null;
  // ?account= 가 비었으면 인증 사용자의 owned membership 첫 번째로 자동 보강.
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeProjects(
      accountId,
      (latest) => {
        setProjects(latest);
        setError(null);
        setLoaded(true);
      },
      (err) => {
        setError(err.message);
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [accountId]);

  // 모든 셋의 기준 시각은 한 번 고정해 렌더 중 드리프트 방지. projects 가 갱신될
  // 때마다 지금 기준으로 다시 계산 — 실시간 구독이 수정시각을 밀어도 반영됨.
  const { stale, orphans, promotions } = useMemo(() => {
    const now = new Date();
    return {
      stale: detectStaleProjects(projects, {
        now,
        daysThreshold: STALE_DAYS_THRESHOLD,
        limit: STALE_LIMIT,
      }),
      orphans: detectOrphanProjects(projects).slice(0, ORPHAN_LIMIT),
      promotions: detectPromotionCandidates(projects, {
        minFanIn: PROMOTION_MIN_FAN_IN,
        limit: PROMOTION_LIMIT,
      }),
    };
  }, [projects]);

  const everythingHealthy =
    loaded &&
    !error &&
    stale.length === 0 &&
    orphans.length === 0 &&
    promotions.length === 0;

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">오늘 챙길 곳</h1>
      <OperationsNav />
      <div className="mx-auto max-w-5xl px-5 py-6 md:px-12 md:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
            오늘 챙길 곳
          </h1>
          <p className="max-w-2xl text-sm text-[color:var(--color-text-tertiary)]">
            오늘 먼저 손을 대야 할 프로젝트 세 가지. 오래 안 건드린 것,
            연결이 하나도 없는 것, 허브로 올리면 좋을 것을 한 화면에 모았어요.
          </p>
          {/* 요약 카운트 — 스크롤 안 해도 한눈에 수리 부담 총량 파악. */}
          {loaded && !error ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <SummaryBadge label="오래된" count={stale.length} />
              <SummaryBadge label="외톨이" count={orphans.length} />
              <SummaryBadge label="허브 후보" count={promotions.length} />
            </div>
          ) : null}
          {accountId ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              Scope · {accountId}
            </p>
          ) : null}
        </header>

        {error ? (
          <p className="mt-8 rounded-lg border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] px-4 py-3 text-sm text-[color:var(--color-status-warning)]">
            프로젝트를 불러오지 못했습니다 — {error}
          </p>
        ) : null}

        {!loaded ? (
          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            불러오는 중…
          </p>
        ) : null}

        {loaded && !error && everythingHealthy ? (
          <div className="mt-8">
            <EmptyState
              title="오늘은 챙길 게 없어요"
              description={`최근 ${STALE_DAYS_THRESHOLD}일 내 모두 업데이트됐고, 외톨이도 허브 후보도 없습니다.`}
            />
          </div>
        ) : null}

        {loaded && !error && !everythingHealthy ? (
          <div className="mt-8 flex flex-col gap-6">
            <StaleSection
              items={stale}
              accountId={accountId}
              daysThreshold={STALE_DAYS_THRESHOLD}
              now={new Date()}
            />
            <OrphanSection items={orphans} accountId={accountId} />
            <PromotionSection items={promotions} accountId={accountId} />
          </div>
        ) : null}

      </div>
    </main>
  );
}

function SummaryBadge({ label, count }: { label: string; count: number }) {
  // count=0 이면 "수리 대기 없음" 신호로 quaternary 톤, 아니면 인디고.
  const zero = count === 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        zero
          ? "border-[color:var(--color-border-soft)] bg-transparent text-[color:var(--color-text-quaternary)]"
          : "border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(94,106,210,0.08)] text-[color:var(--color-indigo-accent)]"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

function daysSince(updatedAt: Date, now: Date): number {
  const ms = now.getTime() - updatedAt.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function StaleSection({
  items,
  accountId,
  daysThreshold,
  now,
}: {
  items: Project[];
  accountId: string | null;
  daysThreshold: number;
  now: Date;
}) {
  return (
    <DetailCard
      eyebrow="오래된"
      title="업데이트 정체"
      description={`최근 ${daysThreshold}일 이상 수정이 없는 프로젝트입니다. 가장 오래된 것부터.`}
    >
      {items.length === 0 ? (
        <EmptyState
          size="compact"
          title="정체된 프로젝트가 없습니다"
          description={`전부 ${daysThreshold}일 내에 한 번 이상 갱신됐습니다.`}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--color-border-soft)]">
          {items.map((project) => (
            <li
              key={project.slug}
              className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[color:var(--color-text-primary)]">
                  {project.name}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {project.slug}
                  <span className="ml-2 text-[color:var(--color-text-tertiary)]">
                    · {daysSince(project.updatedAt, now)}일 전 ({formatDate(project.updatedAt)})
                  </span>
                </p>
              </div>
              <ItemActions
                editHref={buildProjectEditHref(project.slug, accountId)}
                detailHref={getProjectDetailHref(project.slug, accountId)}
                topologyHref={buildTopologyFocusHref(project.slug, accountId)}
              />
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function OrphanSection({
  items,
  accountId,
}: {
  items: Project[];
  accountId: string | null;
}) {
  return (
    <DetailCard
      eyebrow="외톨이"
      title="외톨이 프로젝트"
      description="아무도 부르지 않고, 아무도 보지 않는 프로젝트입니다. 연결을 더하거나 정리할지 정해 보세요."
    >
      {items.length === 0 ? (
        <EmptyState
          size="compact"
          title="외톨이가 없어요"
          description="모든 프로젝트가 어디선가 부르거나 어딘가를 부르고 있습니다."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--color-border-soft)]">
          {items.map((project) => (
            <li
              key={project.slug}
              className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[color:var(--color-text-primary)]">
                  {project.name}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {project.slug}
                </p>
              </div>
              <ItemActions
                editHref={buildProjectEditHref(project.slug, accountId)}
                detailHref={getProjectDetailHref(project.slug, accountId)}
                topologyHref={buildTopologyFocusHref(project.slug, accountId)}
              />
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function PromotionSection({
  items,
  accountId,
}: {
  items: PromotionCandidate[];
  accountId: string | null;
}) {
  return (
    <DetailCard
      eyebrow="허브 후보"
      title="허브로 올릴 곳"
      description={`허브 표시는 안 됐지만 ${PROMOTION_MIN_FAN_IN}개 이상이 이 프로젝트를 부르고 있어요. 허브로 올리면 지도에서 정거장 역할이 분명해집니다.`}
    >
      {items.length === 0 ? (
        <EmptyState
          size="compact"
          title="승격 후보가 없습니다"
          description={`현재 비허브 프로젝트 중 fan-in ≥ ${PROMOTION_MIN_FAN_IN} 인 경우가 없습니다.`}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--color-border-soft)]">
          {items.map((project) => (
            <li
              key={project.slug}
              className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[color:var(--color-text-primary)]">
                  {project.name}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {project.slug}
                  <span className="ml-2 text-[color:var(--color-indigo-accent)]">
                    · fan-in {project.fanIn}
                  </span>
                </p>
              </div>
              <ItemActions
                editHref={buildProjectEditHref(project.slug, accountId)}
                detailHref={getProjectDetailHref(project.slug, accountId)}
                topologyHref={buildTopologyFocusHref(project.slug, accountId)}
              />
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function ItemActions({
  editHref,
  detailHref,
  topologyHref,
}: {
  editHref: string;
  detailHref: string;
  topologyHref: string;
}) {
  // 모바일은 h-9 rounded-full pill (44pt 가까운 터치 타깃 + 가시성),
  // md+ 는 text-only 작은 링크 (행 안 정보 노출 우선). 한글 라벨은
  // 어절 단위 보존을 위해 break-keep.
  const linkClass =
    "inline-flex items-center gap-1 break-keep rounded-full border border-[color:var(--color-border-soft)] px-3 h-9 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] md:h-auto md:rounded-none md:border-0 md:px-0 md:font-mono md:text-[10px] md:uppercase md:tracking-[0.14em] md:text-[color:var(--color-text-tertiary)]";
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 md:gap-3">
      <Link href={editHref} className={cn(linkClass)}>
        편집
        <ArrowUpRight size={12} />
      </Link>
      <Link
        href={detailHref}
        target="_blank"
        rel="noreferrer"
        className={cn(linkClass)}
      >
        상세
        <ArrowUpRight size={12} />
      </Link>
      <Link href={topologyHref} className={cn(linkClass)}>
        <MapPin size={11} />
        지도
      </Link>
    </div>
  );
}

export function InsightsPage() {
  return (
    <PermissionGate>
      <InsightsContent />
    </PermissionGate>
  );
}

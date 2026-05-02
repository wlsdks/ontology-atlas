"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, FilePlus2, Info, Network, RefreshCcw } from "lucide-react";
import { PermissionGate, useGlobalAdmin } from "@/features/permissions";
import {
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentKindLabel,
  getKnowledgeDocumentListHref,
  getKnowledgeDocumentNewHref,
  getKnowledgeDocumentStatusLabel,
  type KnowledgeDocument,
} from "@/entities/knowledge-document";
import type { KnowledgePublicMeta } from "@/entities/knowledge-graph";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Tooltip } from "@/shared/ui";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { DashboardOntologySummary } from "@/widgets/dashboard-ontology-summary";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { formatDate } from "@/shared/lib/format-date";

function DashboardContent() {
  const { user } = useGlobalAdmin();
  const searchParams = useSearchParams();
  const accountId = null;
  const dataSourceMode = useDataSourceMode();
  const localVault = useLocalVault();
  // ?account= 가 비었으면 인증 사용자의 owned membership 첫 번째로 자동 보강.
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [publicMeta, setPublicMeta] = useState<KnowledgePublicMeta | null>(null);
  // audit A3 — 첫 subscribe 콜백 도달 전엔 빈 배열이 default 라 "첫 문서부터" 카드가
  // 잠깐 떠올랐다가 실제 데이터로 교체되는 깜빡임. loaded 가드로 첫 로드 전엔
  // skeleton 노출.
  const [documentsLoaded, setDocumentsLoaded] = useState(false);

  useEffect(() => {
    setDocumentsLoaded(false);
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("@/entities/knowledge-document/api").then(({ subscribeKnowledgeDocuments }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgeDocuments(accountId, (next) => {
        setDocuments(next);
        setDocumentsLoaded(true);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("@/entities/knowledge-graph/api").then(({ subscribeKnowledgePublicMeta }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgePublicMeta(accountId, setPublicMeta);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId]);

  // mission v2 정렬: cloud LLM 추출 워커 폐기 → `latestJobStatus` 가 항상
  // undefined. `failed` / `pending` 분기 제거. 사용자는 vault frontmatter
  // 또는 빌더에서 ontology 를 직접 작성한다.
  const summary = useMemo(() => {
    return {
      total: documents.length,
      recent: documents.slice(0, 3),
    };
  }, [documents]);

  const focusAction = useMemo(() => {
    // 문서 0 인데 publicMeta 가 살아 있으면 (예: 외부 발행) 단순 onboarding
    // empty state 가 아니라 "이미 발행된 그래프 사용 가능 + 더 추가하려면"
    // 메시지로. 발행 상태 카드가 같은 페이지에 같이 떠 사용자 혼란을 주던 문제.
    if (summary.total === 0 && publicMeta) {
      return {
        eyebrow: "공개 그래프 살아 있어요",
        title: "원본 문서를 추가로 올려 두세요",
        description:
          "이미 공개된 ontology 가 있지만 raw 문서가 비어 있어요. md 를 한 장 올려 두세요.",
        href: getKnowledgeDocumentNewHref(accountId),
        cta: "새 문서 올리기",
      };
    }

    return {
      eyebrow: "첫 문서부터",
      title: "첫 md 문서를 올려 보세요",
      description:
        "오늘은 기다리는 문서가 없어요. md 한 장을 올리고 vault frontmatter 또는 빌더에서 ontology 노드를 직접 만드세요.",
      href: getKnowledgeDocumentNewHref(accountId),
      cta: "첫 문서 올리기",
    };
  }, [accountId, summary.total, publicMeta]);

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">문서</h1>
      <OperationsNav />
      {/* ⌘K 글로벌 검색 — 대시보드에서도 ontology · 문서 빠르게 점프. */}
      <MountedGlobalSearch accountId={accountId} returnTo="/knowledge/" />
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-12 md:py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-4xl">
              문서
            </h1>
            <p className="mt-2 text-xs text-[color:var(--color-text-tertiary)] md:text-sm">
              {user?.email}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-text-secondary)]">
              cloud 모드 문서 surface — 마크다운 등록 + 프로젝트 연결. 로컬 vault 우선이라면 /docs 에서 폴더 선택.
            </p>
          </div>
        </header>

        {dataSourceMode === "local" && localVault.manifest ? (
          <section
            aria-labelledby="vault-summary-heading"
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.06)] px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
                Local vault
              </span>
              <h2
                id="vault-summary-heading"
                className="text-[13px] text-[color:var(--color-text-primary)]"
              >
                {localVault.handle?.name ?? "vault"}
              </h2>
            </div>
            <span className="font-mono text-[11px] tracking-[0.06em] text-[color:var(--color-text-tertiary)]">
              {localVault.manifest.docs.length} md
              {localVault.lastLoadedAt ? (
                <>
                  {" · "}
                  방금 스캔
                </>
              ) : null}
            </span>
            <Link
              href="/docs/"
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
            >
              vault 열기
              <ArrowRight size={11} aria-hidden />
            </Link>
          </section>
        ) : null}

        <section className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          {!documentsLoaded ? (
            <div
              role="status"
              aria-label="문서 불러오는 중"
              className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-6"
            >
              <div className="h-3 w-24 rounded-full bg-[color:var(--color-divider)]" />
              <div className="h-6 w-2/3 rounded-md bg-[color:var(--color-border-soft)]" />
              <div className="h-4 w-full rounded-md bg-[color:var(--color-overlay-2)]" />
              <div className="h-9 w-40 rounded-full bg-[color:rgba(94,106,210,0.10)]" />
            </div>
          ) : (
          <ActionCard
            eyebrow={focusAction.eyebrow}
            title={focusAction.title}
            description={focusAction.description}
            href={focusAction.href}
            cta={focusAction.cta}
            stats={[
              { label: "전체 문서", value: `${summary.total}` },
            ]}
          />
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <SummaryCard
              icon={<FilePlus2 size={16} />}
              eyebrow="새 문서"
              title="문서 올리기"
              description="문서 상단 메타가 겹치는지 확인하고 첫 버전을 올립니다."
              href={getKnowledgeDocumentNewHref(accountId)}
              cta="올리기 화면 열기"
            />
            <SummaryCard
              icon={<RefreshCcw size={16} />}
              eyebrow="문서 목록"
              title={`${summary.total}개 문서`}
              description="최근에 올린 문서와 현재 기준 버전을 살펴봅니다."
              href={getKnowledgeDocumentListHref(accountId)}
              cta="문서 목록 열기"
            />
            {/* 온톨로지 surface — knowledge 의 두 번째 척추. mission v2 에서
                vault frontmatter / 빌더가 진실원, 검수 단계 없음. */}
            <SummaryCard
              icon={<Network size={16} />}
              eyebrow="온톨로지"
              title="ontology 그래프 트리"
              description="vault frontmatter 가 키워낸 노드·관계를 계층 트리로 봐요."
              href={"/ontology/"}
              cta="온톨로지 열기"
            />
          </div>
        </section>

        {/* 공개 반영 요약 — 마지막 publish 시각 + 반영 상태 + review workspace
            로의 CTA. meta null 이면 "아직 공개 반영 안 됨" 가이드. publishId 는
            admin 디버그용으로 mono 표기. */}
        <section className="mt-10">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                공개 그래프 발행 현황
                <Tooltip
                  content={
                    <div className="max-w-[260px] text-left">
                      <p className="font-medium">
                        공개 = 비-로그인 방문자에게 보이는 화면
                      </p>
                      <p className="mt-1 text-[color:var(--color-text-tertiary)]">
                        vault frontmatter / 빌더에서 만든 노드·관계를 외부 방문자도 볼 수 있게 발행한 결과예요. 발행하면 토폴로지와 프로젝트 상세에 나타납니다.
                      </p>
                    </div>
                  }
                  withProvider={false}
                >
                  <button
                    type="button"
                    aria-label="공개 화면이 무엇인지 설명"
                    className="inline-flex items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  >
                    <Info size={14} aria-hidden />
                  </button>
                </Tooltip>
              </CardTitle>
              <CardDescription>
                {publicMeta
                  ? "지금 비-로그인 방문자가 보는 화면에 노출된 결과예요. 새 문서를 골라낸 뒤 '공개에 보이기'를 누르면 여기가 새로고침됩니다."
                  : "아직 비-로그인 방문자가 볼 수 있는 결과가 없어요. 문서 올리기 → 골라내기 → 공개에 보이기 순서로 이어가면 여기에 기록됩니다."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {publicMeta ? (
                <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      공개 시각
                    </dt>
                    <dd className="text-[color:var(--color-text-primary)]">
                      {formatDate(publicMeta.publishedAt)}
                    </dd>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      Projection
                    </dt>
                    <dd className="font-mono text-[12px] text-[color:var(--color-text-secondary)]">
                      {publicMeta.projectionVersion}
                    </dd>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      Publish ID
                    </dt>
                    <dd className="truncate font-mono text-[11px] tracking-[0.04em] text-[color:var(--color-text-tertiary)]">
                      {publicMeta.currentPublishId}
                    </dd>
                  </dl>
                  <Link href="/docs/" className="inline-flex">
                    <Button type="button" variant="outline" size="sm">
                      vault 열기
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-[color:var(--color-text-tertiary)]">
                    공개에 보이기까지 두 단계: (1) 문서 올리기 → (2) 공개에 보이기. ontology 노드는 vault frontmatter 또는 빌더에서 직접 추가.
                  </p>
                  <Link
                    href={getKnowledgeDocumentNewHref(accountId)}
                    className="inline-flex"
                  >
                    <Button type="button" size="sm">
                      첫 문서 올리기
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>최근 업로드</CardTitle>
              <CardDescription>
                최신 문서 3건을 기준으로 바로 상세 화면으로 이동할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.recent.length === 0 ? (
                <EmptyState
                  size="compact"
                  title="아직 올린 문서가 없어요"
                  description="첫 문서를 올려 시작하세요."
                />
              ) : (
                summary.recent.map((document) => (
                  <Link
                    key={document.id}
                    href={getKnowledgeDocumentDetailHref(document.id, accountId)}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3 transition-colors hover:border-[color:var(--color-border-strong)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {document.title}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                        {getKnowledgeDocumentKindLabel(document.kind)} · {getKnowledgeDocumentStatusLabel(document.status)} · {document.projectIds.join(", ") || "프로젝트 미연결"} · 업데이트 {formatDate(document.updatedAt)}
                      </p>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>지금 쓸 수 있는 것</CardTitle>
              <CardDescription>
                지금 바로 쓸 수 있는 기능만 보여줍니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[color:var(--color-text-secondary)]">
              <p>지금 가능: 문서 올리기, 버전 업로드, 기준 버전 지정, 분석 상태 보기, 문서 확인, 골라낸 그래프 저장, 공개 화면에 보이기</p>
              <p>다음 단계: 노드·연결 직접 편집, 공개 홈 ontology 전환, 근거 드릴다운 강화</p>
              <Link href={getKnowledgeDocumentListHref(accountId)} className="inline-flex">
                <Button variant="outline" size="sm" type="button">
                  문서 목록으로 이동
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>

        {/* ontology 요약 카드 — kind 분포 + 최근 활동 + 트리/인사이트 진입.
            매치 0 자동 숨김 (권한 없거나 빈 ontology). */}
        <DashboardOntologySummary accountId={accountId} />
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  eyebrow,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-indigo-accent)]">
          {icon}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {eyebrow}
        </p>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Link href={href} className="inline-flex">
          <Button size="sm" type="button">
            {cta}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  eyebrow,
  title,
  description,
  href,
  cta,
  stats,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {eyebrow}
        </p>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[18px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-border-soft)]">
          {stats.map((item) => (
            <div
              key={item.label}
              className="bg-[color:var(--color-overlay-1)] px-3 py-3 sm:px-4"
            >
              <p className="break-keep text-[11px] leading-tight text-[color:var(--color-text-quaternary)]">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <Link href={href} className="inline-flex">
          <Button size="sm" type="button">
            {cta}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export function KnowledgeDashboardPage() {
  return (
    <PermissionGate>
      <DashboardContent />
    </PermissionGate>
  );
}

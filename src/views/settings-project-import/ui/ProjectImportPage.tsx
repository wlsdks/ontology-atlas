"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { PermissionGate } from "@/features/permissions";
import {
  parseProjectsCsv,
  type CsvParseError,
} from "@/features/project-import";
import type { ProjectInput } from "@/entities/project";
import { getProject, upsertProject } from "@/entities/project/api";
import { STARTER_SAMPLE_PROJECTS } from "@/shared/config/starter-samples";
import { Button, DetailCard, EmptyState, useToast } from "@/shared/ui";
import {
  ACCOUNT_QUERY_KEY,
} from "@/shared/lib/account-scope";
import { OperationsNav } from "@/widgets/operations-nav";

const CSV_PLACEHOLDER = [
  "slug,name,category,status,description,dependencies,tags,isHub",
  "iam-hub,통합 인증 허브,in-progress,developing,인증 전담 허브,,Auth|Hub,true",
  "checkout,결제 서비스,in-progress,developing,결제 처리,iam-hub,Commerce,false",
].join("\n");

type ImportStatus = "idle" | "importing" | "done";

interface ImportOutcome {
  succeeded: string[];
  failed: Array<{ slug: string; message: string }>;
}

function ImportContent() {
  const searchParams = useSearchParams();
  const accountId = null;
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const { show: showToast } = useToast();

  const { valid, errors } = useMemo(() => {
    if (!csvText.trim()) {
      return { valid: [] as ProjectInput[], errors: [] as CsvParseError[] };
    }
    return parseProjectsCsv(csvText);
  }, [csvText]);

  const dashboardHref = "/projects/";
  const homeHref = "/";

  const writeProjects = async (projects: ProjectInput[]): Promise<ImportOutcome> => {
    const succeeded: string[] = [];
    const failed: Array<{ slug: string; message: string }> = [];
    for (const project of projects) {
      try {
        const input: ProjectInput = accountId
          ? { ...project, accountId }
          : project;
        const existing = await getProject(input.slug, input.accountId);
        if (existing) {
          throw new Error("이미 존재하는 slug입니다.");
        }
        await upsertProject(input);
        succeeded.push(project.slug);
      } catch (err) {
        failed.push({
          slug: project.slug,
          message: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      }
    }
    return { succeeded, failed };
  };

  const handleImportCsv = async () => {
    if (valid.length === 0 || status === "importing") return;
    setStatus("importing");
    const result = await writeProjects(valid);
    setOutcome(result);
    setStatus("done");
    if (result.succeeded.length > 0) {
      showToast(
        `${result.succeeded.length}개 추가${result.failed.length > 0 ? ` · ${result.failed.length}개 실패` : ""}`,
        result.failed.length > 0 ? "info" : "success",
      );
    } else if (result.failed.length > 0) {
      showToast(`${result.failed.length}개 모두 실패`, "error");
    }
  };

  const handleImportSample = async () => {
    if (status === "importing") return;
    setStatus("importing");
    const result = await writeProjects(STARTER_SAMPLE_PROJECTS);
    setOutcome(result);
    setStatus("done");
    if (result.succeeded.length > 0) {
      showToast(
        `샘플 ${result.succeeded.length}개 추가${result.failed.length > 0 ? ` · ${result.failed.length}개 실패` : ""}`,
        result.failed.length > 0 ? "info" : "success",
      );
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">프로젝트 가져오기</h1>
      <OperationsNav />
      <div className="mx-auto max-w-4xl px-5 py-6 md:px-12 md:py-10">
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          정리
        </Link>

        <header className="mt-8 flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-quaternary)]">
            설정 · 가져오기
          </p>
          <h1 className="text-2xl font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
            프로젝트 가져오기
          </h1>
          <p className="max-w-2xl text-sm text-[color:var(--color-text-tertiary)]">
            처음 시작하는 분은 샘플 5개를, 이미 목록이 있는 분은 CSV 를 붙여
            한 번에 올리세요. 중복 slug 는 건너뜁니다.
          </p>
          {accountId ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              Scope · {accountId}
            </p>
          ) : null}
        </header>

        <div className="mt-8 flex flex-col gap-6">
          <DetailCard
            eyebrow="Sample"
            title="샘플 5개로 시작"
            description="통합 인증 허브·API 게이트웨이·결제·카탈로그·알림. 의존 관계를 가진 작은 토폴로지를 즉시 채웁니다."
            headerAction={
              <Button
                data-testid="import-sample-button"
                type="button"
                size="sm"
                disabled={status === "importing"}
                onClick={() => void handleImportSample()}
              >
                {status === "importing" ? "가져오는 중…" : "샘플 가져오기"}
              </Button>
            }
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {STARTER_SAMPLE_PROJECTS.map((sample) => (
                <li
                  key={sample.slug}
                  className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2"
                >
                  <p className="truncate text-sm text-[color:var(--color-text-primary)]">
                    {sample.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {sample.slug}
                    {sample.isHub ? " · HUB" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </DetailCard>

          <DetailCard
            eyebrow="CSV"
            title="CSV 붙여넣기"
            description="헤더는 slug, name, category, status, description 필수. nameEn · detail · tags · stack · dependencies · owner · isHub 선택. tags / stack / dependencies 는 파이프(|) 로 여러 값을 구분합니다."
            headerAction={
              <Button
                data-testid="import-csv-button"
                type="button"
                size="sm"
                disabled={valid.length === 0 || status === "importing"}
                onClick={() => void handleImportCsv()}
              >
                <Upload size={14} className="mr-1" />
                {status === "importing"
                  ? "가져오는 중…"
                  : `CSV 가져오기 (${valid.length})`}
              </Button>
            }
          >
            <textarea
              data-testid="import-csv-textarea"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={CSV_PLACEHOLDER}
              rows={10}
              className="w-full rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-3 py-2 font-mono text-[12px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(139,151,255,0.5)] focus:outline-none"
              spellCheck={false}
            />

            {errors.length > 0 ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-4 flex flex-col gap-1 rounded-md border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] px-3 py-2.5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-status-warning)]">
                  파싱 문제 {errors.length}건
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-[color:var(--color-status-warning)]">
                  {errors.slice(0, 15).map((error, index) => (
                    <li key={`${error.line}-${index}`}>
                      <span className="font-mono text-[10px] text-[color:rgba(244,183,49,0.7)]">
                        line {error.line}
                      </span>{" "}
                      · {error.message}
                    </li>
                  ))}
                  {errors.length > 15 ? (
                    <li className="font-mono text-[10px] text-[color:rgba(244,183,49,0.7)]">
                      … 그 외 {errors.length - 15}건
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {valid.length > 0 ? (
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  미리보기 {valid.length}개
                </p>
                <ul className="mt-2 flex max-h-60 flex-col divide-y divide-[color:var(--color-border-soft)] overflow-y-auto rounded-md border border-[color:var(--color-border-soft)]">
                  {valid.map((project) => (
                    <li
                      key={project.slug}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[color:var(--color-text-primary)]">
                          {project.name}
                        </p>
                        <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          {project.slug}
                          {project.isHub ? " · HUB" : ""}
                          {project.dependencies && project.dependencies.length > 0
                            ? ` · deps ${project.dependencies.length}`
                            : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {csvText.trim() && valid.length === 0 && errors.length === 0 ? (
              <EmptyState
                size="compact"
                className="mt-4"
                title="파싱할 행이 없습니다"
                description="첫 줄은 헤더, 둘째 줄부터 데이터가 와야 합니다."
              />
            ) : null}
          </DetailCard>

          {outcome ? (
            <DetailCard eyebrow="Result" title="실행 결과">
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-[color:var(--color-text-primary)]">
                  추가 성공 {outcome.succeeded.length}개 · 실패 {outcome.failed.length}개
                </p>
                {outcome.failed.length > 0 ? (
                  <ul
                    role="alert"
                    aria-live="assertive"
                    className="flex flex-col gap-1 rounded-md border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] px-3 py-2"
                  >
                    {outcome.failed.map((fail) => (
                      <li
                        key={fail.slug}
                        className="text-[12px] text-[color:var(--color-status-warning)]"
                      >
                        <span className="font-mono text-[10px]">{fail.slug}</span> · {fail.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {outcome.succeeded.length > 0 ? (
                  <div className="mt-2 flex gap-3">
                    <Link href={homeHref} className="inline-flex">
                      <Button type="button" size="sm">
                        지도에서 보기
                      </Button>
                    </Link>
                    <Link href={dashboardHref} className="inline-flex">
                      <Button type="button" size="sm" variant="outline">
                        대시보드로
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </div>
            </DetailCard>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export function ProjectImportPage() {
  return (
    <PermissionGate>
      <ImportContent />
    </PermissionGate>
  );
}

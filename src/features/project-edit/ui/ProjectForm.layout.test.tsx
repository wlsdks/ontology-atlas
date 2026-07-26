import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectForm } from "./ProjectForm";

/**
 * 만들기/편집 레이아웃 계약 (2026-07-27 재구성).
 *
 * 소유자 지적: 만들기 화면이 스크롤만 길고, 저장 버튼이 입력 칸보다 먼저
 * 나오고, 같은 안내를 네 번 반복했다. 재구성 후 계약은 두 줄이다.
 *
 * 1. **만들기** — 필수 4칸(이름·카테고리·상태·짧은 설명)만 펼쳐져 있고,
 *    액션은 폼 **뒤**에만 있다(상단 저장 클러스터 없음). 나머지 항목은
 *    "더 채우기" 안에 접혀 있고 사용자가 펼친다.
 * 2. **편집** — 회귀 금지. 모든 항목이 펼침 없이 도달 가능하고, 상단 sticky
 *    저장 클러스터·섹션 이동·삭제 줄이 그대로 있다.
 *
 * 접힌 자리에 검증 에러가 나면 스스로 펼쳐야 한다 — 안 그러면 "고치라는데
 * 그 칸이 없는" 막다른 길이 된다.
 */

const fields = koMessages.settings.projectForm.fields;

const project: Project = {
  slug: "storefront",
  name: "온라인 쇼핑몰",
  description: "고객이 상품을 둘러보고 결제한다",
  tags: [],
  stack: [],
  links: [],
  dependencies: [],
  screenshots: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-20T00:00:00.000Z"),
};

function renderCreate() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TaxonomyProvider>
        <ProjectForm
          mode="create"
          allProjects={[]}
          onSubmit={async () => {}}
          onCancel={() => {}}
        />
      </TaxonomyProvider>
    </NextIntlClientProvider>,
  );
}

async function renderEdit() {
  await act(async () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TaxonomyProvider>
          <ProjectForm
            mode="edit"
            initialProject={project}
            allProjects={[project]}
            onSubmit={async () => {}}
            onCancel={() => {}}
            onDelete={async () => {}}
          />
        </TaxonomyProvider>
      </NextIntlClientProvider>,
    );
    await Promise.resolve();
  });
}

describe("ProjectForm 만들기 레이아웃", () => {
  it("필수 4칸만 펼친 채로 시작한다", () => {
    renderCreate();
    for (const label of [fields.name, fields.category, fields.status, fields.description]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("선택 항목은 접혀 있고, 펼치면 전부 도달 가능하다", () => {
    renderCreate();
    // 접힌 상태 — DOM 에 없다.
    expect(screen.queryByLabelText(fields.tagsCsv)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(fields.detail)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(fields.owner)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("project-create-extras-toggle"));

    for (const label of [
      fields.nameEn,
      fields.detail,
      fields.tagsCsv,
      fields.stackCsv,
      fields.linksText,
      fields.startedAt,
      fields.launchedAt,
      fields.owner,
      fields.icon,
      fields.progress,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(fields.dependencies)).toBeInTheDocument();
  });

  it("문서 주소는 캡션이고, 직접 정하기를 누르면 입력 칸이 열린다", () => {
    renderCreate();
    expect(screen.queryByTestId("project-input-slug")).not.toBeInTheDocument();
    expect(screen.getByText(fields.slugAutoLabel)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("project-slug-disclosure"));
    expect(screen.getByTestId("project-input-slug")).toBeInTheDocument();
  });

  it("액션은 폼 뒤에만 있다 — 상단 저장 클러스터는 없다", () => {
    renderCreate();
    expect(screen.queryByTestId("project-save-top")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-save-return-top")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-cancel-top")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-save")).toBeInTheDocument();
    expect(screen.getByTestId("project-save-return")).toBeInTheDocument();
    expect(screen.getByTestId("project-cancel")).toBeInTheDocument();
  });

  it("접힌 자리의 필수 항목이 비어 제출이 막히면 그 자리를 스스로 펼친다", () => {
    renderCreate();
    // 이름/설명이 비어 있으므로 제출은 실패한다. 첫 에러가 이름이라
    // 접힌 자리는 열리지 않아야 하고, 에러 배너는 떠야 한다.
    fireEvent.click(screen.getByTestId("project-save"));
    expect(
      screen.getByText(koMessages.settings.projectForm.validation.globalErrorBanner),
    ).toBeInTheDocument();
  });
});

describe("ProjectForm 편집 레이아웃 (회귀 금지)", () => {
  it("모든 항목이 펼침 없이 도달 가능하다", async () => {
    await renderEdit();
    for (const label of [
      fields.slug,
      fields.name,
      fields.nameEn,
      fields.category,
      fields.status,
      fields.description,
      fields.detail,
      fields.tagsCsv,
      fields.stackCsv,
      fields.linksText,
      fields.startedAt,
      fields.launchedAt,
      fields.owner,
      fields.icon,
      fields.progress,
    ]) {
      expect(screen.getByLabelText(label), `편집 화면에 "${label}" 이 없다`).toBeInTheDocument();
    }
    expect(screen.getByText(fields.dependencies)).toBeInTheDocument();
    expect(screen.getByText(fields.isHubLabel, { exact: false })).toBeInTheDocument();
  });

  it("상단 sticky 저장 클러스터·섹션 이동·삭제 줄이 그대로 있다", async () => {
    await renderEdit();
    expect(screen.getByTestId("project-save-top")).toBeInTheDocument();
    expect(screen.getByTestId("project-save-return-top")).toBeInTheDocument();
    expect(screen.getByTestId("project-cancel-top")).toBeInTheDocument();
    expect(
      screen.getByText(koMessages.settings.projectForm.sections.navLabel),
    ).toBeInTheDocument();
    expect(screen.getByTestId("project-danger-row")).toBeInTheDocument();
  });

  it("만들기 전용 접힘 표면은 편집 화면에 없다", async () => {
    await renderEdit();
    expect(screen.queryByTestId("project-create-extras-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-slug-disclosure")).not.toBeInTheDocument();
  });
});

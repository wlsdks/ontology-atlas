import { describe, expect, it } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import { ProjectForm } from "./ProjectForm";

/**
 * 폼 라벨-입력 연결 회귀 가드 (#295).
 *
 * FieldRow 라벨이 `htmlFor` 로, 입력이 같은 `id` 로 연결돼야 접근성 트리에서
 * 입력의 accessible name 이 visible 라벨이 된다. #295 이전엔 태그/스택/링크
 * 필드가 연결이 없어 accessible name 이 placeholder 로 떨어졌고, 그 상태에선
 * `getByLabelText(라벨)` 이 입력을 찾지 못한다. 라벨 문자열은 메시지에서
 * 파생해 라벨 텍스트가 바뀌어도 가드가 따라가게 한다.
 */

const fields = koMessages.settings.projectForm.fields;

function renderForm() {
  return rtlRender(
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

describe("ProjectForm 라벨-입력 연결 (a11y, #295)", () => {
  // 기본 열린 섹션(기본정보 · 소개와 문서)의 필드만 — 접힌 섹션
  // (연결과 미디어 · 운영 정보) 은 DOM 에 없어 펼침 없이는 못 찾는다.
  it.each([
    fields.name,
    fields.description,
    fields.tagsCsv,
    fields.stackCsv,
    fields.linksText,
  ])("'%s' 라벨이 입력과 연결돼 있다", (label) => {
    renderForm();
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
});

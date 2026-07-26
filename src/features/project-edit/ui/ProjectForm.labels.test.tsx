import { describe, expect, it } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
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
  // 만들기 화면의 필수 4칸 — 펼침 없이 첫 화면에 있다.
  it.each([fields.name, fields.category, fields.status, fields.description])(
    "'%s' 라벨이 입력과 연결돼 있다",
    (label) => {
      renderForm();
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    },
  );

  // 나머지 항목은 2026-07-27 재구성에서 "더 채우기" 안으로 접혔다. 접힌 채로는
  // DOM 에 없으므로 펼친 뒤에 같은 연결을 확인한다 — 라벨-입력 연결이 접힘
  // 안에서 끊기면 접근성 트리에서 accessible name 이 placeholder 로 떨어진다.
  it.each([fields.nameEn, fields.tagsCsv, fields.stackCsv, fields.linksText, fields.owner])(
    "'%s' 라벨이 더 채우기를 펼친 뒤 입력과 연결돼 있다",
    (label) => {
      renderForm();
      fireEvent.click(screen.getByTestId("project-create-extras-toggle"));
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    },
  );
});

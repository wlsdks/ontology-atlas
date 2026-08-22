import { describe, expect, it } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import { ProjectForm } from "./ProjectForm";

/**
 * Regression guard for the label-to-input association.
 *
 * A FieldRow label must connect through `htmlFor` and the input through the matching `id`,
 * so that in the accessibility tree the input's accessible name is the visible label. Before
 * this was fixed, the tags, stack, and links fields had no association and their accessible
 * name fell back to the placeholder — in that state `getByLabelText(label)` cannot find the
 * input. The label strings are derived from the messages so the guard follows when the label
 * text changes.
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
  // The create screen's four required fields — present on the first screen without expanding.
  it.each([fields.name, fields.category, fields.status, fields.description])(
    "'%s' 라벨이 입력과 연결돼 있다",
    (label) => {
      renderForm();
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    },
  );

  // The rest folded into "add more" in the 2026-07-27 restructure. They are absent from the
  // DOM while collapsed, so the same association is checked after expanding — if it breaks
  // inside the collapse, the accessible name falls back to the placeholder.
  it.each([fields.nameEn, fields.tagsCsv, fields.stackCsv, fields.linksText, fields.owner])(
    "'%s' 라벨이 더 채우기를 펼친 뒤 입력과 연결돼 있다",
    (label) => {
      renderForm();
      fireEvent.click(screen.getByTestId("project-create-extras-toggle"));
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    },
  );
});

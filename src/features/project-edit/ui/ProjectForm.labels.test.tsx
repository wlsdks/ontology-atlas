import { describe, expect, it } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import { ProjectForm } from "./ProjectForm";

/** Each label names its input through `htmlFor`, or the accessible name falls back to the placeholder. */

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

describe("ProjectForm label-to-input association", () => {
  // The create screen's four required fields — present on the first screen without expanding.
  it.each([fields.name, fields.category, fields.status, fields.description])(
    "associates the '%s' label with its input",
    (label) => {
      renderForm();
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    },
  );

  // Folded fields are absent until "add more" expands them.
  it.each([fields.nameEn, fields.tagsCsv, fields.stackCsv, fields.linksText, fields.owner])(
    "associates the '%s' label with its input after expanding add more",
    (label) => {
      renderForm();
      fireEvent.click(screen.getByTestId("project-create-extras-toggle"));
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    },
  );
});

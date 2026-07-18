import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectForm } from "./ProjectForm";

/**
 * Edit-only danger row (#pages-projects-download-forms) — dashed border is
 * the category signal (design charter: category distinction is a border
 * style, not a color), matching docs/prototypes/project-forms-final.html.
 * Guards: only renders in edit mode with a delete handler, never in create
 * mode, and the underlying delete action (`onDelete`) stays wired.
 */

const project: Project = {
  slug: "ontology-atlas",
  name: "ontology-atlas",
  description: "Local-first ontology workbench",
  tags: [],
  stack: [],
  links: [],
  dependencies: [],
  screenshots: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-17T00:00:00.000Z"),
};

function renderForm(props: Partial<Parameters<typeof ProjectForm>[0]> = {}) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TaxonomyProvider>
        <ProjectForm
          mode="edit"
          initialProject={project}
          allProjects={[project]}
          onSubmit={async () => {}}
          onCancel={() => {}}
          onDelete={async () => {}}
          {...props}
        />
      </TaxonomyProvider>
    </NextIntlClientProvider>,
  );
}

describe("ProjectForm danger row", () => {
  it("renders a dashed danger row with the delete action in edit mode", () => {
    renderForm();
    const row = screen.getByTestId("project-danger-row");
    expect(row.className).toContain("border-dashed");
    expect(screen.getByText(koMessages.settings.projectForm.actions.deleteRowTitle)).toBeInTheDocument();
    expect(
      screen.getByText(koMessages.settings.projectForm.actions.deleteRowCaption),
    ).toBeInTheDocument();
  });

  it("omits the danger row when no onDelete handler is provided", () => {
    renderForm({ onDelete: undefined });
    expect(screen.queryByTestId("project-danger-row")).not.toBeInTheDocument();
  });

  it("omits the danger row in create mode", () => {
    rtlRender(
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
    expect(screen.queryByTestId("project-danger-row")).not.toBeInTheDocument();
  });

  it("calls the delete handler when the danger row's delete button is confirmed", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm({ onDelete });

    screen.getByTestId("project-delete").click();

    await vi.waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});

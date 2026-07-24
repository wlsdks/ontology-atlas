import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectForm } from "./ProjectForm";

const projectWithoutTaxonomy: Project = {
  slug: "project",
  name: "My project",
  description: "Description",
  tags: [],
  stack: [],
  links: [],
  dependencies: [],
  screenshots: [],
  createdAt: new Date("2026-07-25"),
  updatedAt: new Date("2026-07-25"),
};

describe("ProjectForm missing taxonomy preservation", () => {
  it("없는 category/status/position을 미지정으로 열고 다른 필드 저장에도 보존한다", async () => {
    const onSubmit = vi.fn(async () => {});
    await act(async () => {
      render(
        <NextIntlClientProvider locale="ko" messages={koMessages}>
          <TaxonomyProvider>
            <ProjectForm
              mode="edit"
              initialProject={projectWithoutTaxonomy}
              allProjects={[projectWithoutTaxonomy]}
              onSubmit={onSubmit}
              onCancel={() => {}}
            />
          </TaxonomyProvider>
        </NextIntlClientProvider>,
      );
      await Promise.resolve();
    });

    expect(
      screen.getByLabelText(koMessages.settings.projectForm.fields.category),
    ).toHaveDisplayValue(
      koMessages.settings.projectForm.fields.categoryUnspecified,
    );
    expect(
      screen.getByLabelText(koMessages.settings.projectForm.fields.status),
    ).toHaveDisplayValue(
      koMessages.settings.projectForm.fields.statusUnspecified,
    );
    expect(
      screen.queryByText(
        koMessages.settings.projectForm.fields.categoryMissingWarning,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        koMessages.settings.projectForm.fields.statusMissingWarning,
      ),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(koMessages.settings.projectForm.fields.owner),
      { target: { value: "UX audit owner" } },
    );
    fireEvent.click(screen.getByTestId("project-save-top"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "UX audit owner",
        category: undefined,
        status: undefined,
        position: undefined,
      }),
      { behavior: "stay" },
    );
  });
});

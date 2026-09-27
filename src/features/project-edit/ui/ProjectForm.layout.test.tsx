import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectForm } from "./ProjectForm";

/**
 * Create shows four required fields with actions after the form; edit keeps every field
 * reachable plus the sticky save cluster. An error in a folded section expands it.
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

describe("ProjectForm create layout", () => {
  it("starts with only the four required fields expanded", () => {
    renderCreate();
    for (const label of [fields.name, fields.category, fields.status, fields.description]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("folds optional fields and makes all of them reachable once expanded", () => {
    renderCreate();
    // Collapsed — not in the DOM.
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

  it("shows the slug as a caption and opens an input when set manually", () => {
    renderCreate();
    expect(screen.queryByTestId("project-input-slug")).not.toBeInTheDocument();
    expect(screen.getByText(fields.slugAutoLabel)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("project-slug-disclosure"));
    expect(screen.getByTestId("project-input-slug")).toBeInTheDocument();
  });

  it("places actions only after the form with no top save cluster", () => {
    renderCreate();
    expect(screen.queryByTestId("project-save-top")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-save-return-top")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-cancel-top")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-save")).toBeInTheDocument();
    expect(screen.getByTestId("project-save-return")).toBeInTheDocument();
    expect(screen.getByTestId("project-cancel")).toBeInTheDocument();
  });

  it("expands the folded section when an empty required field there blocks submit", () => {
    renderCreate();
    // The first error is the name, so the folded section stays closed.
    fireEvent.click(screen.getByTestId("project-save"));
    expect(
      screen.getByText(koMessages.settings.projectForm.validation.globalErrorBanner),
    ).toBeInTheDocument();
  });
});

describe("ProjectForm edit layout", () => {
  it("makes every field reachable without expanding", async () => {
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
      expect(screen.getByLabelText(label), `edit screen is missing "${label}"`).toBeInTheDocument();
    }
    expect(screen.getByText(fields.dependencies)).toBeInTheDocument();
    expect(screen.getByText(fields.isHubLabel, { exact: false })).toBeInTheDocument();
  });

  it("keeps the sticky save cluster, section navigation and delete row", async () => {
    await renderEdit();
    expect(screen.getByTestId("project-save-top")).toBeInTheDocument();
    expect(screen.getByTestId("project-save-return-top")).toBeInTheDocument();
    expect(screen.getByTestId("project-cancel-top")).toBeInTheDocument();
    expect(
      screen.getByText(koMessages.settings.projectForm.sections.navLabel),
    ).toBeInTheDocument();
    expect(screen.getByTestId("project-danger-row")).toBeInTheDocument();
  });

  it("omits the create-only folded surface on the edit screen", async () => {
    await renderEdit();
    expect(screen.queryByTestId("project-create-extras-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-slug-disclosure")).not.toBeInTheDocument();
  });
});

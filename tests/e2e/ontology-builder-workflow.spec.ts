import { expect, test } from "@playwright/test";

test.describe("ontology builder workflow", () => {
  test("restores a saved vault node from the builder node query", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("demo:builder-palette:collapsed:v1");
      window.localStorage.removeItem("demo:builder-inspector:collapsed:v1");
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/ontology/edit/?node=capabilities%2Ftopology-analysis-modes");

    await expect(
      page.getByRole("heading", { name: "Concept Save/edit" }),
    ).toBeAttached();
    await expect(page.getByText("0 draft changes · 0 links")).toBeVisible();
    const writeStatus = page.getByLabel("Save/edit status");
    await expect(writeStatus).toHaveCount(0);

    await expect(
      page.getByRole("dialog", { name: "Save/edit onboarding" }),
    ).toHaveCount(0);

    const inspector = page.getByLabel("Selected ontology node detail");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("sample (read-only) · Capability")).toBeVisible();
    await expect(inspector.getByLabel("Name")).toHaveValue(
      "Topology Analysis Modes",
    );
    await expect(inspector.getByText("capabilities/topology-analysis-modes")).toBeVisible();
    await page.getByRole("button", { name: "Close selected node details" }).click();
    await expect(inspector).toHaveCount(0);

    const writeStatusToggle = page.getByRole("button", { name: /Save status/ });
    await expect(writeStatusToggle).toHaveAttribute("aria-expanded", "false");
    await expect(writeStatusToggle).not.toContainText("Source");
    await expect(writeStatusToggle).not.toContainText("Draft");
    const layoutToggle = page.getByRole("button", { name: /^Layout$/ });
    await expect(layoutToggle).not.toContainText("Step layout");
    await expect(layoutToggle).not.toContainText("Relationship layout");
    await expect(page.getByRole("button", { name: "Re-arrange" })).toHaveCount(0);
    await layoutToggle.click();
    await expect(page.getByRole("radiogroup", { name: "Canvas arrangement mode" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Step layout/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: /Relationship layout/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto-arrange canvas nodes" })).toContainText(
      "Re-arrange",
    );
    await layoutToggle.click();
    await writeStatusToggle.click();
    await expect(writeStatusToggle).toHaveAttribute("aria-expanded", "true");
    await expect(writeStatus).toBeVisible();
    await expect(writeStatus).toContainText("Sample read-only");
    await expect(writeStatus).toContainText("New nodes and edges stay in memory");
    await expect(writeStatus).toContainText("no memory draft");
    await expect(writeStatus).toContainText("Preview before write");
    await expect(writeStatus).toContainText("node health pack");
    await expect(writeStatus).toContainText("relation_check");
    await expect(
      writeStatus.getByRole("link", { name: "Open node query" }),
    ).toHaveAttribute(
      "href",
      "/en/ontology/insights/?node=capabilities%2Ftopology-analysis-modes",
    );
  });

  test("does not mount the minimap on mobile before canvas measurements settle", async ({
    page,
  }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => {
      consoleMessages.push(message.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/edit/?node=capabilities%2Ftopology-analysis-modes");

    await expect(
      page.getByRole("heading", { name: "Concept Save/edit" }),
    ).toBeAttached();
    await page.waitForTimeout(250);

    expect(
      consoleMessages.filter((message) => message.includes("Received NaN")),
    ).toEqual([]);
  });
});

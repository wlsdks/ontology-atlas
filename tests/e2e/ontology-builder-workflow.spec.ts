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
      page.getByRole("heading", { name: "Ontology Builder" }),
    ).toBeVisible();
    const writeStatus = page.getByLabel("Builder write status");
    await expect(writeStatus).toContainText("Sample read-only");
    await expect(writeStatus).toContainText("Preview before write");
    await expect(writeStatus).toContainText("MCP/CLI handoff");
    await expect(writeStatus).toContainText("relation_check");
    await expect(
      writeStatus.getByRole("link", { name: "Open query cockpit" }),
    ).toHaveAttribute("href", "/en/ontology/insights/");

    const inspector = page.getByLabel("Selected ontology node detail");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("sample (read-only) · Capability")).toBeVisible();
    await expect(inspector.getByLabel("Name")).toHaveValue(
      "Topology Analysis Modes",
    );
    await expect(inspector.getByText("capabilities/topology-analysis-modes")).toBeVisible();
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
      page.getByRole("heading", { name: "Ontology Builder" }),
    ).toBeVisible();
    await page.waitForTimeout(250);

    expect(
      consoleMessages.filter((message) => message.includes("Received NaN")),
    ).toEqual([]);
  });
});

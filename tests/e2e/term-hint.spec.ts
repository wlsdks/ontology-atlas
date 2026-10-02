import { expect, test } from "@playwright/test";

import ko from "../../messages/ko.json";

test("the MCP hint on the Agents MCP tab shows both lines unclipped at 1040×720", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.goto("/ko/agents/?tab=mcp&guides=off");

  const trigger = page.getByTestId("term-hint-mcp");
  await expect(trigger).toBeVisible();
  await trigger.hover();

  const panel = page.getByTestId("term-hint-panel-mcp");
  await expect(panel).toBeVisible();
  const expansion = panel.getByText(ko.termHints.mcp.expansion, { exact: true });
  const explanation = panel.getByText(ko.termHints.mcp.explanation, { exact: true });
  await expect(expansion).toBeVisible();
  await expect(explanation).toBeVisible();

  const viewport = { width: 1040, height: 720 };
  for (const line of [expansion, explanation]) {
    const box = await line.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    const clipped = await line.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
    );
    expect(clipped).toBe(false);
  }
});

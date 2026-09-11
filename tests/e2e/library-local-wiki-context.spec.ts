import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import {
  installLocalCompileHarness,
  LOCAL_COMPILE_CORRECTION,
  LOCAL_COMPILE_EXISTING_WIKI,
  LOCAL_COMPILE_NOTE,
  LOCAL_COMPILE_RETAINED,
  LOCAL_COMPILE_RETAINED_PATH,
  LOCAL_COMPILE_SOURCE,
  LOCAL_COMPILE_SOURCE_PATH,
  LOCAL_COMPILE_WIKI_PATH,
  type LocalCompileHarness,
  type LocalCompileHarnessSnapshot,
} from "./library-local-compile-harness";

/** Parse only the OpenAI-shaped response fields the local adapter consumes. */
function proposalArgs(snapshot: LocalCompileHarnessSnapshot): Record<string, unknown> {
  const response = snapshot.responses.find((entry) => {
    if (!entry.body || typeof entry.body !== "object" || Array.isArray(entry.body)) return false;
    const choices = (entry.body as { choices?: unknown }).choices;
    const choice = Array.isArray(choices) ? choices[0] : null;
    const message =
      choice && typeof choice === "object" && !Array.isArray(choice)
        ? (choice as { message?: unknown }).message
        : null;
    const toolCalls =
      message && typeof message === "object" && !Array.isArray(message)
        ? (message as { tool_calls?: unknown }).tool_calls
        : null;
    return Array.isArray(toolCalls) && toolCalls.some((call) => {
      if (!call || typeof call !== "object" || Array.isArray(call)) return false;
      const fn = (call as { function?: unknown }).function;
      return Boolean(
        fn && typeof fn === "object" && !Array.isArray(fn) &&
          (fn as { name?: unknown }).name === "propose_wiki_page",
      );
    });
  })?.body;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("The local harness did not receive a proposal response.");
  }
  const choices = (response as { choices?: unknown }).choices;
  const choice = Array.isArray(choices) ? choices[0] : null;
  const message =
    choice && typeof choice === "object" && !Array.isArray(choice)
      ? (choice as { message?: unknown }).message
      : null;
  const toolCalls =
    message && typeof message === "object" && !Array.isArray(message)
      ? (message as { tool_calls?: unknown }).tool_calls
      : null;
  const toolCall = Array.isArray(toolCalls) ? toolCalls[0] : null;
  const fn =
    toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)
      ? (toolCall as { function?: unknown }).function
      : null;
  const rawArguments =
    fn && typeof fn === "object" && !Array.isArray(fn)
      ? (fn as { arguments?: unknown }).arguments
      : null;
  if (typeof rawArguments !== "string") {
    throw new Error("The local harness proposal response had no function arguments.");
  }
  return JSON.parse(rawArguments) as Record<string, unknown>;
}

function responseToolNames(snapshot: LocalCompileHarnessSnapshot): string[] {
  return snapshot.responses.flatMap((entry) => {
    const response = entry.body;
    if (!response || typeof response !== "object" || Array.isArray(response)) return [];
    const choices = (response as { choices?: unknown }).choices;
    const choice = Array.isArray(choices) ? choices[0] : null;
    const message =
      choice && typeof choice === "object" && !Array.isArray(choice)
        ? (choice as { message?: unknown }).message
        : null;
    const toolCalls =
      message && typeof message === "object" && !Array.isArray(message)
        ? (message as { tool_calls?: unknown }).tool_calls
        : null;
    if (!Array.isArray(toolCalls)) return [];
    return toolCalls.flatMap((call) => {
      if (!call || typeof call !== "object" || Array.isArray(call)) return [];
      const fn = (call as { function?: unknown }).function;
      if (!fn || typeof fn !== "object" || Array.isArray(fn)) return [];
      const name = (fn as { name?: unknown }).name;
      return typeof name === "string" ? [name] : [];
    });
  });
}

async function openLocalCompile(page: Page, selectPage = false, options: Parameters<typeof installLocalCompileHarness>[1] = {}): Promise<LocalCompileHarness> {
  await seedFirstRunSeen(page);
  const harness = await installLocalCompileHarness(page, options);
  await page.goto("/en/docs/?guides=off", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open my folder/i }).click();
  await expect(page.getByRole("heading", { name: "Map", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "Library" }).click();
  await expect(page.getByTestId("library-sources")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("library-index-segment-wiki").click();
  await expect(page.getByTestId("library-wiki")).toBeVisible({ timeout: 30_000 });
  /*
   * A retained question hides first-run guidance. Compile must still expose its review.
   *
   * ⚠️ **Read on the strip's door since 2026-09-12**: the home is the folder's graph and
   * the saved questions are a door on the row above it — at exactly one saved answer that
   * door *is* the question, which is what keeps reopening it one press. The region itself
   * lives inside the anchored surface behind it.
   */
  await expect(page.getByTestId('library-questions-open')).toBeVisible();
  if (selectPage) {
    await page.getByTestId('library-wiki').getByRole('button', { name: /^Records bulletin/ }).click();
    await expect(page.getByTestId('library-page')).toHaveAttribute('data-library-state', 'wiki');
  }
  await expect(page.getByTestId("library-compile")).toBeEnabled({ timeout: 30_000 });
  /*
   * ⚠️ **The brain picker moved with the press it belongs to** (2026-09-12). It used to
   * stand in step two of the always-drawn stage; the home is the picture now, so it is in
   * the Compile popover the strip's `Compile next: <file>` clause opens — one control per
   * setting per screen, beside the button that spends it. Escape leaves the walk on the
   * home, where it was.
   */
  if (options?.detectedRuntime) {
    await page.getByTestId('library-strip-compile').click();
    await expect(page.getByTestId('library-compile-brain')).toContainText('probe-model');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('library-compile-popover')).toHaveCount(0);
  }
  // This is the installed-shell local route; the web degradation copy must not be present.
  await expect(page.getByTestId("library-compile-web-limit")).toHaveCount(0);
  const endpoint = await page.evaluate(() => {
    const raw = window.localStorage.getItem("ontology-atlas:local-endpoint");
    return raw ? (JSON.parse(raw) as { baseUrl?: unknown; model?: unknown }) : null;
  });
  expect(endpoint).toEqual({ baseUrl: "http://127.0.0.1:11434/v1", model: "probe-model" });
  await page.getByTestId("library-compile").click();
  const checkpointDirectory = process.env.ATLAS_LOCAL_WIKI_EVIDENCE;
  if (checkpointDirectory) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(checkpointDirectory, { recursive: true });
    await page.screenshot({
      path: `${checkpointDirectory}/00-after-compile-click.png`,
      animations: "disabled",
    });
    writeFileSync(
      `${checkpointDirectory}/00-after-compile-click-ax.txt`,
      await page.locator("body").ariaSnapshot(),
    );
  }
  // The stubbed loopback responses are immediate, so React may commit the waiting card before
  // a browser frame paints the transient running state. The request trace is the stable proof
  // that the real local path started; the card assertion below proves its rendered end state.
  await expect
    .poll(async () => (await harness.snapshot(page)).requests.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  return harness;
}

async function captureEvidence(page: Page, name: string): Promise<void> {
  const card = page.getByTestId("library-local-compile-card");
  const version = card.getByTestId("library-local-compile-version");
  const allow = card.getByTestId("library-local-compile-allow");
  const preview = card.getByTestId("library-local-compile-preview");
  await card.scrollIntoViewIfNeeded();
  const scrollMetrics = await preview.evaluate((element) => {
    let scrollable: HTMLElement | null = element as HTMLElement;
    while (scrollable && scrollable.scrollHeight <= scrollable.clientHeight) {
      scrollable = scrollable.parentElement;
    }
    return scrollable
      ? { scrollHeight: scrollable.scrollHeight, clientHeight: scrollable.clientHeight }
      : { scrollHeight: 0, clientHeight: 0 };
  });
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  await preview.evaluate((element) => {
    let scrollable: HTMLElement | null = element as HTMLElement;
    while (scrollable && scrollable.scrollHeight <= scrollable.clientHeight) {
      scrollable = scrollable.parentElement;
    }
    if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
  });
  await allow.scrollIntoViewIfNeeded();
  await expect(version).toBeVisible();
  await expect(allow).toBeVisible();
  await expect(allow).toBeInViewport();
  await expect(version).toBeInViewport();
  await page.evaluate(() => document.fonts.ready);
  const proposed = version.getByRole("radio", { name: "Proposed page" });
  await proposed.evaluate((element) => element.focus({ preventScroll: true }));
  await expect(proposed).toBeFocused();
  const measure = () => page.evaluate(({ versionId, allowId }) => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const hit = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const centerInViewport = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight;
      const target = centerInViewport ? document.elementFromPoint(x, y) : null;
      return {
        x,
        y,
        centerInViewport,
        hitTestId: target?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
        inside: target ? element.contains(target) : false,
      };
    };
    const versionElement = document.querySelector(`[data-testid="${versionId}"]`);
    const allowElement = document.querySelector(`[data-testid="${allowId}"]`);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      version: rect(versionElement),
      allow: rect(allowElement),
      versionHit: hit(versionElement),
      allowHit: hit(allowElement),
      documentWidth: document.documentElement.scrollWidth,
    };
  }, { versionId: "library-local-compile-version", allowId: "library-local-compile-allow" });
  const geometry = await measure();
  expect(geometry.version?.width).toBeGreaterThan(0);
  expect(geometry.version?.height).toBeGreaterThan(0);
  expect(geometry.allow?.width).toBeGreaterThan(0);
  expect(geometry.allow?.height).toBeGreaterThan(0);
  expect(geometry.versionHit?.centerInViewport).toBe(true);
  expect(geometry.allowHit?.centerInViewport).toBe(true);
  expect(geometry.versionHit?.inside).toBe(true);
  expect(geometry.allowHit?.hitTestId).toBe("library-local-compile-allow");
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width);
  const directory = process.env.ATLAS_LOCAL_WIKI_EVIDENCE;
  if (!directory) return;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, animations: "disabled" });
  writeFileSync(`${directory}/${name}-ax.txt`, await page.locator("body").ariaSnapshot());
  writeFileSync(`${directory}/${name}-geometry.json`, `${JSON.stringify(geometry, null, 2)}\n`);
}

async function dumpTrace(snapshot: LocalCompileHarnessSnapshot, name: string): Promise<void> {
  const directory = process.env.ATLAS_LOCAL_WIKI_EVIDENCE;
  if (!directory) return;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/${name}-trace.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
}

test.describe("local Compile carries existing Wiki context safely", () => {
  for (const detectedRuntime of ['claude-acp', 'codex-acp'] as const) {
    test(`the local choice does not borrow the available ${detectedRuntime} writer or reader instructions`, async ({ page }) => {
      const harness = await openLocalCompile(page, false, { detectedRuntime, extraFiles: {
        'sources/00-scan.pdf': '%PDF-1.4 fixture',
        'sources/z-a.md': 'First extra source.',
        'sources/z-b.md': 'Second extra source.',
        'sources/z-c.md': 'Outside this bounded turn.',
      } });
      const snapshot = await harness.snapshot(page);
      const { messages } = JSON.parse(snapshot.requests[0]!.rawBody) as { messages: Array<{ role: string; content: string }> };
      const request = messages.find((message) => message.role === 'user')?.content ?? '';
      expect(request).toContain('model:probe-model');
      expect(request).not.toContain(`agent:${detectedRuntime}`);
      expect(request).toContain('read_source_text');
      expect(request).toContain('read_wiki_page');
      expect(request).toContain('propose_wiki_page');
      expect(request).not.toContain('sources/00-scan.pdf');
      expect(request).not.toContain('sources/z-c.md');
      expect(request).not.toContain('sources/z-a.md');
      expect(request).not.toContain('sources/z-b.md');
      expect(snapshot.calls.some((call) => call.method === 'acp_start')).toBe(false);
      expect(snapshot.writes).toEqual([]);
    });
  }

  test("reads the current Wiki, preserves an attributed note, and writes only after Allow once", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const harness = await openLocalCompile(page, true);

    await expect(page.getByTestId("library-local-compile-card")).toBeVisible({ timeout: 30_000 });
    const card = page.getByTestId("library-local-compile-card");
    const waiting = await harness.snapshot(page);
    await dumpTrace(waiting, "01-local-compile-consent");
    expect(waiting.files[LOCAL_COMPILE_WIKI_PATH]).toBe(LOCAL_COMPILE_EXISTING_WIKI);
    expect(waiting.writes).toEqual([]);
    expect(
      waiting.calls.filter(
        (call) => call.method === "write_vault_text_file" || call.method === "create_vault_text_file",
      ),
    ).toEqual([]);
    await expect(card.getByTestId("library-local-compile-row")).toHaveAttribute(
      "data-page-ok",
      "true",
    );
    await expect(card).toContainText(LOCAL_COMPILE_WIKI_PATH);
    await expect(card).toContainText("Replaces the page already there");

    const reviewToggle = card.getByTestId("library-local-compile-review-toggle");
    const preview = card.getByTestId("library-local-compile-preview");
    const version = card.getByTestId("library-local-compile-version");
    const previous = version.getByRole("radio", { name: "Previous page" });
    const proposed = version.getByRole("radio", { name: "Proposed page" });
    await expect(reviewToggle).toHaveAttribute("aria-expanded", "true");
    await expect(preview).toBeVisible();
    await expect(proposed).toBeChecked();
    const proposedText = await preview.textContent();
    expect(proposedText).toBeTruthy();
    await previous.click();
    await expect(previous).toBeChecked();
    expect(await preview.textContent()).toBe(LOCAL_COMPILE_EXISTING_WIKI);
    await proposed.click();
    await expect(proposed).toBeChecked();
    expect(await preview.textContent()).toBe(proposedText);

    for (const [name, viewport] of [
      ["desktop", { width: 1512, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await expect(preview).toBeVisible();
      await captureEvidence(page, `01-local-compile-consent-${name}`);
      await expect(proposed).toBeChecked();
      expect(await preview.textContent()).toBe(proposedText);
    }

    // The private correction exists only in the mounted Wiki fixture. It is absent from the
    // first two requests and appears only after the actual read_wiki_page result is carried.
    await expect
      .poll(async () => (await harness.snapshot(page)).requests.length, { timeout: 30_000 })
      .toBe(6);
    const trace = await harness.snapshot(page);
    const chatCalls = trace.calls.filter((call) => call.method === "llm_chat");
    expect(chatCalls).toHaveLength(6);
    for (const call of chatCalls) {
      expect(call.params).toMatchObject({
        provider: "local",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "probe-model",
      });
    }
    expect(responseToolNames(trace)).toEqual([
      "read_source_text",
      "read_wiki_page",
      "read_wiki_page",
      "read_wiki_page",
      "propose_wiki_page",
    ]);
    expect(trace.requests[0]?.rawBody).not.toContain(LOCAL_COMPILE_NOTE);
    expect(trace.requests[1]?.rawBody).not.toContain(LOCAL_COMPILE_NOTE);
    expect(trace.requests[2]?.rawBody).toContain(LOCAL_COMPILE_NOTE);
    expect(trace.requests[2]?.rawBody).toContain(LOCAL_COMPILE_WIKI_PATH);
    expect(trace.receipt).toBeTruthy();
    expect(trace.requests.some((request) => request.rawBody.includes(String(trace.receipt)))).toBe(true);

    const args = proposalArgs(trace);
    expect(args.slug).toBe("records");
    expect(args.receipt).toEqual(trace.receipt);
    expect(String((args.not_in_sources as string[])[0])).toContain(LOCAL_COMPILE_NOTE);
    expect(JSON.stringify(args.facts)).toContain("14 days");
    expect(JSON.stringify(args.facts)).toContain("Morgan");
    expect(JSON.stringify(args.open_questions)).toContain("migrated");

    await page.getByTestId("library-local-compile-allow").click();
    await expect(page.getByTestId("library-local-compile-written")).toBeVisible({
      timeout: 30_000,
    });
    const written = await harness.snapshot(page);
    expect(written.writes.map((write) => write.relativePath)).toEqual([LOCAL_COMPILE_WIKI_PATH]);
    expect(written.writes[0]?.content).toBe(written.files[LOCAL_COMPILE_WIKI_PATH]);
    expect(written.writes[0]?.content).not.toBe(LOCAL_COMPILE_EXISTING_WIKI);
    expect(written.files[LOCAL_COMPILE_WIKI_PATH]).toBe(proposedText);
    expect(written.files[LOCAL_COMPILE_SOURCE_PATH]).toBe(LOCAL_COMPILE_SOURCE);
    expect(written.files[LOCAL_COMPILE_RETAINED_PATH]).toBe(LOCAL_COMPILE_RETAINED);
    expect(written.files[LOCAL_COMPILE_WIKI_PATH]).toContain(LOCAL_COMPILE_NOTE);
    expect(written.files[LOCAL_COMPILE_WIKI_PATH]).toContain("14 days");
    expect(written.files[LOCAL_COMPILE_WIKI_PATH]).toContain("Morgan");
    expect(written.files[LOCAL_COMPILE_WIKI_PATH]).toContain("migrated remains unconfirmed");
    expect(written.calls.some((call) => call.method === "acp_start")).toBe(false);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Back to Library' }).click();
    await expect(page.getByTestId('library-local-review')).toHaveCount(0);
    await expect(page.getByTestId('library-page')).toHaveAttribute('data-library-state', 'wiki');
  });

  test("refuses a same-timestamp Wiki correction made after the consent card", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const harness = await openLocalCompile(page);
    await expect(page.getByTestId("library-local-compile-card")).toBeVisible({ timeout: 30_000 });
    const before = await harness.snapshot(page);
    const oldMtime = before.mtimes[LOCAL_COMPILE_WIKI_PATH];
    expect(before.writes).toEqual([]);

    // Keep the timestamp deliberately unchanged: exact text checking must catch a correction
    // that lands inside one filesystem timestamp tick.
    await harness.mutateExisting(page, LOCAL_COMPILE_CORRECTION, true);
    await page.getByTestId("library-local-compile-allow").click();
    await expect(page.getByTestId("library-local-compile-failed")).toBeVisible({
      timeout: 30_000,
    });
    const after = await harness.snapshot(page);
    expect(after.files[LOCAL_COMPILE_WIKI_PATH]).toBe(LOCAL_COMPILE_CORRECTION);
    expect(after.mtimes[LOCAL_COMPILE_WIKI_PATH]).toBe(oldMtime);
    expect(after.files[LOCAL_COMPILE_SOURCE_PATH]).toBe(LOCAL_COMPILE_SOURCE);
    expect(after.writes).toEqual([]);
    expect(
      after.calls.filter(
        (call) => call.method === "write_vault_text_file" || call.method === "create_vault_text_file",
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
});

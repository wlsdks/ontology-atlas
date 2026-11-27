import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { roundFingerprint, type RoundRecord } from "../../../src/entities/library-round/model/round-record";
import type { RoundPassEntry } from "../../../src/entities/library-round/model/round-ledger";
import { MACHINE_APPROVALS_STORAGE_KEY, serializeApprovals } from "../../../src/shared/lib/connectors/machine-approvals-format";
import { seedFirstRunSeen } from "../first-run-seed";
import { openFolderFromFirstRun } from "../open-folder";
import { installDesktopBridge } from "../rounds-desktop-bridge";
import { waitForPageSettled } from "../settle";

/**
 * A recheck's schedule row, run history, results dialog and undo, over the stubbed desktop bridge.
 * The run itself (Git, the agent turn, the commit) is `recheck-pass.test.ts` and
 * `src-tauri/src/git/recheck/tests.rs`; this walks what a person sees of it.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";
const HEAD = "a".repeat(40);
const RUN_COMMIT = "b".repeat(40);

const RECHECK: RoundRecord = {
  id: "r-recheck",
  name: "Recheck changed concepts",
  kind: "recheck",
  cadence: { every: "6h" },
  enabled: true,
  limit: 10,
  createdAt: "2026-11-01T00:00:00.000Z",
  nextDueAt: "2099-01-01T00:00:00.000Z",
};

const FROM_CLONE: RoundRecord = { ...RECHECK, id: "r-clone", name: "Recheck from the clone" };

const RUN: RoundPassEntry = {
  v: 1,
  id: "p-recheck",
  roundId: RECHECK.id,
  roundName: RECHECK.name,
  kind: "recheck",
  startedAt: "2026-11-26T09:00:00.000Z",
  endedAt: "2026-11-26T09:02:00.000Z",
  outcome: "rechecked",
  checked: 4,
  stale: [],
  written: ["capabilities/pay.md"],
  refused: ["mcp__atlas-vault__patch_concept"],
  called: ["mcp__atlas-vault__get_concepts"],
  agentTurns: 1,
  summary: "",
  trigger: "clock",
  recheck: {
    head: HEAD,
    commit: RUN_COMMIT,
    sentBytes: 41_200,
    waiting: 3,
    skippedUncommitted: 1,
    ignored: 1,
    concepts: [
      { slug: "capabilities/pay", path: "capabilities/pay.md", outcome: "accurate", files: ["src/pay.ts"] },
      { slug: "capabilities/ship", path: "capabilities/ship.md", outcome: "outdated", files: ["src/ship.ts"], reason: "Shipping now retries twice.", passage: "Ships once." },
      { slug: "capabilities/keys", path: "capabilities/keys.md", outcome: "left", files: [], leftReason: "refused-path", leftPath: ".env.production" },
      { slug: "capabilities/refund", path: "capabilities/refund.md", outcome: "left", files: ["src/refund.ts"], leftReason: "cut-unread", leftPath: "src/refund.ts" },
    ],
  },
};

const concept = (title: string) => ["---", "kind: capability", `title: ${title}`, "---", "", `${title}.`, ""].join("\n");

async function installRecheckBridge(page: Page) {
  await installDesktopBridge(page, { seedRounds: false, allowedHere: false });
  await page.addInitScript(
    ({ rounds, ledger, approvals, docs, head }) => {
      const stub = window as unknown as {
        __roundsStubFiles: Record<string, string>;
        __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
        __recheckUndo?: unknown[];
      };
      const files = stub.__roundsStubFiles;
      Object.assign(files, docs);
      files[".ontology-atlas/rounds.json"] = JSON.stringify({ v: 1, rounds }, null, 2) + "\n";
      files[".ontology-atlas/rounds-ledger.jsonl"] = ledger.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
      if (window.localStorage.getItem(approvals.key) === null) window.localStorage.setItem(approvals.key, approvals.value);
      stub.__recheckUndo = [];
      const base = stub.__TAURI_INTERNALS__.invoke;
      stub.__TAURI_INTERNALS__.invoke = (command, args = {}) => {
        switch (command) {
          case "git_recheck_state":
            return Promise.resolve({ repository: true, head, branch: "work", remoteDefault: "main", hold: null });
          case "git_recheck_recover":
            return Promise.resolve(null);
          case "git_recheck_undo":
            stub.__recheckUndo!.push(args);
            return Promise.resolve({ outcome: "undone", commit: "c".repeat(40), undone: args.paths, skipped: [], detail: null });
          default:
            return base(command, args);
        }
      };
    },
    {
      rounds: [RECHECK, FROM_CLONE],
      ledger: [RUN],
      approvals: { key: MACHINE_APPROVALS_STORAGE_KEY, value: serializeApprovals([["round", VAULT_ROOT, RECHECK.id, roundFingerprint(RECHECK)]]) },
      docs: {
        "capabilities/pay.md": concept("Pay an invoice"),
        "capabilities/ship.md": concept("Ship an order"),
        "capabilities/keys.md": concept("Rotate keys"),
        "capabilities/refund.md": concept("Refund a payment"),
      },
      head: HEAD,
    },
  );
}

async function openOntologyAutomations(page: Page, locale: "en" | "ko") {
  await openFolderFromFirstRun(page, locale);
  await page.getByTestId("app-nav-rail-item-automations").click();
  await page.locator('[data-automations-lane="ontology"][data-automations-state="ready"]').waitFor({ timeout: 30_000 });
}

/** A capture for the pull request, kept under the run's output folder; never committed. */
async function capture(page: Page, testInfo: TestInfo, name: string) {
  await waitForPageSettled(page);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.describe("a scheduled recheck", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await seedFirstRunSeen(page);
    await installRecheckBridge(page);
  });

  test("shows what a run sent and decided, and undoes one concept from the keyboard", async ({ page }, testInfo) => {
    await openOntologyAutomations(page, "en");

    const clone = page.getByTestId(`automation-${FROM_CLONE.id}`);
    await expect(page.getByTestId("automation-recheck-off-here")).toHaveText(/came with the folder and was never allowed on this Mac/);
    await expect(page.getByTestId("automation-allow-here-button")).toHaveCount(0);
    await expect(clone.getByTestId("automations-run-now")).toBeDisabled();

    const row = page.getByTestId(`automation-${RECHECK.id}`);
    await row.click();
    await expect(row).toContainText("Rechecked");
    const run = page.locator(`[data-run-id="${RUN.id}"]`);
    await expect(run).toContainText("4 concepts reread: 1 still accurate, 1 out of date, 2 not decided.");
    await expect(page.getByTestId("recheck-run-lines")).toContainText("Sent 41 kB of documents and code changes to the agent.");
    await expect(page.getByTestId("recheck-run-lines")).toContainText("3 more concepts wait for the next run.");
    await expect(page.getByTestId("recheck-run-lines")).toContainText("1 concept was skipped");
    await expect(page.getByTestId("recheck-run-lines")).toContainText("1 answer named a concept that was not in this run");
    await capture(page, testInfo, "recheck-history-en");

    await run.getByTestId("recheck-view-results").click();
    const dialog = page.getByTestId("recheck-results-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("recheck-result-detail")).toContainText("Pay an invoice");
    await dialog.locator('[data-concept="capabilities/ship"]').click();
    await expect(dialog.getByTestId("recheck-result-detail")).toContainText("The agent's reason: Shipping now retries twice.");
    await dialog.locator('[data-concept="capabilities/keys"]').click();
    await expect(dialog.getByTestId("recheck-result-detail")).toContainText("Atlas does not send .env.production to an agent");
    await dialog.locator('[data-concept="capabilities/refund"]').click();
    await expect(dialog.getByTestId("recheck-result-detail")).toContainText("too long to send whole and the agent did not read the file");
    await capture(page, testInfo, "recheck-results-en");

    await dialog.locator('[data-concept="capabilities/pay"]').click();
    await dialog.getByTestId("recheck-undo-concept").focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByTestId("recheck-undo-answer")).toContainText("Put 1 document back as it was before this run and committed that.");
    await expect(dialog.locator('[data-concept="capabilities/pay"]')).toBeFocused();
    await expect(dialog.getByTestId("recheck-undo-run")).toHaveCount(0);
    await expect(dialog.getByText("Undone · 1")).toBeVisible();
    const undo = await page.evaluate(() => (window as unknown as { __recheckUndo: { runCommit: string; paths: string[] }[] }).__recheckUndo);
    expect(undo).toEqual([expect.objectContaining({ runCommit: RUN_COMMIT, paths: ["capabilities/pay.md"] })]);
    const ledger = await page.evaluate(() => (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles[".ontology-atlas/rounds-ledger.jsonl"]);
    expect(ledger).toContain(`"undoOf":"${RUN.id}"`);
    await capture(page, testInfo, "recheck-undone-en");
  });

  test("schedules a recheck from the sheet with its scope and size", async ({ page }, testInfo) => {
    await openOntologyAutomations(page, "en");
    await page.getByTestId("automations-new").click();
    await page.getByTestId("ontology-automation-kind-recheck").click();
    const sheet = page.getByTestId("ontology-automation-sheet");
    for (const line of ["Send the agent each concept document", "Record in each document that is still accurate", "Commit those documents on the branch", "Never change a sentence"]) {
      await expect(sheet).toContainText(line);
    }
    await expect(page.getByTestId("ontology-automation-cost")).toContainText("up to 10 concepts and at most 200 kB of text");
    await capture(page, testInfo, "recheck-sheet-en");
    await page.getByTestId("ontology-automation-cost").scrollIntoViewIfNeeded();
    await capture(page, testInfo, "recheck-sheet-scope-en");
  });

  test("reads in Korean, results dialog included", async ({ page }, testInfo) => {
    await openOntologyAutomations(page, "ko");
    await page.getByTestId(`automation-${RECHECK.id}`).click();
    await page.locator(`[data-run-id="${RUN.id}"]`).getByTestId("recheck-view-results").click();
    const dialog = page.getByTestId("recheck-results-dialog");
    await expect(dialog.getByTestId("recheck-undo-concept")).toBeVisible();
    await expect(dialog.getByTestId("recheck-undo-run")).toBeVisible();
    await capture(page, testInfo, "recheck-results-ko");
    await page.keyboard.press("Escape");
    await page.getByTestId("automations-new").click();
    await page.getByTestId("ontology-automation-kind-recheck").click();
    await expect(page.getByTestId("ontology-automation-cost")).toContainText("200");
    await capture(page, testInfo, "recheck-sheet-ko");
  });
});

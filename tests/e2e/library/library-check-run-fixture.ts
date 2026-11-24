import { expect, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { installLibraryWorkHarness, type LibraryWorkHarness } from "../library-work-harness";
import { openFolderFromFirstRun } from "../open-folder";

const wikiPage = (title: string) => `---\ntitle: ${title}\ncreated_by: agent:claude\ncompiled_at: 2026-09-06T10:00:00Z\nsources:\n  - sources/architecture.docx\nsource_hash:\n  sources/architecture.docx: 3b1f0a00000000000000000000000000000000000000000000000000000000ab\nstatus: draft\nsummary: ${title}.\n---\n\n## Summary\n\n${title}.\n\n## Facts\n\n- A fact. [[src:sources/architecture.docx#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n`;

export const CHECK_FILES: Record<string, string> = {
  "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
  "sources/architecture.docx": "Architecture evidence\n",
  "wiki/alpha.md": wikiPage("Alpha"),
  "wiki/beta.md": wikiPage("Beta"),
  "wiki/gamma.md": wikiPage("Gamma"),
};

/** The answer the brief asks for: prose, then the one machine-readable block with three findings. */
export const THREE_FINDINGS = [
  "Three findings.",
  "",
  "```json",
  JSON.stringify({
    counts: { disagreement: 1, superseded: 1, missingLink: 1, nameWithoutPage: 0, uncertain: 0 },
    findings: [
      { code: "disagreement", pages: ["wiki/alpha", "wiki/beta"], summary: "Alpha and Beta give two launch dates." },
      { code: "superseded", pages: ["wiki/gamma"], summary: "Gamma keeps a plan a later page replaced." },
      { code: "missing-link", pages: ["wiki/alpha", "wiki/gamma"], summary: "Alpha and Gamma do not link each other." },
    ],
    nodeCandidates: [],
  }),
  "```",
].join("\n");

type TapWindow = { __checkTap?: { read(path: string): void; fail(): void; sessions(): number; stops(): string[] } };

/**
 * Taps the stub bridge before the harness installs it. The harness serves one ACP channel, so the
 * tap adds completed reads to that channel (renumbering its messages to keep their order) and
 * answers any later session itself, as a second dock's own adapter would.
 */
async function tapBridge(page: Page, options: { offerUpdate: boolean }) {
  await page.addInitScript(({ offerUpdate }) => {
    // The update feed serves macOS only (`feedServesPlatform`), so the stubbed app reports a Mac
    // wherever the browser runs; a Linux runner would otherwise never ask for the offered update.
    if (offerUpdate) Object.defineProperty(Navigator.prototype, "platform", { configurable: true, get: () => "MacIntel" });
    type Raw = { message: unknown; index: number };
    type Internals = {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (callback: (raw: Raw) => void, once?: boolean) => number;
    };
    const callbacks = new Map<number, (raw: Raw) => void>();
    let harness: { channel: number; session: string; shift: number; last: number } | null = null;
    const ownSessions = new Map<string, { channel: number; index: number }>();
    const stops: string[] = [];
    let reads = 0;
    let promptId: number | null = null;
    const deliver = (channel: number, index: number, line: unknown) =>
      callbacks.get(channel)?.({ message: { kind: "message", line: JSON.stringify(line) }, index });
    const toHarness = (line: Record<string, unknown>) => {
      if (!harness) return;
      harness.shift += 1;
      harness.last += 1;
      deliver(harness.channel, harness.last, line);
    };
    const updateHarness = (update: Record<string, unknown>) =>
      toHarness({ jsonrpc: "2.0", method: "session/update", params: { sessionId: harness?.session, update } });
    const answerOwn = (session: string, line: string) => {
      const own = ownSessions.get(session);
      const message = JSON.parse(line) as { id?: number; method?: string };
      if (!own || message.id === undefined || !message.method) return;
      const result = message.method === "initialize" ? { protocolVersion: 1 }
        : message.method === "session/new" ? { sessionId: session }
          : message.method === "session/list" ? { sessions: [] } : {};
      setTimeout(() => deliver(own.channel, own.index++, { jsonrpc: "2.0", id: message.id, result }), 0);
    };
    let internals: Internals | undefined;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      get: () => internals,
      set: (value: Internals) => {
        const transform = value.transformCallback;
        value.transformCallback = (callback, once) => {
          let id = -1;
          const wrapped = (raw: Raw) => {
            if (harness && id === harness.channel && typeof raw?.index === "number") {
              raw = { ...raw, index: raw.index + harness.shift };
              harness.last = raw.index;
            }
            callback(raw);
          };
          id = transform(wrapped, once);
          callbacks.set(id, callback);
          return id;
        };
        const invoke = value.invoke;
        value.invoke = async (command, args = {}) => {
          if (offerUpdate && command === "plugin:updater|check") {
            return { rid: 1, currentVersion: "2.3.1", version: "9.0.0", date: null, body: "Notes.", rawJson: {} };
          }
          const channel = (args.onEvent as { id?: number } | undefined)?.id;
          if (command === "acp_start" && harness && channel !== undefined) {
            const session = `own-${ownSessions.size + 1}`;
            ownSessions.set(session, { channel, index: 0 });
            return session;
          }
          const session = String(args.sessionId ?? "");
          if (ownSessions.has(session)) {
            if (command === "acp_send") answerOwn(session, String(args.line ?? "{}"));
            if (command === "acp_stop") stops.push(session);
            return command === "acp_permission_verdict" ? "ask" : null;
          }
          if (command === "acp_send") {
            const sent = JSON.parse(String(args.line ?? "{}")) as { id?: number; method?: string; params?: { sessionId?: string } };
            if (sent.method === "session/prompt" && typeof sent.id === "number") promptId = sent.id;
            // The harness mints the ACP session on `session/new`; updates must name that one, not the bridge.
            if (sent.method === "session/prompt" && harness && typeof sent.params?.sessionId === "string") harness.session = sent.params.sessionId;
          }
          const answer = await invoke(command, args);
          if (command === "acp_start" && channel !== undefined) harness = { channel, session: String(answer), shift: 0, last: -1 };
          return answer;
        };
        internals = value;
      },
    });
    (window as unknown as TapWindow).__checkTap = {
      read: (path) => {
        const toolCallId = `tap-read-${++reads}`;
        const rawInput = { file_path: path };
        updateHarness({ sessionUpdate: "tool_call", toolCallId, title: "mcp__atlas-vault__read_wiki", kind: "read", status: "pending", rawInput });
        updateHarness({ sessionUpdate: "tool_call_update", toolCallId, status: "completed", rawInput, rawOutput: { text: "Page text." } });
      },
      fail: () => {
        if (promptId !== null) toHarness({ jsonrpc: "2.0", id: promptId, error: { code: -32603, message: "The adapter exited." } });
      },
      sessions: () => ownSessions.size,
      stops: () => [...stops],
    };
  }, options);
}

/** One completed read of `path` in the check's turn, as the agent's adapter reports it. */
export const readPage = (page: Page, path: string) =>
  page.evaluate((target) => (window as unknown as TapWindow).__checkTap?.read(target), path);

/** Ends the check's turn with the adapter's error, before any report. */
export const failTurn = (page: Page) =>
  page.evaluate(() => (window as unknown as TapWindow).__checkTap?.fail());

/** Sessions other docks opened while the check ran, and those of them the app ended. */
export const otherSessions = (page: Page) =>
  page.evaluate(() => {
    const tap = (window as unknown as TapWindow).__checkTap;
    return { opened: tap?.sessions() ?? 0, stopped: tap?.stops() ?? [] };
  });

type HarnessWindow = { __atlasLibraryWorkHarness?: { snapshot(): { calls: Array<{ method: string }> } } };

export const harnessCalls = (page: Page) =>
  page.evaluate(() => ((window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls ?? []).map((call) => call.method));

export const rail = (page: Page) => page.getByTestId("app-nav-rail");

/** Opens the folder, presses Check wiki in the Library and waits for the agent to receive the brief. */
export async function startCheck(
  page: Page,
  options: { offerUpdate?: boolean; locale?: string } = {},
): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  await tapBridge(page, { offerUpdate: options.offerUpdate ?? false });
  const harness = await installLibraryWorkHarness(page, { files: CHECK_FILES });
  await openFolderFromFirstRun(page, options.locale ?? "en");
  await rail(page).getByTestId("app-nav-rail-item-library").click();
  await page.getByTestId("library-workspace-wiki").click();
  await page.getByTestId("library-open-report").click();
  await page.getByTestId("library-check-report-lint").click();
  await expect.poll(() => harnessCalls(page), { message: "the check's brief reaches the agent" }).toContain("session/prompt");
  /*
   * Check results draws the run in place; back at the Library home the card speaks for it. Below
   * 1280 the opened conversation is drawn over the page (`LibraryAgentDock`), so a person puts it
   * away first. The tab already shown leads home even while the open dock has folded the index.
   */
  if ((page.viewportSize()?.width ?? 1280) < 1280) {
    await page.getByTestId("library-agent-dock").getByTestId("acp-dock-close").click();
    await expect(page.getByTestId("library-agent-dock-frame")).toHaveAttribute("data-dock-state", "put-away");
  }
  await page.getByTestId("library-workspace-tabs").locator('[aria-selected="true"]').click();
  await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "nothing-open");
  return harness;
}

export async function goToMap(page: Page) {
  await rail(page).getByTestId("app-nav-rail-item-map").click();
  await expect(page).toHaveURL(/\/topology\//);
}

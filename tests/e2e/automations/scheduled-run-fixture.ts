import { expect, type Page } from "@playwright/test";

import { roundFingerprint, type RoundRecord } from "../../../src/entities/library-round/model/round-record";
import { MACHINE_APPROVALS_STORAGE_KEY, serializeApprovals } from "../../../src/shared/lib/connectors/machine-approvals-format";
import { seedFirstRunSeen } from "../first-run-seed";
import { CHECK_FILES } from "../library/library-check-run-fixture";
import { installLibraryWorkHarness, type LibraryWorkHarness } from "../library-work-harness";
import { openFolderFromFirstRun } from "../open-folder";

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

/** An ontology review the clock never reaches on its own: every run here is a "Run now". */
export const REVIEW: RoundRecord = {
  id: "r-review",
  name: "Source gaps",
  kind: "ontology",
  cadence: { every: "6h" },
  enabled: true,
  query: "",
  createdAt: "2026-11-01T00:00:00.000Z",
  nextDueAt: "2099-01-01T00:00:00.000Z",
};

/** The brief's first words tell the scheduled review's session from the wiki check's. */
const REVIEW_BRIEF = "unattended Ontology refinement review";

type Session = { id: string; prompt: string | null; reads: number; stopped: boolean; cancelled: boolean };
type AgentTap = {
  sessions(): Session[];
  read(marker: string, path: string): boolean;
  answer(marker: string, text: string): boolean;
};
type TapWindow = { __agentTap?: AgentTap };

/**
 * Every agent session the app opens, answered here rather than by the work harness's single
 * channel: the scheduled review and the wiki check each get their own, and each prompt waits
 * until the test reads a file or answers in it. Vault files and writes stay the harness's.
 */
async function tapAgents(page: Page) {
  await page.addInitScript(() => {
    type Raw = { message: unknown; index: number };
    type Internals = {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (callback: (raw: Raw) => void, once?: boolean) => number;
    };
    type Live = { id: string; channel: number; index: number; prompt: string | null; promptId: number | null; reads: number; stopped: boolean; cancelled: boolean };
    const callbacks = new Map<number, (raw: Raw) => void>();
    const sessions = new Map<string, Live>();
    const deliver = (session: Live, line: unknown) =>
      callbacks.get(session.channel)?.({ message: { kind: "message", line: JSON.stringify(line) }, index: session.index++ });
    const result = (session: Live, id: number, value: unknown) => deliver(session, { jsonrpc: "2.0", id, result: value });
    const update = (session: Live, value: Record<string, unknown>) =>
      deliver(session, { jsonrpc: "2.0", method: "session/update", params: { sessionId: session.id, update: value } });
    const answerLine = (session: Live, line: string) => {
      const message = JSON.parse(line) as { id?: number; method?: string; params?: { prompt?: Array<{ text?: string }> } };
      if (message.method === "session/cancel") {
        session.cancelled = true;
        if (session.promptId !== null) result(session, session.promptId, { stopReason: "cancelled" });
        session.promptId = null;
        return;
      }
      if (message.id === undefined || !message.method) return;
      const id = message.id;
      if (message.method === "session/prompt") {
        session.promptId = id;
        session.prompt = (message.params?.prompt ?? []).map((part) => part.text ?? "").join("\n");
        return;
      }
      const value = message.method === "initialize" ? { protocolVersion: 1, agentCapabilities: { loadSession: false, promptCapabilities: {} } }
        : message.method === "session/new" ? { sessionId: session.id, modes: { availableModes: [{ id: "default", name: "Default" }], currentModeId: "default" }, models: { availableModels: [], currentModelId: null } }
          : message.method === "session/list" ? { sessions: [] } : {};
      setTimeout(() => result(session, id, value), 0);
    };
    const find = (marker: string) => [...sessions.values()].find((session) => session.promptId !== null && session.prompt?.includes(marker));
    let internals: Internals | undefined;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      get: () => internals,
      set: (value: Internals) => {
        const transform = value.transformCallback;
        value.transformCallback = (callback, once) => {
          const id = transform(callback, once);
          callbacks.set(id, callback);
          return id;
        };
        const invoke = value.invoke;
        value.invoke = async (command, args = {}) => {
          if (command === "acp_start") {
            const id = `agent-${sessions.size + 1}`;
            const channel = (args.onEvent as { id: number }).id;
            sessions.set(id, { id, channel, index: 0, prompt: null, promptId: null, reads: 0, stopped: false, cancelled: false });
            return id;
          }
          const session = sessions.get(String(args.sessionId ?? ""));
          if (session && command === "acp_send") answerLine(session, String(args.line ?? "{}"));
          if (session && command === "acp_stop") session.stopped = true;
          if (session) return command === "acp_permission_verdict" ? "ask" : null;
          return invoke(command, args);
        };
        internals = value;
      },
    });
    (window as unknown as TapWindow).__agentTap = {
      sessions: () => [...sessions.values()].map(({ id, prompt, reads, stopped, cancelled }) => ({ id, prompt, reads, stopped, cancelled })),
      read: (marker, path) => {
        const session = find(marker);
        if (!session) return false;
        const toolCallId = `${session.id}-read-${++session.reads}`;
        const rawInput = { file_path: path };
        update(session, { sessionUpdate: "tool_call", toolCallId, title: "mcp__atlas-vault__read_wiki", kind: "read", status: "pending", rawInput });
        update(session, { sessionUpdate: "tool_call_update", toolCallId, status: "completed", rawInput, rawOutput: { text: "Page text." } });
        return true;
      },
      answer: (marker, text) => {
        const session = find(marker);
        if (!session || session.promptId === null) return false;
        update(session, { sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
        result(session, session.promptId, { stopReason: "end_turn" });
        session.promptId = null;
        return true;
      },
    };
  });
}

export const agentSessions = (page: Page) =>
  page.evaluate(() => (window as unknown as TapWindow).__agentTap?.sessions() ?? []);

/** One completed read in the scheduled review's turn. */
export const reviewReads = (page: Page, path: string) =>
  expect.poll(() => page.evaluate(({ marker, target }) => (window as unknown as TapWindow).__agentTap?.read(marker, target), { marker: REVIEW_BRIEF, target: path })).toBe(true);

/** The scheduled review's agent answers and ends its turn. */
export const reviewAnswers = (page: Page, text: string) =>
  expect.poll(() => page.evaluate(({ marker, value }) => (window as unknown as TapWindow).__agentTap?.answer(marker, value), { marker: REVIEW_BRIEF, value: text })).toBe(true);

export const reviewSession = async (page: Page) =>
  (await agentSessions(page)).find((session) => session.prompt?.includes(REVIEW_BRIEF)) ?? null;

export const rail = (page: Page) => page.getByTestId("app-nav-rail");

export const roundsFile = async (harness: LibraryWorkHarness, page: Page) =>
  JSON.parse((await harness.snapshot(page)).files[".ontology-atlas/rounds.json"] ?? "{}") as { rounds: RoundRecord[] };

/** The Library check's folder with one ontology review this Mac allowed, opened on its map. */
export async function openFolderWithReview(page: Page, options: { locale?: string; offerUpdate?: boolean } = {}): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  await page.addInitScript(({ key, value, offerUpdate }) => {
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    // The update feed serves macOS only, so a Linux runner would otherwise never offer one.
    if (offerUpdate) Object.defineProperty(Navigator.prototype, "platform", { configurable: true, get: () => "MacIntel" });
  }, {
    key: MACHINE_APPROVALS_STORAGE_KEY,
    value: serializeApprovals([["round", VAULT_ROOT, REVIEW.id, roundFingerprint(REVIEW)]]),
    offerUpdate: options.offerUpdate ?? false,
  });
  await tapAgents(page);
  const harness = await installLibraryWorkHarness(page, {
    files: { ...CHECK_FILES, ".ontology-atlas/rounds.json": `${JSON.stringify({ v: 1, rounds: [REVIEW] }, null, 2)}\n` },
  });
  await openFolderFromFirstRun(page, options.locale ?? "en");
  return harness;
}

/** Presses Run now on the review in Automations and waits for its brief to reach the agent. */
export async function runReviewNow(page: Page) {
  await rail(page).getByTestId("app-nav-rail-item-automations").click();
  await page.getByTestId("automations-tab-ontology").click();
  const row = page.getByTestId(`automation-${REVIEW.id}`);
  await row.getByTestId("automations-run-now").click();
  await expect.poll(async () => (await reviewSession(page))?.prompt ?? null, { message: "the review's brief reaches the agent" }).not.toBeNull();
}

/** Presses Check wiki in the Library and waits for its brief to reach its own agent session. */
export async function startWikiCheck(page: Page) {
  await rail(page).getByTestId("app-nav-rail-item-library").click();
  await page.getByTestId("library-workspace-wiki").click();
  await page.getByTestId("library-open-report").click();
  await page.getByTestId("library-check-report-lint").click();
  await expect.poll(async () => (await agentSessions(page)).filter((session) => session.prompt && !session.prompt.includes(REVIEW_BRIEF)).length,
    { message: "the check's brief reaches the agent" }).toBe(1);
}

export async function goToMap(page: Page) {
  await rail(page).getByTestId("app-nav-rail-item-map").click();
  await expect(page).toHaveURL(/\/topology\//);
}

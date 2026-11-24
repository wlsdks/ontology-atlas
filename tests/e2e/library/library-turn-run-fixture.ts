import { expect, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { installLibraryWorkHarness, type LibraryWorkHarness } from "../library-work-harness";
import { openFolderFromFirstRun } from "../open-folder";

export const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

export const wikiPage = (title: string) => `---\ntitle: ${title}\ncreated_by: agent:claude\ncompiled_at: 2026-09-06T10:00:00Z\nsources:\n  - sources/architecture.docx\nsource_hash:\n  sources/architecture.docx: 3b1f0a00000000000000000000000000000000000000000000000000000000ab\nstatus: draft\nsummary: ${title}.\n---\n\n## Summary\n\n${title}.\n\n## Facts\n\n- A fact. [[src:sources/architecture.docx#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n`;

const TURN_FILES: Record<string, string> = {
  "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
  "sources/architecture.docx": "Architecture evidence\n",
  "sources/features.html": "<html><body>Features evidence</body></html>\n",
};

type TurnTap = {
  ask(path: string, content: string): number;
  run(title: string): void;
  answers(): Record<number, string>;
  ignoreCancel(): void;
  cancels(): number;
  starts(): number;
  stops(): number;
};
type TapWindow = { __turnTap?: TurnTap };

/**
 * Taps the stub bridge before the harness installs it, as an agent that writes several pages:
 * each request is a real `session/request_permission`, and an allowed one writes its file and
 * reports the tool completed. `ignoreCancel` makes the agent drop `session/cancel`. Its lines
 * carry the session `session/new` answered: `acp_start` names the bridge process, not the session.
 */
async function tapBridge(page: Page) {
  await page.addInitScript((vaultRoot) => {
    type Raw = { message: unknown; index: number };
    type Internals = {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (callback: (raw: Raw) => void, once?: boolean) => number;
    };
    type Harness = { mutateSource(path: string, text: string): void };
    const callbacks = new Map<number, (raw: Raw) => void>();
    let harness: { channel: number; session: string | null; shift: number; last: number } | null = null;
    const answeredSession = (message: unknown): string | null => {
      const line = (message as { line?: unknown } | null)?.line;
      if (typeof line !== "string") return null;
      try {
        const sessionId = (JSON.parse(line) as { result?: { sessionId?: unknown } }).result?.sessionId;
        return typeof sessionId === "string" ? sessionId : null;
      } catch {
        return null;
      }
    };
    const asked = new Map<number, { path: string; content: string; call: string }>();
    const answers: Record<number, string> = {};
    let nextRequest = 9_000;
    let dropCancel = false;
    let cancels = 0;
    let starts = 0;
    let stops = 0;
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
    const settle = (id: number, optionId: string) => {
      const request = asked.get(id);
      if (!request || answers[id]) return;
      answers[id] = optionId;
      setTimeout(() => {
        if (optionId === "allow") {
          (window as unknown as { __atlasLibraryWorkHarness?: Harness }).__atlasLibraryWorkHarness?.mutateSource(request.path, request.content);
          updateHarness({ sessionUpdate: "tool_call_update", toolCallId: request.call, status: "completed", rawOutput: { ok: true } });
        } else {
          updateHarness({ sessionUpdate: "tool_call_update", toolCallId: request.call, status: "failed", rawOutput: { error: "rejected" } });
        }
      }, 0);
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
              harness.session = answeredSession(raw.message) ?? harness.session;
            }
            callback(raw);
          };
          id = transform(wrapped, once);
          callbacks.set(id, callback);
          return id;
        };
        const invoke = value.invoke;
        value.invoke = async (command, args = {}) => {
          const channel = (args.onEvent as { id?: number } | undefined)?.id;
          if (command === "acp_start") starts += 1;
          if (command === "acp_stop") stops += 1;
          if (command === "acp_send") {
            const sent = JSON.parse(String(args.line ?? "{}")) as { id?: number; method?: string; params?: { sessionId?: string }; result?: { outcome?: { optionId?: string; outcome?: string } } };
            // The harness mints the ACP session on `session/new`; updates must name that one, not the bridge.
            if (sent.method === "session/prompt" && harness && typeof sent.params?.sessionId === "string") harness.session = sent.params.sessionId;
            if (sent.method === "session/cancel") {
              cancels += 1;
              if (dropCancel) return null;
            }
            if (typeof sent.id === "number" && asked.has(sent.id) && sent.result) {
              settle(sent.id, sent.result.outcome?.optionId ?? sent.result.outcome?.outcome ?? "cancelled");
              return null;
            }
          }
          const answer = await invoke(command, args);
          if (command === "acp_start" && channel !== undefined && !harness) harness = { channel, session: null, shift: 0, last: -1 };
          return answer;
        };
        internals = value;
      },
    });
    (window as unknown as TapWindow).__turnTap = {
      ask: (path, content) => {
        const id = ++nextRequest;
        const call = `tap-write-${id}`;
        const filePath = `${vaultRoot}/${path}`;
        const rawInput = { file_path: filePath, content };
        asked.set(id, { path, content, call });
        updateHarness({ sessionUpdate: "tool_call", toolCallId: call, title: `Write ${filePath}`, kind: "edit", status: "pending", rawInput });
        toHarness({
          jsonrpc: "2.0", id, method: "session/request_permission",
          params: { sessionId: harness?.session, options: [{ kind: "reject_once", optionId: "reject", name: "Reject" }, { kind: "allow_once", optionId: "allow", name: "Allow once" }], toolCall: { toolCallId: call, title: `Write ${filePath}`, kind: "edit", rawInput } },
        });
        return id;
      },
      run: (title) => {
        const call = `tap-run-${++nextRequest}`;
        updateHarness({ sessionUpdate: "tool_call", toolCallId: call, title, kind: "execute", status: "pending", rawInput: { command: title } });
        updateHarness({ sessionUpdate: "tool_call_update", toolCallId: call, status: "completed", rawOutput: { ok: true } });
      },
      answers: () => ({ ...answers }),
      ignoreCancel: () => { dropCancel = true; },
      cancels: () => cancels,
      starts: () => starts,
      stops: () => stops,
    };
  }, VAULT_ROOT);
}

/** The agent asks to write `path`; resolves with the request's id. */
export const askWrite = (page: Page, path: string, content = wikiPage(path)) =>
  page.evaluate(({ path, content }) => (window as unknown as TapWindow).__turnTap!.ask(path, content), { path, content });

/** The agent runs a command it was allowed to run, outside what Atlas can see. */
export const runTool = (page: Page, title: string) =>
  page.evaluate((command) => (window as unknown as TapWindow).__turnTap!.run(command), title);

/** How each tapped request was answered, by id. */
export const answers = (page: Page) => page.evaluate(() => (window as unknown as TapWindow).__turnTap!.answers());

/** From now on the agent ignores `session/cancel`. */
export const ignoreCancel = (page: Page) => page.evaluate(() => (window as unknown as TapWindow).__turnTap!.ignoreCancel());

/** Agent processes started and ended, and cancels sent. */
export const processes = (page: Page) =>
  page.evaluate(() => {
    const t = (window as unknown as TapWindow).__turnTap!;
    return { starts: t.starts(), stops: t.stops(), cancels: t.cancels() };
  });

type HarnessWindow = { __atlasLibraryWorkHarness?: { snapshot(): { calls: Array<{ method: string }>; writes: Array<{ relativePath: string }> } } };

export const harnessCalls = (page: Page) =>
  page.evaluate(() => ((window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls ?? []).map((call) => call.method));

/** Entries in the wiki log as the folder holds it now. */
export const logEntries = (page: Page) =>
  page.evaluate(() => {
    const files = (window as unknown as { __atlasLibraryWorkHarness?: { snapshot(): { files: Record<string, string> } } }).__atlasLibraryWorkHarness?.snapshot().files ?? {};
    return (files["wiki/_log.md"] ?? "").split("\n").filter((line) => line.startsWith("## [")).length;
  });

export const writesTo = (page: Page, path: string) =>
  page.evaluate((target) => ((window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().writes ?? []).filter((write) => write.relativePath === target).length, path);

export const rail = (page: Page) => page.getByTestId("app-nav-rail");

/** Opens the folder, presses Write wiki pages in the Library and waits for the agent to receive it. */
export async function startWritingTurn(
  page: Page,
  options: { locale?: string; writeMode?: "ask" | "auto" } = {},
): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  await tapBridge(page);
  const harness = await installLibraryWorkHarness(page, { files: TURN_FILES, writeMode: options.writeMode ?? "ask" });
  await openFolderFromFirstRun(page, options.locale ?? "en");
  await rail(page).getByTestId("app-nav-rail-item-library").click();
  await page.getByTestId("library-workspace-sources").click();
  await page.getByTestId("library-progress-continue").click();
  await expect.poll(() => harnessCalls(page), { message: "the request reaches the agent" }).toContain("session/prompt");
  return harness;
}

export async function goToMap(page: Page) {
  await rail(page).getByTestId("app-nav-rail-item-map").click();
  await expect(page).toHaveURL(/\/topology\//);
}

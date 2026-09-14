import type { Page } from "@playwright/test";

import { buildCodexConfigToml } from "../../src/entities/vault-session/lib/ontology-starter";
import { bundledServerLaunch } from "../../src/shared/config/mcp-server-launch";
import { seedFirstRunSeen } from "./first-run-seed";

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";
export const LIBRARY_WORK_MCP_BINARY = "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp";
export const LIBRARY_WORK_CODEX_CONFIG = buildCodexConfigToml(
  ".",
  bundledServerLaunch(LIBRARY_WORK_MCP_BINARY),
);

const RUNTIME = {
  id: "claude-code", label: "Claude Agent", description: "", website: null, license: null,
  verified: true, icon: null, brandInk: null, launchKind: "npx", state: "ready",
  cliPath: "/opt/homebrew/bin/claude", adapterPath: null,
  adapterPackage: "@agentclientprotocol/claude-agent-acp", isolated: true,
};

export type LibraryWorkRuntimeId = "claude-acp" | "codex-acp";

const ACP_RUNTIMES: Record<LibraryWorkRuntimeId, typeof RUNTIME> = {
  "claude-acp": {
    ...RUNTIME,
    id: "claude-acp",
    label: "Claude Agent",
    cliPath: "/opt/homebrew/bin/claude",
    adapterPackage: "@agentclientprotocol/claude-agent-acp@0.75.1",
  },
  "codex-acp": {
    ...RUNTIME,
    id: "codex-acp",
    label: "Codex",
    cliPath: "/opt/homebrew/bin/codex",
    adapterPackage: "@agentclientprotocol/codex-acp@1.10.0",
  },
};

const VAULT_FILES: Record<string, string> = {
  "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
  "sources/architecture.docx": "Architecture evidence\n",
  "sources/design-system.pdf": "Design system evidence\n",
  "sources/features.html": "<html><body>Features evidence</body></html>\n",
  "sources/release-dates.csv": "date,release\n2026-09-08,Launch\n",
};

const ARCHITECTURE_PAGE = "---\ntitle: Architecture evidence\ncreated_by: agent:claude-code\ncompiled_at: 2026-09-08T00:00:00.000Z\nsources:\n  - sources/architecture.docx\nsource_hash:\n  sources/architecture.docx: 0000000000000000000000000000000000000000000000000000000000000000\nstatus: draft\nsummary: Architecture evidence.\n---\n\n## Summary\n\nArchitecture evidence captured by the ACP harness.\n\n## Facts\n\n- The architecture source is available. [[src:sources/architecture.docx#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n";

type JsonRecord = Record<string, unknown>;
type JsonRpcId = number | string;
type EventCallback = (event: { event: string; payload: unknown }) => void;

interface HarnessWindow extends Window {
  isTauri?: boolean;
  __TAURI_INTERNALS__?: {
    transformCallback(callback: EventCallback): number;
    invoke(command: string, args?: JsonRecord): Promise<unknown>;
  };
  __TAURI_EVENT_PLUGIN_INTERNALS__: {
    unregisterListener(event: string, id: number): void;
  };
  __atlasLibraryWorkHarness?: {
    emitRead(): void;
    emitWait(): void;
    emitWrite(): void;
    finish(): void;
    answer(text: string): void;
    mutateSource(path: string, text: string): void;
    snapshot(): LibraryWorkHarnessSnapshot;
  };
}

export type LibraryWorkScenario = "successful-write" | "failed-unknown-target";

export interface LibraryWorkHarnessSnapshot {
  files: Record<string, string>;
  writes: Array<{ relativePath: string; content: string; mtime: number }>;
  calls: Array<{ method: string; params?: unknown }>;
  events: Array<{ event: string; payload: unknown }>;
  scenario: LibraryWorkScenario;
}

export interface LibraryWorkHarness {
  snapshot(page: Page): Promise<LibraryWorkHarnessSnapshot>;
  read(page: Page): Promise<void>;
  wait(page: Page): Promise<void>;
  write(page: Page): Promise<void>;
  finish(page: Page): Promise<void>;
  answer(page: Page, text: string): Promise<void>;
  mutateSource(page: Page, path: string, text: string): Promise<void>;
}

/**
 * A protocol-level installed-app bridge. It drives ACP lines and actual Tauri command shapes,
 * never a product-only event or Library state. Each work phase is explicit so a headed capture
 * can hold a genuine read or permission wait without a fabricated timer.
 */
export async function installLibraryWorkHarness(
  page: Page,
  options: {
    scenario?: LibraryWorkScenario;
    files?: Record<string, string>;
    permissionFile?: string;
    permissionText?: string;
    writeMode?: 'ask' | 'auto';
    filePermission?: boolean;
    runtimeId?: LibraryWorkRuntimeId;
    localResponses?: string[];
    permissionKind?: 'wiki' | 'ontology-patch';
  } = {},
): Promise<LibraryWorkHarness> {
  const scenario = options.scenario ?? "successful-write";
  const runtime = options.runtimeId ? ACP_RUNTIMES[options.runtimeId] : RUNTIME;
  await page.addInitScript(
    ({ initialFiles, initialScenario, vaultRoot, runtime, architecturePage, permissionFile, permissionText, permissionKind, writeMode, filePermission, mcpBinary, localResponses }) => {
      const fixtureWindow = window as unknown as HarnessWindow;
      const record = (value: unknown): JsonRecord | null => typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as JsonRecord
        : null;
      const jsonRpcId = (value: unknown): JsonRpcId | null => typeof value === "number" || typeof value === "string"
        ? value
        : null;
      window.localStorage.setItem("library.wikiWriteMode", writeMode);
      if (localResponses) window.localStorage.setItem("ontology-atlas:local-endpoint", JSON.stringify({ baseUrl: "http://127.0.0.1:11434/v1", model: "fixture-local" }));
      let localRound = 0;
      const files: Record<string, string> = { ...initialFiles };
      const mtimes: Record<string, number> = {};
      const directories = new Set([".", ".ontology-atlas", "sources", "wiki"]);
      const callbacks = new Map<number, EventCallback>();
      const listeners = new Map<string, Set<number>>();
      const calls: Array<{ method: string; params?: unknown }> = [];
      const events: Array<{ event: string; payload: unknown }> = [];
      const writes: Array<{ relativePath: string; content: string; mtime: number }> = [];
      let callbackId = 1;
      const sessionId = "library-acp-session";
      let nextMtime = 1_727_000_000_000;
      let promptId: number | string | null = null;
      let permissionId: number | string | null = null;
      let phase: "idle" | "read" | "waiting" | "approved" | "rejected" | "written" | "finished" = "idle";
      for (const path of Object.keys(files)) mtimes[path] = nextMtime;

      const emit = (event: string, payload: unknown) => {
        events.push({ event, payload });
        for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, payload });
      };
      const acp = (line: Record<string, unknown>) => emit("acp://message", { sessionId, line: JSON.stringify(line) });
      const result = (id: JsonRpcId, value: unknown) => acp({ jsonrpc: "2.0", id, result: value });
      const update = (value: Record<string, unknown>) => acp({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: value } });
      const relative = (value: unknown) => {
        if (typeof value !== "string") return "";
        if (value === vaultRoot) return "";
        return value.startsWith(`${vaultRoot}/`) ? value.slice(vaultRoot.length + 1) : value;
      };
      const fingerprint = () => ({
        entries: Object.entries(files).filter(([path]) => path.endsWith(".md") || path.startsWith("sources/")).map(([relativePath, text]) => ({ relativePath, lastModified: mtimes[relativePath] ?? nextMtime, size: new TextEncoder().encode(text).length })),
        truncated: false, prunedDirs: [],
      });
      const write = (path: string, content: string) => {
        nextMtime += 1;
        files[path] = content;
        mtimes[path] = nextMtime;
        writes.push({ relativePath: path, content, mtime: nextMtime });
        emit("vault-changed", {});
      };
      const emitRead = () => {
        if (phase !== "idle") return;
        phase = "read";
        update({ sessionUpdate: "tool_call", toolCallId: "read-architecture", title: "mcp__atlas-vault__read_source", kind: "read", status: "pending", rawInput: { file_path: "sources/architecture.docx" } });
      };
      const emitWait = () => {
        if (phase !== "read") return;
        update({ sessionUpdate: "tool_call_update", toolCallId: "read-architecture", status: "completed", rawInput: { file_path: "sources/architecture.docx" }, rawOutput: { text: "Architecture evidence" } });
        phase = "waiting";
        const targetPath = initialScenario === "successful-write" ? `${vaultRoot}/${permissionFile ?? 'wiki/architecture.md'}` : `${vaultRoot}/outside/unknown.md`;
        const rawInput = permissionKind === 'ontology-patch'
          ? {
              slug: 'capabilities/task-review',
              expected_mtime: 1_727_000_000_000,
              body: '## Definition\n\nReview the selected proposal.\n\n## Includes\n\n- Only the exact current request and selected item are under review.\n\n## Excludes\n\n- Allow once does not accept meaning.\n',
            }
          : { file_path: targetPath, content: permissionText ?? architecturePage };
        const title = permissionKind === 'ontology-patch'
          ? 'mcp__atlas-vault__patch_concept'
          : filePermission ? `Write ${targetPath}` : 'mcp__atlas-vault__write_wiki_file';
        update({ sessionUpdate: "tool_call", toolCallId: "write-architecture", title, kind: "edit", status: "pending", _meta: { is_mcp_tool_call: !filePermission }, rawInput: filePermission ? rawInput : { server: "atlas-vault", tool: "write_wiki_file", arguments: rawInput } });
        permissionId = 902;
        acp({ jsonrpc: "2.0", id: permissionId, method: "session/request_permission", params: { sessionId, _meta: { is_mcp_tool_approval: !filePermission }, options: [{ kind: "reject_once", optionId: "reject", name: "Reject" }, { kind: "allow_once", optionId: "allow", name: "Allow once" }], toolCall: { toolCallId: "write-architecture", title, kind: "edit", rawInput } } });
      };
      const emitWrite = () => {
        if (phase !== "approved" || initialScenario !== "successful-write") return;
        write("wiki/architecture.md", architecturePage);
        phase = "written";
        update({ sessionUpdate: "tool_call_update", toolCallId: "write-architecture", status: "completed", rawOutput: { ok: true } });
      };
      const finish = () => {
        if (phase === "finished" || promptId === null) return;
        if (phase !== "written") {
          update({ sessionUpdate: "tool_call_update", toolCallId: "write-architecture", status: "failed", rawOutput: { error: "write rejected or not observed" } });
        }
        phase = "finished";
        update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Work finished." } });
        result(promptId, { stopReason: initialScenario === "successful-write" && Object.keys(files).includes("wiki/architecture.md") ? "end_turn" : "tool_rejected" });
        promptId = null;
      };
      const answer = (text: string) => {
        if (promptId === null) return;
        phase = "finished";
        update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
        result(promptId, { stopReason: "end_turn" });
        promptId = null;
      };
      const handleClientMessage = (message: JsonRecord) => {
        const method = typeof message.method === "string" ? message.method : undefined;
        const id = jsonRpcId(message.id);
        calls.push({ method: method ?? "response", params: message });
        if (method === "initialize" && id !== null) return result(id, { protocolVersion: 1, agentCapabilities: { loadSession: false, promptCapabilities: {} } });
        if (method === "session/list" && id !== null) return result(id, { sessions: [] });
        if (method === "session/new" && id !== null) return result(id, { sessionId, modes: { availableModes: [{ id: "default", name: "Default" }], currentModeId: "default" }, models: { availableModels: [], currentModelId: null } });
        if (method === 'session/cancel') {
          if (id !== null) result(id, {});
          if (promptId !== null) { result(promptId, { stopReason: 'cancelled' }); promptId = null; phase = 'finished'; }
          return;
        }
        if ((method === "session/set_mode" || method === "session/set_model") && id !== null) return result(id, {});
        if (method === "session/prompt" && id !== null) { promptId = id; return; }
        if (id === permissionId && phase === "waiting") {
          const response = record(message.result);
          const outcome = record(response?.outcome);
          const allowed = outcome?.optionId === "allow" && initialScenario === "successful-write";
          phase = allowed ? "approved" : "rejected";
        }
      };
      const jsonContent = (value: unknown): unknown => {
        if (typeof value !== "string") return value;
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      };
      const modelMessages = (requestBody: unknown): JsonRecord[] => {
        const request = record(jsonContent(requestBody));
        if (!request || !Array.isArray(request.messages)) return [];
        return request.messages
          .map((message) => record(message))
          .filter((message): message is JsonRecord => message !== null);
      };
      const modelVisibleWikiPayloads = (requestBody: unknown): JsonRecord[] =>
        modelMessages(requestBody)
          .filter((message) => message.role === "tool")
          .map((message) => jsonContent(message.content))
          .filter((payload): payload is JsonRecord => {
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
            const object = payload as JsonRecord;
            return (typeof object.slug === "string" && object.slug.startsWith("wiki/"))
              || (typeof object.path === "string" && object.path.startsWith("wiki/"));
          });
      const fillModelPlaceholders = (scripted: string, requestBody: unknown): string => {
        let response = scripted;
        const payloads = modelVisibleWikiPayloads(requestBody);
        const completeRead = [...payloads].reverse().find(
          (payload) => payload.complete === true
            && typeof payload.receipt === "string"
            && payload.receipt.length > 0,
        );
        if (response.includes("__ATLAS_READ_RECEIPT__")) {
          if (!completeRead) throw new Error("The scripted response requested a receipt before a complete model-visible Wiki read.");
          response = response.replaceAll("__ATLAS_READ_RECEIPT__", String(completeRead.receipt));
        }
        const continuedRead = [...payloads].reverse().find(
          (payload) => payload.complete !== true
            && typeof payload.nextCursor === "number"
            && Number.isSafeInteger(payload.nextCursor)
            && payload.nextCursor >= 0,
        );
        if (response.includes("__ATLAS_READ_CURSOR__")) {
          if (!continuedRead) throw new Error("The scripted response requested a cursor before an incomplete model-visible Wiki read.");
          response = response.replaceAll("__ATLAS_READ_CURSOR__", String(continuedRead.nextCursor));
        }
        return response;
      };
      const invoke = (command: string, args: JsonRecord = {}): Promise<unknown> => {
        calls.push({ method: command, params: args });
        if (command === "plugin:event|listen") { const id = Number(args.handler); const event = String(args.event); if (!callbacks.has(id)) return Promise.reject(new Error("missing event callback")); const set = listeners.get(event) ?? new Set<number>(); set.add(id); listeners.set(event, set); return Promise.resolve(id); }
        if (command === "plugin:event|unlisten") { const event = String(args.event); listeners.get(event)?.delete(Number(args.eventId)); callbacks.delete(Number(args.eventId)); return Promise.resolve(); }
        if (command === "acp_detect_runtimes") return Promise.resolve(localResponses ? [] : [runtime]);
        if (command === "llm_chat" && localResponses) {
          const scripted = localResponses[localRound++];
          if (!scripted) return Promise.reject(new Error("local fixture exhausted"));
          const body = fillModelPlaceholders(scripted, args.body);
          return Promise.resolve({ status: 200, body, host: "127.0.0.1:11434", durationMs: 1, loggedAt: new Date().toISOString() });
        }
        if (command === "secret_status") return Promise.resolve({ provider: args.provider, stored: false, last4: null });
        if (command === "acp_start") return Promise.resolve(sessionId);
        if (command === "acp_stop" || command === "start_vault_watch" || command === "ensure_vault_directory") return Promise.resolve(null);
        if (command === "acp_send") { try { const message: unknown = JSON.parse(String(args.line ?? "")); const parsed = record(message); if (parsed) handleClientMessage(parsed); } catch {} return Promise.resolve(null); }
        if (command === "acp_permission_verdict") return Promise.resolve("ask");
        if (command === "mcp_bundled_server") return Promise.resolve({ path: mcpBinary, available: true, reason: null });
        if (command === "discover_mcp_connectors") return Promise.resolve({ servers: [], problems: [] });
        if (command === "discover_source_candidates") return Promise.resolve({ candidates: [], truncated: false, unreadableRoots: [] });
        if (command === "pick_vault_directory") return Promise.resolve(vaultRoot);
        if (command === "vault_path_exists") { const path = relative(args.relativePath); return Promise.resolve(args.kind === "directory" ? path === "" || [...directories].some((directory) => directory === path) || Object.keys(files).some((file) => file.startsWith(`${path}/`)) : path in files); }
        if (command === "vault_fingerprint") return Promise.resolve(fingerprint());
        if (command === "hash_vault_files") return Promise.all((args.relativePaths as string[]).map(async (relativePath) => {
          const text = files[relativePath];
          if (text === undefined) return { relativePath, sha256: null };
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
          return { relativePath, sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") };
        }));
        if (command === "list_vault_directory") { const directory = relative(args.relativePath); const prefix = directory ? `${directory}/` : ""; const entries = new Map<string, "file" | "directory">(); for (const file of Object.keys(files)) { if (!file.startsWith(prefix)) continue; const rest = file.slice(prefix.length); if (!rest) continue; const [name, child] = rest.split("/"); entries.set(name, child ? "directory" : "file"); } return Promise.resolve([...entries].map(([name, kind]) => ({ name, kind }))); }
        if (command === "read_vault_text_file") { const path = relative(args.relativePath); if (!(path in files)) return Promise.reject(new Error(`missing ${path}`)); return Promise.resolve({ text: files[path], lastModified: mtimes[path] ?? nextMtime }); }
        if (command === "read_vault_binary_file") { const path = relative(args.relativePath); if (!(path in files)) return Promise.reject(new Error(`missing ${path}`)); return Promise.resolve({ bytes: [...new TextEncoder().encode(files[path])], lastModified: mtimes[path] ?? nextMtime }); }
        if (command === "create_vault_text_file") {
          const path = relative(args.relativePath);
          if (Object.prototype.hasOwnProperty.call(files, path)) return Promise.resolve(false);
          write(path, String(args.content ?? ""));
          return Promise.resolve(true);
        }
        if (command === "write_vault_text_file") { write(relative(args.relativePath), String(args.content ?? "")); return Promise.resolve(null); }
        if (command === "remove_vault_entry") {
          const path = relative(args.relativePath);
          delete files[path]; delete mtimes[path]; nextMtime += 1;
          emit("vault-changed", {});
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`no stub for ${command}`));
      };
      fixtureWindow.isTauri = true;
      fixtureWindow.__TAURI_INTERNALS__ = { transformCallback: (callback: EventCallback) => { const id = callbackId++; callbacks.set(id, callback); return id; }, invoke };
      fixtureWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (event: string, id: number) => { listeners.get(event)?.delete(id); callbacks.delete(id); } };
      fixtureWindow.__atlasLibraryWorkHarness = { emitRead, emitWait, emitWrite, finish, answer, mutateSource: write, snapshot: () => ({ files: { ...files }, writes: [...writes], calls: [...calls], events: [...events], scenario: initialScenario }) };
    },
    { initialFiles: options.files ?? VAULT_FILES, initialScenario: scenario, vaultRoot: VAULT_ROOT, runtime, architecturePage: ARCHITECTURE_PAGE, permissionFile: options.permissionFile, permissionText: options.permissionText, permissionKind: options.permissionKind ?? 'wiki', writeMode: options.writeMode ?? 'ask', filePermission: options.filePermission ?? false, mcpBinary: LIBRARY_WORK_MCP_BINARY, localResponses: options.localResponses },
  );
  const call = (currentPage: Page, method: "emitRead" | "emitWait" | "emitWrite" | "finish") => currentPage.evaluate((name) => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.[name](), method);
  return { snapshot: (currentPage) => currentPage.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).__atlasLibraryWorkHarness;
    if (!harness) throw new Error("Library work harness is not installed");
    return harness.snapshot();
  }), read: (currentPage) => call(currentPage, "emitRead"), wait: (currentPage) => call(currentPage, "emitWait"), write: async (currentPage) => {
    await currentPage.waitForFunction(() => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls.some((entry) => {
      const asRecord = (value: unknown): JsonRecord | null => typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as JsonRecord
        : null;
      const response = asRecord(entry.params);
      const outcome = asRecord(response?.result);
      const decision = asRecord(outcome?.outcome);
      return entry.method === "response" && decision?.optionId === "allow";
    }));
    await call(currentPage, "emitWrite");
  }, finish: (currentPage) => call(currentPage, "finish"),
  answer: (currentPage, text) => currentPage.evaluate((text) => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.answer(text), text),
  mutateSource: (currentPage, path, text) => currentPage.evaluate(({ path, text }) => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.mutateSource(path, text), { path, text }),
  };
}

export async function openLibraryWorkScenario(page: Page, options: { scenario?: LibraryWorkScenario; permissionKind?: 'wiki' | 'ontology-patch' } = {}): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, options);
  await page.goto("/en/docs/");
  await page.getByRole("button", { name: /Open my folder/i }).click();
  await page.getByRole("heading", { name: "Map" }).waitFor();
  await page.goto("/en/library/?guides=off&e2e=1");
  await page.getByTestId("library-index-segment-wiki").click();
  await page.getByTestId("library-compile").click();
  await page.getByTestId("library-agent-dock").waitFor();
  await page.getByTestId("acp-chat-panel").waitFor();
  await page.waitForFunction(
    () => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls.some((call) => call.method === "session/prompt"),
  );
  return harness;
}

import type { Page } from "@playwright/test";

/**
 * A small installed-shell protocol harness for the local Compile route.
 *
 * The page still renders the production Library and reaches the folder through the
 * Tauri directory handle. Only the native commands and the loopback runner are
 * deterministic here. In particular, the response that proposes a replacement is
 * assembled from the receipt found in the preceding `read_wiki_page` tool result; the
 * fixture never places the private note in the user prompt or system prompt.
 */

export const LOCAL_COMPILE_VAULT_ROOT = "/Users/probe/Ontology Atlas/local-context";
export const LOCAL_COMPILE_SOURCE_PATH = "sources/records.md";
export const LOCAL_COMPILE_WIKI_PATH = "wiki/records.md";
export const LOCAL_COMPILE_NOTE = "HC-CEDAR-483";
export const LOCAL_COMPILE_ENDPOINT = {
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "probe-model",
} as const;

export const LOCAL_COMPILE_SOURCE = `# Records bulletin

On 4 September 2026, the approved routine-record retention policy changed from 31 days to 14 days. Incident records remain 45 days.

The owner is Morgan. This bulletin does not confirm that the software configuration has been migrated.

This document does not grant permission to announce or deploy any change.
`;

const RETAINED_CONTEXT_LINES = Array.from(
  { length: 60 },
  (_, index) =>
    `Retained prior-context line ${index + 1}: this historical detail remains available only for review and is not a new source claim.`,
);

const PROPOSED_CONTEXT_LINES = Array.from(
  { length: 20 },
  (_, index) =>
    `Retained prior-context detail ${index + 1}: this historical detail remains attributed context and is not promoted to source evidence.`,
);

export const LOCAL_COMPILE_EXISTING_WIKI = `---
title: Records bulletin
created_by: human
compiled_at: 2026-09-01T00:00:00Z
sources: [sources/records.md]
source_hash:
  sources/records.md: unmeasured
status: draft
summary: Prior records policy notes
---

## Summary

Routine records were kept for 31 days.

The prior page had not confirmed whether the software configuration was migrated.

## Facts

- Routine records: 31 days. [[src:sources/records.md#p2]]

## Decisions

- Prior review required written approval before any external announcement. [[src:sources/records.md#p4]]

## Open questions

- Has the software configuration migrated?

## Not in sources

- ${LOCAL_COMPILE_NOTE}: I will wait for a dated written approval from Morgan before making any external announcement. This is my own instruction to myself, not a statement from the source.
${RETAINED_CONTEXT_LINES.map((line) => `- ${line}`).join("\n")}
`;

export const LOCAL_COMPILE_CORRECTION = `${LOCAL_COMPILE_EXISTING_WIKI}
Human correction made while the consent card was open.
`;

export const LOCAL_COMPILE_RETAINED_PATH = 'wiki/answers/saved-question.md';
export const LOCAL_COMPILE_RETAINED = `---
title: Saved retention question
created_by: human
compiled_at: 2026-09-01T00:00:00Z
sources: [sources/records.md]
source_hash:
  sources/records.md: unmeasured
status: draft
summary: A separately retained answer.
answer_thread: wiki/answers/saved-question
---
## Summary
A separately retained answer.
## Facts
## Decisions
## Open questions
Migration remains unconfirmed.
## Not in sources
`;

const INITIAL_FILES: Record<string, string> = {
  "project.md": `---
uid: 00000000-0000-4000-8000-000000000001
kind: project
title: Local context
slug: local-context
---

# Local context
`,
  [LOCAL_COMPILE_SOURCE_PATH]: LOCAL_COMPILE_SOURCE,
  [LOCAL_COMPILE_WIKI_PATH]: LOCAL_COMPILE_EXISTING_WIKI,
  [LOCAL_COMPILE_RETAINED_PATH]: LOCAL_COMPILE_RETAINED,
};

type JsonRecord = Record<string, unknown>;
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
  __atlasLocalCompileHarness?: {
    snapshot(): LocalCompileHarnessSnapshot;
    mutateExisting(path: string, text: string, sameTimestamp: boolean): void;
  };
}

export interface LocalCompileHarnessCall {
  method: string;
  params?: unknown;
}

export interface LocalCompileHarnessRequest {
  round: number;
  rawBody: string;
  body: unknown;
  scope: unknown;
}

export interface LocalCompileHarnessResponse {
  round: number;
  body: unknown;
}

export interface LocalCompileHarnessWrite {
  relativePath: string;
  content: string;
  mtime: number;
}

export interface LocalCompileHarnessSnapshot {
  files: Record<string, string>;
  mtimes: Record<string, number>;
  writes: LocalCompileHarnessWrite[];
  calls: LocalCompileHarnessCall[];
  requests: LocalCompileHarnessRequest[];
  responses: LocalCompileHarnessResponse[];
  receipt: unknown;
}

export interface LocalCompileHarness {
  snapshot(page: Page): Promise<LocalCompileHarnessSnapshot>;
  mutateExisting(page: Page, text: string, sameTimestamp?: boolean): Promise<void>;
}

/** Install a Tauri directory plus loopback `llm_chat` seam for one browser context. */
export async function installLocalCompileHarness(
  page: Page,
  options: { files?: Record<string, string>; extraFiles?: Record<string, string>; detectedRuntime?: 'claude-acp' | 'codex-acp' } = {},
): Promise<LocalCompileHarness> {
  await page.addInitScript(
    ({ initialFiles, rootPath, endpoint, sourcePath, wikiPath, note, proposedContextLines, detectedRuntime }) => {
      const fixtureWindow = window as unknown as HarnessWindow;
      const files: Record<string, string> = { ...initialFiles };
      const mtimes: Record<string, number> = {};
      const directories = new Set([".", ".ontology-atlas", "sources", "wiki"]);
      const calls: LocalCompileHarnessCall[] = [];
      const writes: LocalCompileHarnessWrite[] = [];
      const requests: LocalCompileHarnessRequest[] = [];
      const responses: LocalCompileHarnessResponse[] = [];
      const callbacks = new Map<number, EventCallback>();
      const listeners = new Map<string, Set<number>>();
      const encoder = new TextEncoder();
      const initialMtime = 1_757_000_000_000;
      let nextMtime = initialMtime;
      let callbackId = 1;
      let receipt: unknown = null;

      for (const path of Object.keys(files)) mtimes[path] = initialMtime;

      // This is the source-defined preference key used by readLocalEndpoint().
      window.localStorage.setItem("ontology-atlas:local-endpoint", JSON.stringify(endpoint));
      // Keep the person's local choice even when another installed runtime is available.
      window.localStorage.setItem("ontology-atlas:compile-brain", 'local');

      const record = (value: unknown): JsonRecord | null =>
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as JsonRecord)
          : null;

      const listDirectory = (relative: string) => {
        const prefix = relative ? `${relative}/` : "";
        const seen = new Map<string, "file" | "directory">();
        for (const path of Object.keys(files)) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          if (!rest) continue;
          const slash = rest.indexOf("/");
          if (slash < 0) seen.set(rest, "file");
          else seen.set(rest.slice(0, slash), "directory");
        }
        return [...seen].map(([name, kind]) => ({ name, kind }));
      };

      const relative = (value: unknown) => {
        if (typeof value !== "string") return "";
        if (value === rootPath) return "";
        return value.startsWith(`${rootPath}/`) ? value.slice(rootPath.length + 1) : value;
      };

      const fingerprint = () => ({
        entries: Object.entries(files)
          .filter(([path]) => path.endsWith(".md") || path.startsWith("sources/"))
          .map(([relativePath, text]) => ({
            relativePath,
            lastModified: mtimes[relativePath] ?? nextMtime,
            size: encoder.encode(text).length,
          })),
        truncated: false,
        prunedDirs: [],
      });

      const digest = async (text: string): Promise<string> => {
        const hash = await crypto.subtle.digest("SHA-256", encoder.encode(text));
        return [...new Uint8Array(hash)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      };

      const emit = (event: string, payload: unknown) => {
        for (const id of listeners.get(event) ?? []) {
          callbacks.get(id)?.({ event, payload });
        }
      };

      const write = (path: string, content: string) => {
        nextMtime += 1;
        files[path] = content;
        mtimes[path] = nextMtime;
        writes.push({ relativePath: path, content, mtime: nextMtime });
        emit("vault-changed", {});
      };

      const jsonContent = (content: unknown): unknown => {
        if (typeof content !== "string") return content;
        try {
          return JSON.parse(content);
        } catch {
          return content;
        }
      };

      // Receipts may be nested under snapshot/chunk metadata. Find the named value without
      // making the test depend on the surrounding explanatory fields.
      const findReceipt = (value: unknown): unknown => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
        const object = value as JsonRecord;
        for (const [key, child] of Object.entries(object)) {
          if (/receipt/i.test(key) && child !== null && child !== "") return child;
        }
        for (const child of Object.values(object)) {
          const nested = findReceipt(child);
          if (nested !== undefined) return nested;
        }
        return undefined;
      };

      const completion = (toolCalls: Array<{ id: string; name: string; args: unknown }>, text = "") =>
        JSON.stringify({
          choices: [
            {
              finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
              message: {
                role: "assistant",
                content: text,
                ...(toolCalls.length > 0
                  ? {
                      tool_calls: toolCalls.map((call) => ({
                        id: call.id,
                        type: "function",
                        function: { name: call.name, arguments: JSON.stringify(call.args) },
                      })),
                    }
                  : {}),
              },
            },
          ],
        });

      const messagesOf = (body: JsonRecord): JsonRecord[] =>
        (Array.isArray(body.messages) ? body.messages : [])
          .map((message) => record(message))
          .filter((message): message is JsonRecord => message !== null);

      const latestWikiResult = (body: JsonRecord): { message: JsonRecord; payload: JsonRecord } | null => {
        for (const message of messagesOf(body).reverse()) {
          if (message.role !== "tool") continue;
          const payload = jsonContent(message.content);
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
          const object = payload as JsonRecord;
          if (object.path === wikiPath || object.slug === "wiki/records") {
            return { message, payload: object };
          }
        }
        return null;
      };

      const hasProposalResult = (body: JsonRecord): boolean =>
        messagesOf(body).some((message) => {
          if (message.role !== "tool") return false;
          const payload = jsonContent(message.content);
          return payload && typeof payload === "object" && !Array.isArray(payload) && (payload as JsonRecord).proposed === true;
        });

      const proposalArgsFromRequest = (body: JsonRecord): JsonRecord => {
        const wikiResult = latestWikiResult(body);
        if (!wikiResult) throw new Error("The proposal request did not carry read_wiki_page output.");
        const existingReceipt = findReceipt(wikiResult.payload);
        if (existingReceipt === undefined) {
          throw new Error("The read_wiki_page result did not carry a receipt.");
        }
        receipt = existingReceipt;
        return {
          slug: "records",
          title: "Records bulletin",
          summary: "The current routine-record policy and its remaining migration question.",
          overview: [
            "Routine-record retention changed, while the migration state remains open.",
            "The prior human note is retained as context rather than treated as source evidence.",
          ],
          facts: [
            `Routine records changed from 31 days to 14 days. [[src:${sourcePath}#p2]]`,
            `Morgan is named as the owner. [[src:${sourcePath}#p3]]`,
          ],
          decisions: [
            `The bulletin does not grant permission to announce or deploy a change. [[src:${sourcePath}#p4]]`,
          ],
          open_questions: ["Whether the software configuration has migrated remains unconfirmed."],
          not_in_sources: [
            `${note}: I will wait for a dated written approval from Morgan before making any external announcement. This is an attributed prior human note, not a source-backed fact.`,
            ...proposedContextLines,
          ],
          receipt: existingReceipt,
        };
      };

      const responseFor = (body: JsonRecord, round: number): string => {
        if (round === 1) {
          return completion([
            {
              id: "read-source",
              name: "read_source_text",
              args: { path: sourcePath },
            },
          ]);
        }
        if (round === 2) {
          return completion([
            { id: "read-wiki", name: "read_wiki_page", args: { slug: "records" } },
          ]);
        }
        if (hasProposalResult(body)) return completion([], "Finished.");
        const wikiResult = latestWikiResult(body);
        if (wikiResult && wikiResult.payload.complete !== true) {
          const nextCursor = wikiResult.payload.nextCursor;
          if (typeof nextCursor !== "number") throw new Error("The incomplete Wiki result had no cursor.");
          return completion([
            { id: "read-wiki-next", name: "read_wiki_page", args: { slug: "records", cursor: nextCursor } },
          ]);
        }
        if (wikiResult?.payload.complete === true) {
          return completion([
            {
              id: "propose-records",
              name: "propose_wiki_page",
              args: proposalArgsFromRequest(body),
            },
          ]);
        }
        return completion([], "Finished.");
      };

      const invoke = (command: string, args: JsonRecord = {}): Promise<unknown> => {
        calls.push({ method: command, params: args });
        try {
          if (command === "plugin:event|listen") {
            const id = Number(args.handler);
            const event = String(args.event);
            if (!callbacks.has(id)) throw new Error(`Missing callback ${id}`);
            const eventListeners = listeners.get(event) ?? new Set<number>();
            eventListeners.add(id);
            listeners.set(event, eventListeners);
            return Promise.resolve(id);
          }
          if (command === "plugin:event|unlisten") {
            const event = String(args.event);
            listeners.get(event)?.delete(Number(args.eventId));
            return Promise.resolve();
          }
          if (command === "pick_vault_directory") return Promise.resolve(rootPath);
          if (command === "list_vault_directory") {
            return Promise.resolve(listDirectory(relative(args.relativePath)));
          }
          if (command === "vault_path_exists") {
            const path = relative(args.relativePath);
            if (args.kind === "directory") {
              return Promise.resolve(
                path === "" ||
                  directories.has(path) ||
                  Object.keys(files).some((file) => file.startsWith(`${path}/`)),
              );
            }
            return Promise.resolve(path in files);
          }
          if (command === "read_vault_text_file") {
            const path = relative(args.relativePath);
            if (!(path in files)) return Promise.reject(new Error(`missing ${path}`));
            return Promise.resolve({ text: files[path], lastModified: mtimes[path] ?? nextMtime });
          }
          if (command === "read_vault_binary_file") {
            const path = relative(args.relativePath);
            if (!(path in files)) return Promise.reject(new Error(`missing ${path}`));
            const body = encoder.encode(files[path]!);
            const stamped = new Uint8Array(8 + body.length);
            new DataView(stamped.buffer).setBigUint64(0, BigInt(mtimes[path] ?? nextMtime), true);
            stamped.set(body, 8);
            return Promise.resolve(stamped.buffer);
          }
          if (command === "vault_fingerprint") return Promise.resolve(fingerprint());
          if (command === "hash_vault_files") {
            const paths = Array.isArray(args.relativePaths) ? args.relativePaths : [];
            return Promise.all(
              paths.map(async (path) => ({
                relativePath: String(path),
                sha256: files[String(path)] === undefined ? null : await digest(files[String(path)]!),
              })),
            );
          }
          if (command === "write_vault_text_file") {
            write(relative(args.relativePath), String(args.content ?? ""));
            return Promise.resolve(null);
          }
          if (command === "create_vault_text_file") {
            const path = relative(args.relativePath);
            if (path in files) return Promise.resolve(false);
            write(path, String(args.content ?? ""));
            return Promise.resolve(true);
          }
          if (command === "ensure_vault_directory") {
            directories.add(relative(args.relativePath));
            return Promise.resolve(null);
          }
          if (command === "remove_vault_entry") {
            const path = relative(args.relativePath);
            delete files[path];
            delete mtimes[path];
            emit("vault-changed", {});
            return Promise.resolve(null);
          }
          if (command === "start_vault_watch") return Promise.resolve(null);
          if (command === "log_webview_error") return Promise.resolve(null);
          if (command === "vault_node_revisions") return Promise.resolve([]);
          if (command === "secret_status") {
            return Promise.resolve({ provider: args.provider, stored: false, last4: null });
          }
          if (command === "discover_source_candidates") {
            return Promise.resolve({ candidates: [], truncated: false, unreadableRoots: [] });
          }
          if (command === "discover_mcp_connectors") {
            return Promise.resolve({ servers: [], problems: [] });
          }
          if (command === "mcp_bundled_server") {
            return Promise.resolve(detectedRuntime
              ? { path: '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp', available: true, reason: null }
              : { path: null, available: false, reason: "local fixture" });
          }
          if (command === "acp_detect_runtimes") return Promise.resolve(detectedRuntime ? [{
            id: detectedRuntime, label: detectedRuntime === 'codex-acp' ? 'Codex' : 'Claude Agent',
            state: 'ready', verified: true, isolated: true, launchKind: 'npx',
            cliPath: detectedRuntime === 'codex-acp' ? '/opt/homebrew/bin/codex' : '/opt/homebrew/bin/claude',
            adapterPackage: detectedRuntime === 'codex-acp' ? '@agentclientprotocol/codex-acp@1.10.0' : '@agentclientprotocol/claude-agent-acp@0.75.1',
          }] : []);
          if (command === "llm_chat") {
            const body = String(args.body ?? "");
            const parsed = JSON.parse(body) as JsonRecord;
            const round = requests.length + 1;
            requests.push({ round, rawBody: body, body: parsed, scope: args.scope ?? null });
            const reply = responseFor(parsed, round);
            responses.push({ round, body: JSON.parse(reply) });
            return Promise.resolve({
              status: 200,
              body: reply,
              host: "127.0.0.1:11434",
              durationMs: 0,
              loggedAt: "2026-09-11T00:00:00.000Z",
            });
          }
          if (command === "acp_start") return Promise.reject(new Error("ACP is disabled in local fixture"));
          if (command === "acp_stop" || command === "acp_send") return Promise.resolve(null);
          return Promise.reject(new Error(`No local Compile stub for ${command}`));
        } catch (error) {
          return Promise.reject(error);
        }
      };

      fixtureWindow.isTauri = true;
      fixtureWindow.__TAURI_INTERNALS__ = {
        transformCallback: (callback: EventCallback) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        invoke,
      };
      fixtureWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (event: string, id: number) => {
          listeners.get(event)?.delete(id);
          callbacks.delete(id);
        },
      };
      fixtureWindow.__atlasLocalCompileHarness = {
        snapshot: () => ({
          files: { ...files },
          mtimes: { ...mtimes },
          writes: [...writes],
          calls: [...calls],
          requests: [...requests],
          responses: [...responses],
          receipt,
        }),
        mutateExisting: (path: string, text: string, sameTimestamp: boolean) => {
          files[path] = text;
          if (!sameTimestamp) {
            nextMtime += 1;
            mtimes[path] = nextMtime;
          }
        },
      };
    },
    {
      initialFiles: { ...(options.files ?? INITIAL_FILES), ...options.extraFiles },
      detectedRuntime: options.detectedRuntime ?? null,
      rootPath: LOCAL_COMPILE_VAULT_ROOT,
      endpoint: LOCAL_COMPILE_ENDPOINT,
      sourcePath: LOCAL_COMPILE_SOURCE_PATH,
      wikiPath: LOCAL_COMPILE_WIKI_PATH,
      note: LOCAL_COMPILE_NOTE,
      proposedContextLines: PROPOSED_CONTEXT_LINES,
    },
  );

  return {
    snapshot: (currentPage) =>
      currentPage.evaluate(() => {
        const harness = (window as unknown as HarnessWindow).__atlasLocalCompileHarness;
        if (!harness) throw new Error("Local Compile harness is not installed");
        return harness.snapshot();
      }),
    mutateExisting: (currentPage, text, sameTimestamp = true) =>
      currentPage.evaluate(
        ({ path, text: nextText, sameTimestamp: preserveTimestamp }) => {
          const harness = (window as unknown as HarnessWindow).__atlasLocalCompileHarness;
          if (!harness) throw new Error("Local Compile harness is not installed");
          harness.mutateExisting(path, nextText, preserveTimestamp);
        },
        { path: LOCAL_COMPILE_WIKI_PATH, text, sameTimestamp },
      ),
  };
}

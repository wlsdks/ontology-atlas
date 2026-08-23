'use client';

import {
  LOCAL_DEFAULT_BASE_URL,
  LOCAL_PROVIDER,
  type LlmVerifyResult,
} from './tauri-secrets';

/**
 * Client-side knowledge for the "Connect by address" path — where to
 * send requests, which model to use, and **why** a verify attempt failed.
 *
 * **Why localStorage.** The surface contract (`.claude/rules/surfaces.md`) already
 * splits this three ways: secrets in the keychain, preferences in localStorage, facts
 * that must cross surfaces in the vault. A runner address and the chosen model are
 * **not secrets** (this path has no key) and not vault facts — they describe what is
 * running on *this* machine, so carrying them to another machine would make them
 * wrong. Preferences is the right slot.
 *
 * **Why the model list is not stored.** The runner is the source of truth for it. A
 * stored list means one `ollama rm` leaves the screen offering a model that no longer
 * exists. The list is re-fetched from the runner on every verify connection
 * press — one request answering all three of "is it up", "is it
 * compatible" and "what can I pick".
 */

const STORAGE_KEY = 'ontology-atlas:local-endpoint';

export interface LocalEndpointSettings {
  /** The runner's base URL. Empty means this path is not configured yet. */
  baseUrl: string;
  /** The model the user picked from the list. Empty string until they pick. */
  model: string;
}

export const EMPTY_LOCAL_ENDPOINT: LocalEndpointSettings = {
  baseUrl: LOCAL_DEFAULT_BASE_URL,
  model: '',
};

/**
 * Is this path **actually usable**. An address with no model chosen is not configured:
 * sending anyway kills the first round trip with "model is required", and the user has
 * no way to tell what they left out.
 */
export function isLocalEndpointReady(settings: LocalEndpointSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.model.trim().length > 0;
}

export function readLocalEndpoint(): LocalEndpointSettings {
  if (typeof window === 'undefined') return EMPTY_LOCAL_ENDPOINT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LOCAL_ENDPOINT;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_LOCAL_ENDPOINT;
    const record = parsed as Record<string, unknown>;
    return {
      baseUrl:
        typeof record.baseUrl === 'string' && record.baseUrl.trim()
          ? record.baseUrl.trim()
          : LOCAL_DEFAULT_BASE_URL,
      model: typeof record.model === 'string' ? record.model.trim() : '',
    };
  } catch {
    // A corrupt value can render as an absent one — the user's next action (re-check
    // the address, press verify) is identical either way.
    return EMPTY_LOCAL_ENDPOINT;
  }
}

export function writeLocalEndpoint(settings: LocalEndpointSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl: settings.baseUrl.trim(), model: settings.model.trim() }),
    );
  } catch {
    // A failed write is no reason to block the screen — this session keeps using the value.
  }
  notifyLocalEndpointChange();
}

export function clearLocalEndpoint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Ignored for the same reason. */
  }
  notifyLocalEndpointChange();
}

/**
 * Signal that the settings just changed — same reason as `subscribeSecretChange` on the
 * keychain side. The address is entered in one place (the settings sheet) and comes
 * alive in another (the map's right dock); without a signal the user has to reload.
 */
const LOCAL_ENDPOINT_CHANGE_EVENT = 'ontology-atlas:local-endpoint-change';

function notifyLocalEndpointChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LOCAL_ENDPOINT_CHANGE_EVENT));
}

export function subscribeLocalEndpointChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCAL_ENDPOINT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(LOCAL_ENDPOINT_CHANGE_EVENT, handler);
}

/**
 * Can the name alone prove this model **cannot hold a conversation**.
 *
 * OpenAI-compatible `/v1/models` does not carry that fact — only Ollama's native
 * `/api/tags` has `capabilities`, and fetching it would turn one verify press into two
 * requests, so **the audit log and the screen would disagree** (one press, one logged
 * line). The verdict therefore comes from the name only, and returns true **only where
 * it is certain**.
 *
 * Two branches. ① The name contains `embed` — catches `embeddinggemma`,
 * `nomic-embed-text`, `mxbai-embed-large`, `snowflake-arctic-embed`,
 * `granite-embedding`, `qwen3-embedding`, `text-embedding-3-*`. ② Known families that
 * emit embeddings without the word `embed` — `bge-*`, `gte-*`, `e5-*`, `all-minilm`,
 * `paraphrase-multilingual`.
 *
 * **False-positive risk**: a chat-capable model starting with one of those prefixes
 * would be pushed to the end of the list and labelled "embedding only", which is wrong.
 * No such model exists today, and even then it stays **selectable** — nothing is
 * removed. The other direction (an embedding model we do not know) leaves the list
 * exactly as it was before: not a regression, just a miss.
 */
export function isEmbeddingOnlyModel(name: string): boolean {
  // Strip the tag (`:latest`) — `bge-m3:latest` belongs to the same family.
  const base = (name.split(':')[0] ?? name).trim().toLowerCase();
  if (base.includes('embed')) return true;
  return EMBEDDING_ONLY_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}-`),
  );
}

/** Families that emit embeddings without the word `embed`. Prefix match only. */
const EMBEDDING_ONLY_PREFIXES = [
  'bge',
  'gte',
  'e5',
  'all-minilm',
  'paraphrase-multilingual',
];

/**
 * OpenAI-compatible `/v1/models` response → list of model names.
 *
 * Embedding-only models are **not removed**: removing them would make the screen deny
 * something that is really in the user's runner. What changes is the **order** —
 * alphabetical becomes useful-first. Alphabetical put `embeddinggemma:latest` in slot 1,
 * and the owner did pick it and got a saved "Connected" state (measured
 * 2026-08-01: 4 of the runner's 7 models were embedding-only). The defect was **a state
 * that will fail the first question being reported as success**, not the model's
 * presence in the list.
 *
 * Labelling is not hiding — rows judged to be embeddings carry a "Can't chat"
 * note via `Select`'s `description`, and a person still chooses.
 *
 * Within a tier the order is alphabetical as before. The only change is that there are
 * now two tiers, so a runner with no embedding models sees exactly the previous list.
 */
export function parseOpenAiModelList(body: string): string[] {
  try {
    const parsed: unknown = JSON.parse(body);
    const data = (parsed as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return [];
    const names = data
      .map((row) => (row as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(names)].sort((a, b) => {
      const rank = Number(isEmbeddingOnlyModel(a)) - Number(isEmbeddingOnlyModel(b));
      return rank !== 0 ? rank : a.localeCompare(b);
    });
  } catch {
    return [];
  }
}

/** How many of these are usable for chat — the count minus the certain embeddings. */
export function countChatCapableModels(models: string[]): number {
  return models.filter((model) => !isEmbeddingOnlyModel(model)).length;
}

/**
 * **Why** the verify failed — split so the screen can prescribe a different next action
 * for each. Collapsing them into one "couldn't verify" leaves the user unable to tell
 * whether to start the runner, fix the port, or evict another program from that port.
 */
export type LocalVerifyReason =
  | 'ok'
  /** Nothing answered — the runner is off, or the port is different. */
  | 'unreachable'
  /** Something answered, but it is not an OpenAI-compatible endpoint (usually another program on that port). */
  | 'not-compatible'
  /** Compatible endpoint, but no models are installed. */
  | 'no-models'
  /** Anything else — the status code / message is shown verbatim. */
  | 'failed';

export interface LocalVerifyVerdict {
  reason: LocalVerifyReason;
  models: string[];
  /** The fact the screen appends — a status code, or the one line Rust returned. */
  detail: string;
}

export function readLocalVerdict(result: LlmVerifyResult): LocalVerifyVerdict {
  if (!result.ok) {
    if (result.httpStatus === null) {
      return {
        reason: 'unreachable',
        models: [],
        detail: result.message ?? '',
      };
    }
    if (result.httpStatus === 404) {
      return { reason: 'not-compatible', models: [], detail: String(result.httpStatus) };
    }
    return {
      reason: 'failed',
      models: [],
      detail: result.message ?? String(result.httpStatus),
    };
  }
  const models = parseOpenAiModelList(result.body ?? '');
  if (models.length === 0) {
    return { reason: 'no-models', models, detail: '' };
  }
  return { reason: 'ok', models, detail: '' };
}

/** The "where did it go" that the audit log and the screen footer both state. The fact includes the port. */
export function hostOfBaseUrl(baseUrl: string): string {
  const withoutScheme = baseUrl.includes('://') ? baseUrl.split('://')[1] : baseUrl;
  return withoutScheme?.split(/[/?#]/)[0] ?? baseUrl;
}

export { LOCAL_PROVIDER };

'use client';

import {
  LOCAL_DEFAULT_BASE_URL,
  type LlmVerifyResult,
} from './tauri-secrets';

/**
 * Client-side knowledge for the "Connect by address" path. Address and chosen model are preferences
 * in localStorage (`.claude/rules/surfaces.md`): not secrets, not vault facts. The model list is not
 * stored; it is re-fetched on every verify press, or a removed model would stay offered.
 */

const STORAGE_KEY = 'ontology-atlas:local-endpoint';

export interface LocalEndpointSettings {
  /** The runner's base URL. Empty means this path is not configured yet. */
  baseUrl: string;
  /** The model the user picked from the list. Empty string until they pick. */
  model: string;
}

const EMPTY_LOCAL_ENDPOINT: LocalEndpointSettings = {
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
 * True only when the name alone proves the model cannot chat. OpenAI-compatible `/v1/models` carries
 * no capabilities, and a second request would make the audit log and the screen disagree. A false
 * positive stays selectable and merely sorts last.
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
 * OpenAI-compatible `/v1/models` response to model names. Embedding-only models are not removed,
 * only ordered after the rest, so the screen never denies a model that is in the runner. Within a
 * tier the order is alphabetical.
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


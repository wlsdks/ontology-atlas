/**
 * The local runners the models tab names (2026-09-25, owner preview: "Ollama http://localhost:11434
 * ● connected · N models [Check] / LM Studio ○ [Connect]").
 *
 * **Names for doors, not a second store.** There is still exactly one saved runner
 * (`local-endpoint.ts`: one address and one model in this machine's preferences), because the
 * conversation calls one runner. These rows only say which well-known default address a person
 * is most likely to want, so nobody has to remember that LM Studio listens on 1234. Which row is
 * "connected" is derived from the saved address, never stored beside it.
 *
 * **No row claims a runner is off without asking it.** A row that was not checked in this visit
 * says "not connected", not "off": the only way to know is a request, and every request is a
 * line in the vault's sent log, so the screen does not probe on its own.
 */
export type LocalRunnerId = 'ollama' | 'lmstudio' | 'llamacpp' | 'custom';

export interface LocalRunner {
  id: LocalRunnerId;
  /** Key under `agents.models`. */
  labelKey: 'runnerOllama' | 'runnerLmStudio' | 'runnerLlamaCpp' | 'runnerCustom';
  /** The runner's documented default address; empty for the typed one. */
  defaultBaseUrl: string;
  /**
   * The row's marker, spelled out rather than assembled: the installed-app probe
   * (`webview_verify/ai_settings_verify.js`) finds the typed row by it, and the probe-marker
   * contract counts only a marker that exists literally in the product source.
   */
  rowTestId: string;
}

export const LOCAL_RUNNERS: readonly LocalRunner[] = [
  { id: 'ollama', labelKey: 'runnerOllama', defaultBaseUrl: 'http://localhost:11434', rowTestId: 'ai-provider-local-ollama' },
  { id: 'lmstudio', labelKey: 'runnerLmStudio', defaultBaseUrl: 'http://localhost:1234', rowTestId: 'ai-provider-local-lmstudio' },
  { id: 'llamacpp', labelKey: 'runnerLlamaCpp', defaultBaseUrl: 'http://localhost:8080', rowTestId: 'ai-provider-local-llamacpp' },
  { id: 'custom', labelKey: 'runnerCustom', defaultBaseUrl: '', rowTestId: 'ai-provider-local-custom' },
];

/**
 * One spelling per address: trailing slashes and a trailing `/v1` do not make a different runner
 * (`http://localhost:1234/v1/` is LM Studio's own documented form), and the scheme and host are
 * case-insensitive.
 */
export function normalizeRunnerBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (url.toLowerCase().endsWith('/v1')) url = url.slice(0, -3).replace(/\/+$/, '');
  const scheme = url.indexOf('://');
  if (scheme < 0) return url;
  const authorityEnd = url.indexOf('/', scheme + 3);
  const head = authorityEnd < 0 ? url : url.slice(0, authorityEnd);
  const tail = authorityEnd < 0 ? '' : url.slice(authorityEnd);
  return head.toLowerCase() + tail;
}

/** Which row a saved address belongs to. An address that is none of the defaults is the typed row. */
export function runnerForBaseUrl(baseUrl: string): LocalRunnerId {
  const normalized = normalizeRunnerBaseUrl(baseUrl);
  if (!normalized) return 'custom';
  const preset = LOCAL_RUNNERS.find(
    (runner) => runner.defaultBaseUrl && normalizeRunnerBaseUrl(runner.defaultBaseUrl) === normalized,
  );
  return preset ? preset.id : 'custom';
}

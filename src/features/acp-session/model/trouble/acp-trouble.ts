/** Translates adapter output into one sentence plus a next step. Only known shapes are translated: a plausible mistranslation is worse than the searchable original, which stays folded away. */

type AcpTroubleKind = 'limit' | 'auth' | 'install' | 'timeout' | 'launch' | 'network' | 'unknown';

export interface AcpTrouble {
  kind: AcpTroubleKind;
  detail: string;
}

// The tool's own plan limit, not the app: retrying cannot work until the hour in the message.
const LIMIT = /rate[_ ]?limit|session limit|usage limit|quota|too many requests|429/i;
// Wording differs per adapter (claude `authentication_failed`, others `Authentication required`).
const AUTH = /authentication[_ ]?(failed|required)|oauth|not logged ?in|unauthorized|401/i;
/**
 * An interrupted first download leaves a half-built npx cache. Matches an `_npx/<hex>` path
 * or npm's "could not read package.json". The app self-heals it
 * (`src-tauri/src/acp/launch/npx_cache.rs`), so the next step is a new conversation.
 */
const INSTALL = /_npx[\\/][0-9a-f]{4,16}|could not read package\.json/i;
const TIMEOUT = /acp-timeout|timed? ?out|ETIMEDOUT/i;
const LAUNCH = /ENOENT|command not found|spawn|cli-missing|node-missing|npx-missing|binary-missing/i;
const NETWORK = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|fetch failed|offline/i;

/** `diagnostics` are stderr lines and count only for install, where the error string says nothing (`acp session closed`); other kinds would misclassify on a passing word like "network". */
export function readAcpTrouble(raw: string, diagnostics: readonly string[] = []): AcpTrouble {
  const detail = raw.trim();
  const stderrClues = diagnostics.join('\n');
  // The order is the contract: the more specific comes first (an authentication message containing "network" is still
  // authentication). Install precedes launch: for the same ENOENT their next steps differ.
  const kind: AcpTroubleKind = LIMIT.test(detail)
    ? 'limit'
    : AUTH.test(detail)
    ? 'auth'
    : INSTALL.test(detail) || INSTALL.test(stderrClues)
      ? 'install'
      : TIMEOUT.test(detail)
        ? 'timeout'
        : LAUNCH.test(detail)
          ? 'launch'
          : NETWORK.test(detail)
            ? 'network'
            : 'unknown';
  return { kind, detail };
}

// The adapter runs through `npx`, so warnings appear every time; noise is never collected.
const STDERR_NOISE = [
  /^npm (warn|notice)\b/i,
  /^npx:/i,
  /^\s*$/,
  /^[\s.%|/\\\-()0-9]*$/,
];

export function isDiagnosticStderr(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return !STDERR_NOISE.some((pattern) => pattern.test(text));
}

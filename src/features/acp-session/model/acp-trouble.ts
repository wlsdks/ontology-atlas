/**
 * Translates what the adapter emitted into one readable sentence plus a next step. Only
 * known shapes are translated; anything else stays "an unknown problem" with the original
 * folded away, since a plausible mistranslation is worse than the searchable original.
 */

type AcpTroubleKind = 'limit' | 'auth' | 'install' | 'timeout' | 'launch' | 'network' | 'unknown';

export interface AcpTrouble {
  kind: AcpTroubleKind;
  /** The original. Folded away, shown only under "details". */
  detail: string;
}

/**
 * The login expired — this tool's most common failure. The wording differs per adapter, so several
 * shapes are matched (measured: claude gives `authentication_failed`, some tools
 * `Authentication required`).
 */
// The tool's own plan limit, not the app: retrying cannot work until the hour in the
// message.
const LIMIT = /rate[_ ]?limit|session limit|usage limit|quota|too many requests|429/i;
const AUTH = /authentication[_ ]?(failed|required)|oauth|not logged ?in|unauthorized|401/i;
/**
 * An interrupted first download leaves a half-built npx cache. Matches an `_npx/<hex>` path
 * or npm's "could not read package.json". The app self-heals it
 * (`src-tauri/src/acp/npx_cache.rs`), so the next step is a new conversation.
 */
const INSTALL = /_npx[\\/][0-9a-f]{4,16}|could not read package\.json/i;
/** It hit the ceiling we set. */
const TIMEOUT = /acp-timeout|timed? ?out|ETIMEDOUT/i;
/** It never even started — an install or path problem. */
const LAUNCH = /ENOENT|command not found|spawn|cli-missing|node-missing|npx-missing|binary-missing/i;
/** It could not reach out. */
const NETWORK = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|fetch failed|offline/i;

/**
 * `diagnostics` are stderr lines and count only for the install case, where the error string
 * says nothing (`acp session closed`). Other kinds would misclassify on a passing word like
 * "network".
 */
export function readAcpTrouble(raw: string, diagnostics: readonly string[] = []): AcpTrouble {
  const detail = raw.trim();
  const stderrClues = diagnostics.join('\n');
  // The order is the contract: the more **specific** comes first. Even when an authentication failure
  // message happens to contain a word like "network", reading it as an authentication problem is what
  // gives the user the right next step. Install must come before launch — for the same ENOENT, "a
  // half-built cache" and "the tool is missing" have different next steps for the user.
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

/**
 * Is this stderr line worth carrying? The adapter runs through `npx`, so warnings appear
 * every time; noise is never collected, and collected lines show only when something breaks.
 */
const STDERR_NOISE = [
  /^npm (warn|notice)\b/i,
  /^npx:/i,
  /^\s*$/,
  // Install progress — lines containing only dots, percentages, or a spinner.
  /^[\s.%|/\\\-()0-9]*$/,
];

export function isDiagnosticStderr(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return !STDERR_NOISE.some((pattern) => pattern.test(text));
}

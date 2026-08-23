/**
 * Translates what the adapter emitted into **one sentence a person can read.**
 *
 * Why (owner's screen, 2026-08-16). The conversation window showed the user this verbatim:
 *
 * ```
 * An error occurred: {"code":-32603,"message":"Internal error: Failed to
 * authenticate: OAuth session expired and could not be refreshed",
 * "data":{"errorKind":"authentication_failed"}}
 * ```
 *
 * Owner: *"how is a user supposed to understand this?"* (how is a user supposed to understand this?).
 * Correct — that line states neither **what happened** nor **what to do** in human words. All it
 * contains is the material we use for debugging.
 *
 * **What is recognized, and what is called unknown.** Only known shapes are translated. What is not
 * recognized is left as "an unknown problem" with the original folded away, **rather than invented** —
 * a plausible mistranslation is worse than the original (the original can at least be searched).
 *
 * Every kind carries **what to do next**. An error screen with nothing to do is a dead end, and this
 * repository counts that as a defect.
 */

export type AcpTroubleKind = 'auth' | 'install' | 'timeout' | 'launch' | 'network' | 'unknown';

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
const AUTH = /authentication[_ ]?(failed|required)|oauth|not logged ?in|unauthorized|401/i;
/**
 * The first download was interrupted and it hit a half-built npx cache (owner's real machine,
 * 2026-08-19). The shapes matched are the measured stderr verbatim:
 *
 * ```
 * npm error code ENOENT
 * npm error path /Users/…/.npm/_npx/8757e2301903ae53/package.json
 * npm error enoent Could not read package.json …
 * ```
 *
 * An `_npx/<16 hex>` path, or npm's "could not read package.json" — both appear only in this
 * failure. The app deletes that entry and re-downloads on the next start (the npx cache self-heal in
 * `src-tauri/src/acp.rs`), so the next step is "new conversation".
 */
const INSTALL = /_npx[\\/][0-9a-f]{4,16}|could not read package\.json/i;
/** It hit the ceiling we set. */
const TIMEOUT = /acp-timeout|timed? ?out|ETIMEDOUT/i;
/** It never even started — an install or path problem. */
const LAUNCH = /ENOENT|command not found|spawn|cli-missing|node-missing|npx-missing|binary-missing/i;
/** It could not reach out. */
const NETWORK = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|fetch failed|offline/i;

/**
 * @param diagnostics Lines the adapter left on stderr. They take part **only in the install
 * verdict** — in that failure the error string says nothing (`acp session closed`) and every clue was
 * on stderr (measured). Judging the other kinds by stderr too would misclassify on a passing word
 * (such as "network"), so it is not widened.
 */
export function readAcpTrouble(raw: string, diagnostics: readonly string[] = []): AcpTrouble {
  const detail = raw.trim();
  const stderrClues = diagnostics.join('\n');
  // The order is the contract: the more **specific** comes first. Even when an authentication failure
  // message happens to contain a word like "network", reading it as an authentication problem is what
  // gives the user the right next step. Install must come before launch — for the same ENOENT, "a
  // half-built cache" and "the tool is missing" have different next steps for the user.
  const kind: AcpTroubleKind = AUTH.test(detail)
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
 * Is this line worth carrying as a diagnostic — **or is it noise?**
 *
 * The moment stderr went on screen, the first thing the user saw was this (2026-08-16):
 *
 * ```
 * npm warn Unknown env config "_jsr-registry". This will stop working in the
 * next major version of npm. See `npm help npmrc` for supported config options.
 * ```
 *
 * The adapter is launched through `npx`, so lines like this appear **every time**, including when
 * nothing is wrong. So two paragraphs of English warnings sat permanently at the top of the
 * conversation window — eating the screen rather than diagnosing anything.
 *
 * Two rules settle it: ① obvious noise is never collected ② what is collected is shown **only when
 * something breaks** (when those lines are the only clue).
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

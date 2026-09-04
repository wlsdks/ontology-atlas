/**
 * The **human words** for the "working mode" list — the name and a one-line description.
 *
 * ## Why (owner report, 2026-08-17)
 *
 * The list read: `Auto · Unverified` / `Manual` / `Plan Mode` / `Don't Ask · Unverified`. Every name
 * was English, and the descriptions were attached **only to the two we had not measured** — while the
 * two actually worth choosing (`Manual`, `Plan Mode`) had not one character on screen saying how they
 * differ.
 *
 * ## Where the names come from
 *
 * The adapter emits them with the session. The values were confirmed by measurement (the adapter
 * source's mode definitions):
 *
 * | id | adapter name | adapter description |
 * |---|---|---|
 * | `default` | Manual | Standard behavior, prompts for dangerous operations |
 * | `plan` | Plan Mode | Planning mode, no actual tool execution |
 * | `auto` | Auto | Use a model classifier to approve/deny permission prompts |
 * | `dontAsk` | Don't Ask | Don't prompt for permissions, deny if not pre-approved |
 * | `acceptEdits` | Accept Edits | Auto-accept file edit operations |
 * | `bypassPermissions` | Bypass Permissions | Bypass all permission checks |
 * | `read-only` | Read-only | (codex) |
 *
 * `acceptEdits` and `bypassPermissions` never reach the screen at all — they let things through
 * without asking, so `mode-safety.ts` filters them out. **`auto` joined them on 2026-09-05**: read
 * from `claude-agent-acp` 0.74.0, it is advertised to every session and its approvals never arrive
 * as an ACP permission request. Its words are kept here rather than deleted because a person can
 * still be resuming an older adapter, and because a name that is only sometimes translated is worse
 * than one always translated — the filter, not this table, decides what is offered.
 *
 * ## The rule: translate only what is known
 *
 * An id absent from the list keeps **the adapter's name verbatim** with no description attached.
 * Inventing a plausible line for an unknown mode makes that line a promise we never verified. The
 * "unverified" marker is a **different axis** — knowing the name and having measured whether it asks
 * before working outside the folder are separate things.
 */

/** Only these ids are translated into human words — confirmed from the adapter source. */
export const MEASURED_MODE_IDS = ['default', 'plan', 'auto', 'dontask', 'read-only'] as const;

export type MeasuredModeId = (typeof MEASURED_MODE_IDS)[number];

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

/**
 * This mode's translation key, or `null` (use the adapter's name verbatim).
 *
 * It uses two keys, `modeName.<id>` and `modeHint.<id>`. Ids are lowercased because the notation
 * differs per adapter (`dontAsk`, `read-only`).
 */
export function modeCopyKey(modeId: unknown): MeasuredModeId | null {
  const key = normalize(modeId);
  return (MEASURED_MODE_IDS as readonly string[]).includes(key)
    ? (key as MeasuredModeId)
    : null;
}

/**
 * **The app-owned write checkpoint.**
 *
 * ⚠️ Why this file exists (2026-08-24). The permission gate an agent shows is the
 * *agent's* gate, and it does not necessarily cover this server. Measured on the
 * installed `1.0.0-rc.10`: a Codex session running in `read-only` mode blocked
 * direct file writes, yet a self-registered Atlas `add_relation` changed the vault
 * with **no permission request and no review card**. Codex's `--ask-for-approval`
 * documents its scope plainly — it decides "when the model requires human approval
 * before executing **a command**" — so MCP tool calls were never in that scope. The
 * screen promised a gate the wire did not have, and Codex was removed from in-app
 * chat because of it (`docs/DECISIONS.md` 2026-08-24 (111)).
 *
 * That record also wrote down what would earn Codex its way back: *"an app-owned
 * MCP proxy or server capability token reliably pauses every Codex Atlas write."*
 * This is that checkpoint, and it lives where it belongs — **in the server that
 * performs the write**, not in a third party's config. A gate the vault owns holds
 * for every client that ever connects, not just the one that was measured.
 *
 * The mechanism is MCP elicitation (`elicitation/create`): before a write tool
 * touches disk, the server asks the connected client to put the question in front
 * of a person. The request is deliberately a **message-only form**. That is the
 * interoperable binary-permission shape: `codex-acp` forwards it into ACP
 * `session/request_permission`, while a form-capable MCP client can still render
 * the same question. One server-side gate therefore reaches both.
 *
 * **Fail closed.** If the gate is on and the client never declared the
 * `elicitation` capability, the write is refused rather than performed silently.
 * A checkpoint that waves traffic through when it cannot see is not a checkpoint;
 * that is precisely the failure this file was written to end.
 */

/** Same vocabulary as `OATLAS_READ_ONLY` so the two switches read alike. */
export function parseConsentEnv(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/**
 * A short, human-readable line naming what is about to change. It is the whole
 * question a person answers, so it must say the vault-visible effect — not the
 * tool's internal argument shape.
 */
export function describeWrite(toolName, args) {
  const a = args && typeof args === 'object' ? args : {};
  const slug = typeof a.slug === 'string' ? a.slug : null;
  const from = typeof a.from === 'string' ? a.from : null;
  const to = typeof a.to === 'string' ? a.to : null;
  const count = (key) => (Array.isArray(a[key]) ? a[key].length : null);

  switch (toolName) {
    case 'add_concept':
      return slug ? `Create concept ${slug}` : 'Create one concept';
    case 'add_concepts': {
      const n = count('concepts');
      return n === null ? 'Create concepts' : `Create ${n} concept(s)`;
    }
    case 'add_relation':
      return from && to ? `Link ${from} → ${to}` : 'Add one relation';
    case 'add_relations': {
      const n = count('relations');
      return n === null ? 'Add relations' : `Add ${n} relation(s)`;
    }
    case 'remove_relation':
      return from && to ? `Remove the link ${from} → ${to}` : 'Remove one relation';
    case 'replace_relation':
      return from && to ? `Replace the link ${from} → ${to}` : 'Replace one relation';
    case 'patch_concept':
      return slug ? `Edit concept ${slug}` : 'Edit one concept';
    case 'rename_concept':
      return from && to ? `Rename ${from} → ${to}` : 'Rename one concept';
    case 'reclassify_concept':
      return slug ? `Change the kind of ${slug}` : 'Change one concept kind';
    case 'merge_concepts':
      return from && to ? `Merge ${from} into ${to}` : 'Merge concepts';
    case 'delete_concept':
      return slug ? `Delete concept ${slug}` : 'Delete one concept';
    case 'absorb_document':
      return 'Absorb a document into typed nodes';
    case 'connect_project_source':
      return 'Connect a source folder to this vault';
    case 'disconnect_project_source':
      return 'Disconnect a source folder from this vault';
    case 'git_snapshot':
      return 'Commit the vault';
    case 'finalize_project_meaning':
      return 'Write the project meaning receipt';
    case 'index_project':
      return 'Write an index of the connected source';
    default:
      return `Run ${toolName}`;
  }
}

/**
 * A dry run asks for nothing: it reports a plan and leaves the disk alone, so
 * pausing it would train people to click through the very card that matters.
 * The flag name differs per tool, so both spellings are honoured.
 */
export function isDryRun(args) {
  if (!args || typeof args !== 'object') return false;
  return args.dryRun === true || args.dry_run === true;
}

export const CONSENT_DECLINED = 'consent-declined';
export const CONSENT_UNAVAILABLE = 'consent-unavailable';

/**
 * Ask the connected client to put this write in front of a person.
 *
 * `server` is the low-level SDK `Server`; `elicitInput` is its push-style
 * server→client request. Returns `{ allowed }` and, when refused, a `reason` the
 * caller turns into an error the agent can read and act on.
 */
export async function requestWriteConsent({ server, toolName, args, enabled }) {
  if (!enabled) return { allowed: true, asked: false };
  if (isDryRun(args)) return { allowed: true, asked: false };

  const capabilities =
    typeof server?.getClientCapabilities === 'function' ? server.getClientCapabilities() : undefined;
  if (!capabilities || !capabilities.elicitation) {
    return {
      allowed: false,
      asked: false,
      reason: CONSENT_UNAVAILABLE,
      message:
        `This vault requires a human decision before any write, and this client did not offer ` +
        `a way to ask (no "elicitation" capability was declared at initialize). No change was made. ` +
        `Use a client that can surface permission requests, or unset OATLAS_WRITE_CONSENT for a ` +
        `vault where the client owns the gate.`,
    };
  }

  const summary = describeWrite(toolName, args);
  let result;
  try {
    result = await server.elicitInput({
      mode: 'form',
      /*
       * Compatibility hint, not authorization (installed Codex ACP 1.8.0, 2026-09-03).
       *
       * Codex already emitted this MCP call's exact structured tool update before the server asks.
       * With this namespaced metadata it verifies that exactly one call for this thread/server is
       * pending, then carries the real call id into ACP `session/request_permission`. That lets the
       * app bind the question to `{server, tool, arguments}` by exact identity instead of guessing
       * from event order. Other MCP clients ignore unknown `_meta`; every client still needs the
       * person's explicit `accept` below.
       */
      _meta: { codex_approval_kind: 'mcp_tool_call' },
      /*
       * ⚠️ **Message-only is a compatibility contract, not a missing form** (installed
       * acceptance, 2026-09-03).
       *
       * The earlier request carried an optional `confirm` property. That worked with an older
       * bridge, but `codex-acp` 1.8.0 forwards a non-empty form only when the ACP client advertises
       * generic form elicitation. Atlas intentionally implements the narrower
       * `session/request_permission` capability, so the adapter returned `action: 'cancel'` before
       * the card could appear. Its documented fallback is an object schema with zero properties.
       *
       * This question has no data to collect: allow/decline/cancel is the data. Keeping the schema
       * empty lets permission-only clients render the same binary decision without making Atlas
       * claim a generic form renderer. A checkpoint that cannot be passed is a wall, not a gate.
       */
      message: `${summary}. Apply this change to the vault?`,
      requestedSchema: {
        type: 'object',
        properties: {},
      },
    });
  } catch (error) {
    // A transport error, a timeout, or a client that advertised the capability
    // and then refused the method all land here. None of them is a yes.
    return {
      allowed: false,
      asked: true,
      reason: CONSENT_UNAVAILABLE,
      message:
        `Asking for permission failed (${error?.message ?? 'unknown error'}). No change was made.`,
    };
  }

  /*
   * **`action` is the answer.**
   *
   * `accept` is the MCP elicitation spelling of "the person said yes" — `decline` and `cancel` are
   * the other two, and neither reaches here as an approval. A defensive `confirm:false` from an
   * older form client is still a no, and it wins. Absence is
   * not a no — see the schema comment above for what absence actually measured as.
   */
  const answered = result?.content?.confirm;
  const accepted = result?.action === 'accept' && answered !== false;
  if (accepted) return { allowed: true, asked: true };

  return {
    allowed: false,
    asked: true,
    reason: CONSENT_DECLINED,
    message: `The change was not approved (${result?.action ?? 'no answer'}). No change was made: ${summary}.`,
  };
}

/**
 * The app-owned write checkpoint. An agent's own permission gate need not cover
 * this server (a read-only Codex session changed the vault through add_relation
 * with no card), so the server that performs the write asks, for every client
 * (`docs/DECISIONS.md`, record 111). Before a write touches disk, MCP elicitation
 * (`elicitation/create`) asks the client to put a message-only question to a
 * person; `codex-acp` forwards it to ACP `session/request_permission`. Fails
 * closed: with the gate on and no `elicitation` capability, the write is refused.
 */

/** Same vocabulary as `OATLAS_READ_ONLY` so the two switches read alike. */
export function parseConsentEnv(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** One line naming the vault-visible effect: the whole question a person answers. */
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
 * A dry run changes nothing, so it asks nothing: pausing it would train people
 * to click through the card that matters. Both flag spellings are honoured.
 */
export function isDryRun(args) {
  if (!args || typeof args !== 'object') return false;
  return args.dryRun === true || args.dry_run === true;
}

export const CONSENT_DECLINED = 'consent-declined';
export const CONSENT_UNAVAILABLE = 'consent-unavailable';

/**
 * Asks the connected client to put this write before a person, through the
 * low-level SDK `Server`'s `elicitInput`. Returns `{ allowed }`, plus a `reason`
 * the agent can act on when refused.
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
       * A compatibility hint, not authorization: Codex ACP uses this namespaced
       * metadata to carry the real call id into `session/request_permission`, so the
       * app binds the question to `{server, tool, arguments}` by identity rather than
       * event order. Other clients ignore unknown `_meta`; every client still needs
       * the person's explicit `accept`.
       */
      _meta: { codex_approval_kind: 'mcp_tool_call' },
      /*
       * Message-only on purpose: `codex-acp` forwards a non-empty form only to a
       * client advertising generic form elicitation, and Atlas implements
       * only `session/request_permission`, so a form would be cancelled before the card
       * appears. Allow, decline or cancel is the whole answer.
       */
      message: `${summary}. Apply this change to the vault?`,
      requestedSchema: {
        type: 'object',
        properties: {},
      },
    });
  } catch (error) {
    // A transport error, a timeout or a refused method: none of them is a yes.
    return {
      allowed: false,
      asked: true,
      reason: CONSENT_UNAVAILABLE,
      message:
        `Asking for permission failed (${error?.message ?? 'unknown error'}). No change was made.`,
    };
  }

  /*
   * The `action` is the answer: only `accept` approves. A `confirm:false` from an older
   * form client is still a no, and wins; an absent `confirm` is not a no.
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

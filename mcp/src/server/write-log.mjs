/**
 * One local audit line per successful write. Schema and rationale live in
 * `activity-log.mjs`; this file decides what each write tool contributes.
 *
 * Dry runs and invalid-only batches are not recorded — the log carries what
 * happened, nothing else — and a failed append never affects the write result.
 */
import { server } from './instance.mjs';
import {
  appendActivityEntry,
  buildActivityEntry,
  resolveAgentName,
} from '../activity-log.mjs';
import { VAULT_ROOT } from './runtime.mjs';

// ── Activity log — one local audit line per successful write (best-effort) ──
// Schema and rationale: mcp/src/activity-log.mjs. Dry runs (no change) and
// invalid-only batches are not recorded — the audit log carries what happened,
// nothing else. A failed append never affects the write result.
function summarizeWrite(name, args, result) {
  switch (name) {
    case 'add_concept':
      return { target: args.slug, summary: `add_concept ${args.kind}:${args.slug}` };
    case 'add_relation':
      return { target: args.from, summary: `${args.from} --${args.type}--> ${args.to}`, why: args.why ?? null };
    case 'remove_relation':
      return result?.dryRun ? null : { target: args.from, summary: `remove ${args.from} --${args.type}--> ${args.to}` };
    case 'replace_relation':
      return result?.dryRun ? null : { target: args.from, summary: `replace ${args.from} --${args.oldType}--> ${args.oldTo} with --${args.newType}--> ${args.newTo}`, why: args.why ?? null };
    case 'add_concepts': {
      const okRows = (result?.concepts ?? []).filter((row) => row?.ok).length;
      return okRows > 0 ? { target: '(batch)', summary: `add_concepts ${okRows} rows written` } : null;
    }
    case 'add_relations': {
      const rows = result?.relations ?? [];
      const okRows = rows.filter((row) => row?.ok).length;
      if (okRows === 0) return null;
      /*
       * ⚠️ **Do not drop the reason** (caught by the steward seat, 2026-08-16).
       *
       * Batch rows carry `why` too, and the runtime *requires* it for
       * `depends_on`. This branch returned only `{ target, summary }`, so the
       * reason reached the frontmatter but disappeared from the activity record.
       *
       * The consequence was observed: all 15 activity lines in a live vault read
       * `why: null`, two of them from exactly this path — and "the record has no
       * reasons" nearly became evidence for an unrelated conclusion.
       *
       * Rows can carry different reasons, so collect **only the reasons of rows
       * that succeeded**. Repeats collapse to one entry: ten rows sharing a
       * reason would otherwise print it ten times and become unreadable.
       */
      // ⚠️ Numbering **after** filtering desynchronises rows from the input.
      // Keep the original order and read the reason only off successful rows.
      const reasons = [
        ...new Set(
          rows
            .map((row, index) => (row?.ok ? args.relations?.[index]?.why : null))
            .filter((why) => typeof why === 'string' && why.trim().length > 0)
            .map((why) => why.trim()),
        ),
      ];
      return {
        target: '(batch)',
        summary: `add_relations ${okRows} rows written`,
        why: reasons.length > 0 ? reasons.join(' · ') : null,
      };
    }
    case 'patch_concept':
      return { target: args.slug, summary: `patch_concept ${args.slug}` };
    case 'connect_project_source':
      return result?.changed
        ? { target: result.projectSlug, summary: `connect_project_source ${result.mode} ${result.binding?.kind ?? ''}`.trim() }
        : null;
    case 'disconnect_project_source':
      return result?.changed
        ? { target: result.projectSlug, summary: `disconnect_project_source ${result.removed} removed` }
        : null;
    case 'rename_concept':
      return result?.dryRun ? null : { target: args.newSlug, summary: `rename ${args.oldSlug} → ${args.newSlug}` };
    case 'reclassify_concept':
      return result?.dryRun ? null : { target: result?.newSlug ?? args.slug, summary: `reclassify ${args.slug} → ${args.newKind}` };
    case 'merge_concepts':
      return result?.dryRun ? null : { target: args.intoSlug, summary: `merge ${args.fromSlug} → ${args.intoSlug}` };
    case 'delete_concept':
      return result?.dryRun ? null : { target: args.slug, summary: `delete ${args.slug}` };
    case 'absorb_document':
      return result?.dryRun ? null : { target: args.filePath ?? '(doc)', summary: `absorb ${args.filePath ?? ''}`.trim() };
    default:
      return null;
  }
}

function logWrite(name, args, result) {
  try {
    const summarized = summarizeWrite(name, args, result);
    if (summarized) {
      appendActivityEntry(
        VAULT_ROOT,
        buildActivityEntry({
          tool: name,
          target: summarized.target,
          summary: summarized.summary,
          why: summarized.why ?? null,
          // Heartbeat (deliberate registration) > the connect greeting's
          // clientInfo.name (automatic) > null. Claude Code and Codex sessions
          // that connect without registering now leave a name behind too.
          agent: resolveAgentName(VAULT_ROOT, server.getClientVersion?.()),
        }),
      );
    }
  } catch {
    /* The audit log is a side effect — it must never damage the write result */
  }
  return result;
}

export {
  summarizeWrite,
  logWrite,
};

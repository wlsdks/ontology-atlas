/**
 * One local audit line per successful write, and one map analysis line per write
 * that changed a concept. Schemas live in `activity-log.mjs` and
 * `map-analysis-log.mjs`; this file decides what each write tool contributes.
 *
 * Dry runs and invalid-only batches are not recorded — the logs carry what
 * happened, nothing else — and a failed append never affects the write result.
 */

import {
  appendActivityEntry,
  buildActivityEntry,
  resolveAgentName,
} from '../vault/sidecar/activity-log.mjs';
import { createMapAnalysisRecorder } from '../vault/sidecar/map-analysis-log.mjs';
import { server } from './instance.mjs';
import { recordWriteInMapAnalysis } from './map-analysis-effect.mjs';
import { createMapAnalysisMeasure, MEASURED_COVERAGE } from './map-analysis-measure.mjs';
import { VAULT_ROOT } from './runtime.mjs';

const mapAnalysis = createMapAnalysisRecorder({ vaultRoot: VAULT_ROOT });
const measureMapShare = createMapAnalysisMeasure();

function summarizeWrite(name, args, result) {
  switch (name) {
    case 'add_concept':
      return { target: args.slug, summary: `add_concept ${args.kind}:${args.slug}` };
    case 'add_relation':
      return { target: args.from, summary: `${args.from} --${args.type}--> ${args.to}`, why: args.why ?? null };
    case 'remove_relation':
      if (result?.dryRun) return null;
      // A replacement is logged as the one edit it is, under the name it always had, with the reason it carries.
      return args.replaceWith
        ? { tool: 'replace_relation', target: args.from, summary: `replace ${args.from} --${args.type}--> ${args.to} with --${args.replaceWith.type}--> ${args.replaceWith.to}`, why: args.replaceWith.why ?? null }
        : { target: args.from, summary: `remove ${args.from} --${args.type}--> ${args.to}` };
    case 'add_concepts': {
      const okRows = (result?.concepts ?? []).filter((row) => row?.ok);
      if (okRows.length === 0) return null;
      const only = okRows.length === 1 ? okRows[0].slug : null;
      return { target: only ?? '(batch)', summary: `add_concepts ${okRows.length} rows written` };
    }
    case 'add_relations': {
      const rows = result?.relations ?? [];
      const okRows = rows.filter((row) => row?.ok).length;
      if (okRows === 0) return null;
      // Keep each batch row's `why` in the activity record, from successful rows only
      // and with repeats collapsed, or the reason reaches frontmatter but not the log.
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
    case 'finalize_project_meaning':
      return result?.bodyWritten
        ? { target: args.projectSlug, summary: `finalize_project_meaning ${args.projectSlug} competency answers` }
        : null;
    case 'connect_project_source':
      return result?.changed
        ? { target: result.projectSlug, summary: `connect_project_source ${result.mode} ${result.binding?.kind ?? ''}`.trim() }
        : null;
    case 'disconnect_project_source':
      return result?.changed
        ? { target: result.projectSlug, summary: `disconnect_project_source ${result.removed} removed` }
        : null;
    case 'rename_concept':
      if (result?.dryRun) return null;
      return args.newKind === undefined
        ? { target: args.newSlug, summary: `rename ${args.oldSlug} → ${args.newSlug}` }
        : { tool: 'reclassify_concept', target: result?.newSlug ?? args.oldSlug, summary: `reclassify ${args.oldSlug} → ${args.newKind}` };
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
    if (!summarized) return result;
    // Heartbeat (deliberate registration) > the connect greeting's clientInfo.name
    // (automatic) > null, so sessions that never register still leave a name.
    const agent = resolveAgentName(VAULT_ROOT, server.getClientVersion?.());
    appendActivityEntry(
      VAULT_ROOT,
      buildActivityEntry({ tool: summarized.tool ?? name, target: summarized.target, summary: summarized.summary, why: summarized.why ?? null, agent }),
    );
    recordWriteInMapAnalysis({
      recorder: mapAnalysis,
      measureShare: measureMapShare,
      name,
      args,
      result,
      agent,
      measured: result[MEASURED_COVERAGE],
    });
  } catch {
    /* Both logs are side effects — they must never damage the write result */
  }
  return result;
}

export {
  logWrite,
  summarizeWrite,
};

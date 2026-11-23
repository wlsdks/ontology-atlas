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
import { createMapAnalysisMeasure, MEASURED_COVERAGE } from './map-analysis-measure.mjs';
import { VAULT_ROOT } from './runtime.mjs';

/** The app names every request of one press with this id, so they read as one analysis. */
const PRESS_ANALYSIS_ENV = 'OATLAS_MAP_ANALYSIS_ID';

const mapAnalysis = createMapAnalysisRecorder({
  vaultRoot: VAULT_ROOT,
  pressAnalysisId: process.env[PRESS_ANALYSIS_ENV] ?? null,
});
const measureMapShare = createMapAnalysisMeasure();

function slugsOf(values) {
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

/**
 * The concepts one successful write added, changed or removed, by slug, for the
 * map analysis record; empty for a write that changed none (a dry run, a relation
 * that already existed, a source binding, a refused batch).
 */
function conceptEffect(name, args, result) {
  const none = { added: [], changed: [], removed: [] };
  if (!result || result.dryRun === true || result.changed === false) return none;
  switch (name) {
    case 'add_concept':
      return { ...none, added: slugsOf([result.slug ?? args.slug]) };
    case 'add_concepts':
      return { ...none, added: slugsOf((result.concepts ?? []).filter((row) => row?.ok && row.changed !== false).map((row) => row.slug)) };
    case 'add_relation':
    case 'remove_relation':
    case 'replace_relation':
      return { ...none, changed: slugsOf([result.from ?? args.from]) };
    case 'add_relations':
      return { ...none, changed: slugsOf((result.relations ?? []).filter((row) => row?.ok && row.changed !== false).map((row) => row.from)) };
    case 'patch_concept':
      return { ...none, changed: slugsOf([args.slug]) };
    case 'finalize_project_meaning':
      return result.bodyWritten ? { ...none, changed: slugsOf([args.projectSlug]) } : none;
    case 'rename_concept':
      return { ...none, changed: slugsOf([result.newSlug ?? args.newSlug]) };
    case 'reclassify_concept':
      return { ...none, changed: slugsOf([result.newSlug ?? args.slug]) };
    case 'merge_concepts':
      return { added: [], changed: slugsOf([args.intoSlug]), removed: slugsOf([args.fromSlug]) };
    case 'delete_concept':
      return { ...none, removed: slugsOf([args.slug]) };
    case 'absorb_document':
      return { ...none, added: slugsOf((result.written ?? []).map((entry) => entry?.slug)) };
    default:
      return none;
  }
}

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
    if (!summarized) return result;
    // Heartbeat (deliberate registration) > the connect greeting's clientInfo.name
    // (automatic) > null, so sessions that never register still leave a name.
    const agent = resolveAgentName(VAULT_ROOT, server.getClientVersion?.());
    appendActivityEntry(
      VAULT_ROOT,
      buildActivityEntry({ tool: name, target: summarized.target, summary: summarized.summary, why: summarized.why ?? null, agent }),
    );
    mapAnalysis.record({
      effect: conceptEffect(name, args, result),
      agent,
      measure: () => measureMapShare(result[MEASURED_COVERAGE]),
    });
  } catch {
    /* Both logs are side effects — they must never damage the write result */
  }
  return result;
}

export {
  logWrite,
};

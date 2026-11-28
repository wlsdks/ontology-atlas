/**
 * What each write tool contributes to the map analysis record: the concepts it
 * added, changed or removed, by slug, and whether it can move the share at all.
 */

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
      return { ...none, changed: slugsOf([result.from ?? args.from]) };
    case 'add_relations':
      return { ...none, changed: slugsOf((result.relations ?? []).filter((row) => row?.ok && row.changed !== false).map((row) => row.from)) };
    case 'patch_concept':
      return { ...none, changed: slugsOf([args.slug]) };
    case 'finalize_project_meaning':
      return result.bodyWritten ? { ...none, changed: slugsOf([args.projectSlug]) } : none;
    case 'rename_concept':
      return { ...none, changed: slugsOf([result.newSlug ?? args.newSlug]) };
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

const RELATION_TOOLS = new Set(['add_relation', 'add_relations', 'remove_relation']);

/**
 * Whether a write can move the share on the map: a relation changes no concept's
 * path, title or body, which are all the share reads, so it is never measured.
 */
function writeMovesShare(name) {
  return !RELATION_TOOLS.has(name);
}

/**
 * Records one successful write in the map analysis record: what it did, and the
 * share measured only for a write that can move it (`measured` is what the write
 * itself measured, when it did).
 */
export function recordWriteInMapAnalysis({ recorder, measureShare, name, args, result, agent, measured }) {
  return recorder.record({
    effect: conceptEffect(name, args, result),
    agent,
    measure: writeMovesShare(name) ? () => measureShare(measured) : null,
  });
}

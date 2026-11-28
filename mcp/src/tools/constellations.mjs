import {
  getSavedConstellation,
  listSavedConstellations,
} from '../library/constellations.mjs';
import { nodeUidIssue } from '../schema.mjs';
import { VAULT_ROOT } from '../server/runtime.mjs';
import {
  requireNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
} from '../server/validate.mjs';
import { loadVaultDocs } from '../vault/documents/document-cache.mjs';

/** One saved constellation by `id`, or the list of them when `id` is omitted. */
function getConstellationTool({
  id,
  offset = 0,
  limit = 50,
  relationLimit,
  dependencyLimit,
} = {}) {
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 100 });
  requireOptionalPositiveInteger(relationLimit, 'relationLimit', { max: 200 });
  requireOptionalPositiveInteger(dependencyLimit, 'dependencyLimit', { max: 200 });
  if (id === undefined) {
    if (relationLimit !== undefined || dependencyLimit !== undefined) {
      throw new Error('relationLimit and dependencyLimit must be omitted without id: they bound the relations of one constellation.');
    }
    return listSavedConstellations({ vaultRoot: VAULT_ROOT, offset, limit });
  }
  requireNonBlankString(id, 'id');
  const issue = nodeUidIssue(id);
  if (issue) throw new Error(`id ${issue}`);
  return getSavedConstellation({
    vaultRoot: VAULT_ROOT,
    id,
    docs: loadVaultDocs(VAULT_ROOT),
    offset,
    limit,
    relationLimit: relationLimit ?? 100,
    dependencyLimit: dependencyLimit ?? 100,
  });
}

export { getConstellationTool };

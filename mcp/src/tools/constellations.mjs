import {
  getSavedConstellation,
  listSavedConstellations,
} from '../constellations.mjs';
import { nodeUidIssue } from '../schema.mjs';
import { VAULT_ROOT } from '../server/runtime.mjs';
import {
  requireNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
} from '../server/validate.mjs';
import { loadVaultDocs } from '../vault.mjs';

function listConstellationsTool({ offset = 0, limit = 50 } = {}) {
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 100 });
  return listSavedConstellations({ vaultRoot: VAULT_ROOT, offset, limit });
}

function getConstellationTool({
  id,
  offset = 0,
  limit = 50,
  relationLimit = 100,
  dependencyLimit = 100,
} = {}) {
  requireNonBlankString(id, 'id');
  const issue = nodeUidIssue(id);
  if (issue) throw new Error(`id ${issue}`);
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 100 });
  requireOptionalPositiveInteger(relationLimit, 'relationLimit', { max: 200 });
  requireOptionalPositiveInteger(dependencyLimit, 'dependencyLimit', { max: 200 });
  return getSavedConstellation({
    vaultRoot: VAULT_ROOT,
    id,
    docs: loadVaultDocs(VAULT_ROOT),
    offset,
    limit,
    relationLimit,
    dependencyLimit,
  });
}

export {
  getConstellationTool,
  listConstellationsTool,
};
